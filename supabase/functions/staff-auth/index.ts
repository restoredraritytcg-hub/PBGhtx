// PBG staff PIN sign-in and team management (Supabase Edge Function, Deno)
//
// The staff portal and the shop iPad sign in with a 6-digit PIN instead of an email
// and password. This function checks the PIN and returns a one-time token the browser
// trades for a normal Supabase session (so every database rule still applies by role).
// Owners use it to add people, change PINs, change roles and remove people.
//
// Brute-force protection: 5 wrong PINs from one network in 15 minutes locks that
// network out for 15 minutes; 30 wrong PINs in total in 15 minutes pauses PIN sign-in
// for everyone for 15 minutes.
//
// No secrets to set: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
// Deploy:  supabase functions deploy staff-auth --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ROLES = ["owner", "staff", "partner", "web"];
const PIN_RE = /^[0-9]{6}$/;
const WINDOW_MIN = 15, PER_IP = 5, GLOBAL = 30;

function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

async function lockedOut(ip: string) {
  const since = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
  const [{ count: mine }, { count: all }] = await Promise.all([
    db.from("pin_attempts").select("id", { count: "exact", head: true }).eq("ok", false).eq("ip", ip).gte("at", since),
    db.from("pin_attempts").select("id", { count: "exact", head: true }).eq("ok", false).gte("at", since),
  ]);
  if ((all ?? 0) >= GLOBAL) return "Too many wrong PINs have been tried. PIN sign-in is paused for 15 minutes.";
  if ((mine ?? 0) >= PER_IP) return "Too many wrong PINs from this device. Try again in 15 minutes.";
  return null;
}

// A one-time token for this user. The browser calls verifyOtp({ type: "magiclink", token_hash }) to get a session.
async function sessionToken(userId: string) {
  const { data: u, error: ue } = await db.auth.admin.getUserById(userId);
  if (ue || !u?.user?.email) throw new Error("This account can't sign in. Ask the owner to re-add you.");
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  if (error || !data?.properties?.hashed_token) throw new Error("Sign-in failed. Try again.");
  return data.properties.hashed_token;
}

async function createPerson(name: string, role: string, pin: string) {
  if (!name.trim()) throw new Error("Enter a name.");
  if (!ROLES.includes(role)) throw new Error("Pick a role.");
  if (!PIN_RE.test(pin)) throw new Error("PIN must be 6 digits.");
  // A login address nobody uses; people only ever type their PIN.
  const email = `staff-${crypto.randomUUID()}@staff.pbgcardshtx.com`;   // never emailed: sign-in links are generated here, not sent
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomUUID() + crypto.randomUUID(), user_metadata: { name } });
  if (error || !data.user) throw new Error("Couldn't create the account: " + (error?.message ?? "unknown error"));
  const id = data.user.id;
  const { error: se } = await db.from("staff").insert({ user_id: id, name: name.trim(), role });
  if (se) { await db.auth.admin.deleteUser(id); throw new Error(se.message); }
  const { error: pe } = await db.rpc("staff_pin_set", { p_user: id, p_pin: pin });
  if (pe) { await db.auth.admin.deleteUser(id); throw new Error(pe.message); }
  return id;
}

async function callerOwner(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  if (!data?.user) return null;
  const { data: s } = await db.from("staff").select("user_id,role,active").eq("user_id", data.user.id).maybeSingle();
  return s && s.active && s.role === "owner" ? s : null;
}
async function ownerCount() {
  const { count } = await db.from("staff").select("user_id", { count: "exact", head: true }).eq("role", "owner").eq("active", true);
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("POST only", 405);
  let body: any = {};
  try { body = await req.json(); } catch { return fail("Bad request"); }
  const action = String(body.action ?? "");

  try {
    /* ---------- anyone ---------- */
    if (action === "status") return json({ needsSetup: (await ownerCount()) === 0 });

    if (action === "setup") {   // first owner, only while there is none
      if ((await ownerCount()) > 0) return fail("PBG already has an owner. Sign in with your PIN.", 403);
      const id = await createPerson(String(body.name ?? ""), "owner", String(body.pin ?? ""));
      return json({ token_hash: await sessionToken(id) });
    }

    if (action === "login") {
      const ip = clientIp(req), pin = String(body.pin ?? "");
      const lock = await lockedOut(ip);
      if (lock) return fail(lock, 429);
      const { data: userId, error } = PIN_RE.test(pin) ? await db.rpc("staff_pin_match", { p_pin: pin }) : { data: null, error: null };
      if (error) throw error;
      await db.from("pin_attempts").insert({ ip, ok: !!userId });
      if (!userId) { await sleep(600); return fail("That PIN doesn't match anyone at PBG.", 401); }
      return json({ token_hash: await sessionToken(userId as string) });
    }

    /* ---------- owners only ---------- */
    const owner = await callerOwner(req);
    if (!owner) return fail("Only an owner can manage the team.", 403);

    if (action === "team") {
      const { data, error } = await db.from("staff").select("user_id,name,role,active,created_at").order("created_at");
      if (error) throw error;
      const { data: pins } = await db.from("staff_pins").select("user_id,updated_at");
      const withPin = new Map((pins ?? []).map((p) => [p.user_id, p.updated_at]));
      return json({ team: data.map((s) => ({ ...s, pin_set_at: withPin.get(s.user_id) ?? null })) });
    }
    if (action === "add") {
      const id = await createPerson(String(body.name ?? ""), String(body.role ?? ""), String(body.pin ?? ""));
      return json({ user_id: id });
    }
    if (action === "pin") {
      const pin = String(body.pin ?? "");
      if (!PIN_RE.test(pin)) return fail("PIN must be 6 digits.");
      const { error } = await db.rpc("staff_pin_set", { p_user: body.user_id, p_pin: pin });
      if (error) return fail(error.message);
      return json({ ok: true });
    }
    if (action === "update") {
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) patch.name = String(body.name).trim();
      if (body.role !== undefined) { if (!ROLES.includes(body.role)) return fail("Pick a role."); patch.role = body.role; }
      if (body.active !== undefined) patch.active = !!body.active;
      const losingOwner = (patch.role && patch.role !== "owner") || patch.active === false;
      if (losingOwner) {
        const { data: t } = await db.from("staff").select("role").eq("user_id", body.user_id).maybeSingle();
        if (t?.role === "owner" && (await ownerCount()) <= 1) return fail("PBG needs at least one owner. Make someone else an owner first.");
      }
      const { error } = await db.from("staff").update(patch).eq("user_id", body.user_id);
      if (error) return fail(error.message);
      return json({ ok: true });
    }
    if (action === "remove") {
      if (body.user_id === owner.user_id) return fail("You can't remove yourself.");
      const { data: t } = await db.from("staff").select("role").eq("user_id", body.user_id).maybeSingle();
      if (t?.role === "owner" && (await ownerCount()) <= 1) return fail("PBG needs at least one owner.");
      const { error } = await db.auth.admin.deleteUser(body.user_id);   // removes their staff row and PIN too
      if (error) return fail(error.message);
      return json({ ok: true });
    }
    return fail("Unknown action");
  } catch (e) {
    return fail((e as Error).message || "Something went wrong", 500);
  }
});
