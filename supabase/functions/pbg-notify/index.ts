// PBG email automation (Supabase Edge Function, Deno)
// Called by the database every time an order gets a new history entry.
// Sends: customer receipt + stage updates, PBG new-order copy, Restored Rarity prep notices.
//
// Secrets (Supabase > Edge Functions > Secrets, or `supabase secrets set ...`):
//   RESEND_API_KEY       from resend.com
//   PBG_NOTIFY_SECRET    any long random string; also stored in app_settings.notify_secret
//   FROM_EMAIL           e.g. "PBG Cards & Collectibles <orders@yourpbgdomain.com>" (domain verified in Resend)
//   REPLY_TO             e.g. the shop's Gmail, where customer replies should go
//   SHOP_EMAIL           gets a copy of every new order (comma-separate for several)
//   PARTNER_EMAIL        Restored Rarity, gets orders with cleaning / evaluation / repair
//   STATUS_URL           public status page, e.g. https://yourpbgdomain.com/status.html
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// Deploy:  supabase functions deploy pbg-notify --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const SHOP = { name: "PBG Cards & Collectibles HTX", addr: "25170 I-45 N, Unit 9, Spring, TX 77386", phone: "832-610-7081", hours: "Open daily, 11 AM to 7 PM" };
const GRADER_NAMES: Record<string, string> = { BGS: "Beckett" };
const gname = (g: string) => GRADER_NAMES[g] ?? g;
const h = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: unknown) => "$" + (Number(n) || 0).toFixed(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Stage = { grader: string; position: number; code: string; label: string; customer_text: string; notify_customer: boolean };

function stageList(order: any, rows: Stage[]) {
  const by = (g: string) => rows.filter((r) => r.grader === g).sort((a, b) => a.position - b.position);
  let list = by("*pre");
  if (order.has_prep) list = list.concat(by("*partner"));
  if (order.grader && order.grader !== "None") {
    list = list.concat(by("*ship"));
    const own = by(order.grader);
    list = list.concat(own.length ? own : by("*generic"));
  }
  list = list.concat(by("*post"));
  const n = gname(order.grader);
  return list.map((r) => ({ ...r, label: r.label.replaceAll("{grader}", n), customer_text: r.customer_text.replaceAll("{grader}", n) }));
}

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f2f2f2;font-family:Arial,Helvetica,sans-serif;color:#141414">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:24px 0"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#000;padding:18px 24px;color:#fff;font-size:20px;font-weight:900;font-style:italic">PBG <span style="font-size:13px;font-weight:400;font-style:normal;opacity:.75">Cards &amp; Collectibles HTX</span></td></tr>
    <tr><td style="height:4px;background:#E31B23"></td></tr>
    <tr><td style="padding:28px 24px">
      <h1 style="margin:0 0 12px;font-size:24px;font-style:italic">${h(title)}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:18px 24px;background:#fafafa;font-size:13px;color:#666;border-top:1px solid #eee">${h(SHOP.name)}<br>${h(SHOP.addr)}<br>${h(SHOP.phone)}. ${h(SHOP.hours)}</td></tr>
  </table></td></tr></table></body></html>`;
}
const button = (url: string, label: string) =>
  `<p style="margin:22px 0"><a href="${h(url)}" style="background:#E31B23;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:6px;display:inline-block">${h(label)}</a></p>`;

function cardTable(cards: any[], showGrades = false) {
  return `<table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin-top:8px">
    <tr style="background:#141414;color:#fff"><th align="left">Card</th><th align="left">Services</th>${showGrades ? '<th align="left">Grade</th>' : ""}</tr>
    ${cards.map((c) => `<tr style="border-bottom:1px solid #eee"><td>${h([c.year, c.set_name, c.name, c.card_number && "#" + c.card_number, c.variant].filter(Boolean).join(" "))}${c.eval_result ? `<br><span style="color:#5B3FA8;font-size:13px">Evaluation: ${h(c.eval_result)}</span>` : ""}</td>
      <td>${[c.gem && "Gem service + magnetic case", c.mag_case && "Magnetic slab case (at pickup)", c.eval && "Full evaluation", c.clean && "Prep", c.repair && "Repair quote"].filter(Boolean).join(", ") || "None"}</td>
      ${showGrades ? `<td><b>${h(c.grade || "")}</b>${c.cert_number ? `<br><span style="font-size:12px;color:#666">Cert ${h(c.cert_number)}</span>` : ""}</td>` : ""}</tr>`).join("")}
  </table>`;
}

async function send(kind: string, to: string, subject: string, html: string, order: any, eventId: number) {
  const recipients = to.split(",").map((s) => s.trim()).filter(Boolean);
  if (!recipients.length) return;
  // one email per event and kind, even if the function is called twice
  const { data: done } = await db.from("email_log").select("id").eq("event_id", eventId).eq("kind", kind).eq("status", "sent").maybeSingle();
  if (done) return;
  let status = "sent", error: string | null = null;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env("FROM_EMAIL"), to: recipients, subject, html, reply_to: env("REPLY_TO") || undefined }),
    });
    if (!r.ok) { status = "failed"; error = `${r.status} ${await r.text()}`; }
  } catch (e) { status = "failed"; error = String(e); }
  await db.from("email_log").upsert({ order_id: order.id, event_id: eventId, kind, to_email: recipients.join(", "), status, error }, { onConflict: "event_id,kind" });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!env("PBG_NOTIFY_SECRET") || req.headers.get("x-pbg-secret") !== env("PBG_NOTIFY_SECRET")) return new Response("Forbidden", { status: 403 });
  const { event_id } = await req.json().catch(() => ({}));
  if (!event_id) return new Response("Missing event_id", { status: 400 });

  const { data: ev } = await db.from("stage_events").select("*").eq("id", event_id).single();
  if (!ev) return new Response("Event not found", { status: 404 });

  // At check-in the cards are saved right after the order, so wait for them.
  let order: any = null;
  for (let i = 0; i < 8; i++) {
    const { data } = await db.from("orders").select("*, cards(*)").eq("id", ev.order_id).single();
    order = data;
    if (ev.stage !== "checked_in" || (order?.cards?.length ?? 0) > 0) break;
    await sleep(1500);
  }
  if (!order) return new Response("Order not found", { status: 404 });
  order.cards.sort((a: any, b: any) => a.position - b.position);

  const { data: rows } = await db.from("grader_stages").select("*");
  const list = stageList(order, (rows ?? []) as Stage[]);
  const stage = list.find((s) => s.code === ev.stage) ?? { label: ev.stage, customer_text: "" };
  const idx = list.findIndex((s) => s.code === ev.stage);
  const link = `${env("STATUS_URL").replace(/#.*$/, "")}#${order.public_token}`;
  const grading = order.grader === "None" ? "prep only (no grading)" : `${gname(order.grader)} ${order.tier ?? ""}`.trim();
  const note = ev.note && ev.stage !== "checked_in" ? `<p style="background:#f6f6f6;border-left:4px solid #E31B23;padding:12px 14px;margin:16px 0">${h(ev.note)}</p>` : "";

  if (ev.stage === "checked_in") {
    // Customer receipt
    if (order.email && ev.email_customer) {
      await send("receipt", order.email, `Your PBG ticket ${order.ticket}`, layout(`Thanks, ${order.customer_first}. We've got your cards.`, `
        <p>Your ticket number is <b style="font-size:18px">${h(order.ticket)}</b>. Keep this email for pickup.</p>
        <p>${order.cards.length} card${order.cards.length === 1 ? "" : "s"} checked in for ${h(grading)}. Total ${money(order.total)}${order.payment_when === "pickup" ? ", due at pickup" : ", paid"}.</p>
        ${button(link, "Track your order")}
        <p style="font-size:14px;color:#555">We'll email you as your cards move through each stage.</p>
        ${cardTable(order.cards)}
        ${order.has_prep ? `<p style="font-size:13px;color:#555;margin-top:16px">Full evaluations, prep and repairs are done by restoration professionals at our partner, Restored Rarity TCG.</p>` : ""}`), order, ev.id);
    }
    // Shop copy
    if (env("SHOP_EMAIL")) {
      await send("shop_new", env("SHOP_EMAIL"), `New intake ${order.ticket}: ${order.customer_first} ${order.customer_last}, ${order.cards.length} card(s)`, layout(`New order ${order.ticket}`, `
        <p><b>${h(order.customer_first)} ${h(order.customer_last)}</b><br>${h(order.phone)}${order.email ? " | " + h(order.email) : ""}<br>Reach by ${h(order.contact_pref ?? "")}</p>
        <p>Grading: ${h(grading)}<br>Total: ${money(order.total)} (${order.payment_when === "pickup" ? "due at pickup" : "paid, " + h(order.payment_method ?? "")})<br>Cards accepted by ${h(order.received_by ?? "")}</p>
        ${order.customer_notes ? `<p><b>Customer note:</b> ${h(order.customer_notes)}</p>` : ""}
        ${cardTable(order.cards)}`), order, ev.id);
    }
    // Restored Rarity
    if (order.has_prep && env("PARTNER_EMAIL")) {
      const prep = order.cards.filter((c: any) => c.clean || c.eval || c.repair);
      const ifLow = ({ call: "Call the customer first", submit: "Submit anyway", return: "Don't grade it, return the card" } as Record<string, string>)[order.if_low_grade] ?? "";
      await send("partner_new", env("PARTNER_EMAIL"), `PBG prep job ${order.ticket}: ${prep.length} card(s)`, layout(`New prep job from PBG`, `
        <p>Ticket <b>${h(order.ticket)}</b> has ${prep.length} card${prep.length === 1 ? "" : "s"} for prep. The cards are still at PBG until they're handed off.</p>
        <p>Grading after prep: ${h(grading)}${ifLow ? `<br>If an evaluation comes back low: <b>${h(ifLow)}</b>` : ""}</p>
        ${cardTable(prep)}`), order, ev.id);
    }
  } else {
    // Partner handoff
    if (ev.stage === "at_partner" && env("PARTNER_EMAIL")) {
      await send("partner_handoff", env("PARTNER_EMAIL"), `PBG ticket ${order.ticket} handed off for prep`, layout(`Cards handed off: ${order.ticket}`, `
        <p>PBG marked ticket <b>${h(order.ticket)}</b> as with Restored Rarity. Add evaluation results in the staff portal, then set the order to "Prep complete".</p>
        ${note}${cardTable(order.cards.filter((c: any) => c.clean || c.eval || c.repair))}`), order, ev.id);
    }
    // Customer stage update
    if (order.email && ev.email_customer && ev.visible_to_customer) {
      const ready = ev.stage === "ready", done = ev.stage === "picked_up";
      const title = ready ? `Your cards are ready for pickup` : done ? `Thanks for submitting with PBG` : `Update on ticket ${order.ticket}: ${stage.label}`;
      const graded = order.cards.some((c: any) => c.grade);
      await send("update", order.email, ready ? `Ready for pickup: PBG ticket ${order.ticket}` : `${stage.label}: PBG ticket ${order.ticket}`, layout(title, `
        <p>Hi ${h(order.customer_first)},</p>
        <p>${h(stage.customer_text)}</p>
        ${note}
        ${idx >= 0 ? `<p style="font-size:14px;color:#555">Step ${idx + 1} of ${list.length} for your ${h(grading)} order.</p>` : ""}
        ${ready && order.payment_when === "pickup" ? `<p>Balance due at pickup: <b>${money(order.total)}</b>. Bring your ticket number and a photo ID.</p>` : ""}
        ${ready ? `<p style="font-size:14px;background:#fff4cc;padding:10px 12px;border-radius:8px">Storage is free until <b>${new Date(new Date(order.ready_at ?? ev.created_at).getTime() + 30 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" })}</b>. After that, a holding fee of $1 per card per day applies (terms section 10).</p>` : ""}
        ${button(link, done ? "See your grades" : "Track your order")}
        ${graded || order.cards.some((c: any) => c.eval_result) ? cardTable(order.cards, graded) : ""}`), order, ev.id);
    }
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
