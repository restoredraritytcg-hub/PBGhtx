/* Sends prep, pre-grade evaluation, and repair cards from the PBG iPad to Restored
   Rarity as one order, the same way restoredraritytcg.com's own intake form does:
     1. Restored Rarity portal (Supabase RPC intake_submit) -> RR order number + private link
     2. Card photos to the portal's storage + portal_add_photo
     3. Restored Rarity Apps Script (Google Sheet, quote, confirmation + owner emails)
   The customer's name, email and phone go on that order. It is marked as coming from
   PBG, and the PBG ticket is stored on it. The RR order number is saved back on the
   PBG order (rr_code), so the two numbers stay tied.
   Each step is remembered on the submission, so a retry never creates a second order.
   In demo mode (PBG Supabase not connected) nothing is sent; a pretend RR code is returned. */
(function(){
  const REPAIR_SERVICE = { base: "Base Repair", major: "Major Repair", unsure: "Repair evaluation, quote needed" };

  /* Repair prices come live from restoredraritytcg.com's own price list (Restored Rarity's Supabase site_get,
     the same call its website makes), so a price change on the Restored Rarity site shows on the iPad too.
     The last good list is kept on the iPad; the built-in list is only used if it has never loaded. */
  const DEFAULT_REPAIRS = [
    { title: "Base Repair", price: 35, desc: "Minor corner or edge lifting, dents or gouges under ¼ inch, and creases under ½ inch." },
    { title: "Major Repair", price: 50, desc: "Major corner or edge lifting, delamination or layer separation, dents or gouges over ¼ inch, and creases over ½ inch." }
  ];
  // Card-value surcharge on repairs, same rules as restoredraritytcg.com: % of the card's value, rounded up to the
  // dollar; nothing up to the first limit; above the last limit Restored Rarity gives a custom quote.
  const DEFAULT_SURCHARGE = [{ upTo: 250, rate: 0 }, { upTo: 1500, rate: 10 }, { upTo: 3000, rate: 12 }];
  const CACHE = "pbg.rrRepairPrices";
  let REPAIRS = DEFAULT_REPAIRS, SURCHARGE = DEFAULT_SURCHARGE, loadedAt = null;
  try{ const c = JSON.parse(localStorage.getItem(CACHE) || "null"); if(c && Array.isArray(c.list) && c.list.length){ REPAIRS = c.list; loadedAt = c.at; if(Array.isArray(c.surcharge) && c.surcharge.length) SURCHARGE = c.surcharge; } }catch(_){}
  const cleanSurcharge = a => (Array.isArray(a) ? a : []).map(x => ({ upTo: num(x && x.upTo), rate: num(x && x.rate) })).filter(x => x.upTo > 0).sort((a, b) => a.upTo - b.upTo);
  const num = v => +String(v == null ? "" : v).replace(/[^0-9.]/g, "") || 0;
  const discount = () => { const d = +cfg().pbgDiscount; return isFinite(d) && cfg().pbgDiscount != null ? d : 10; };
  const r2 = n => Math.round(n * 100) / 100;

  async function loadPrices(){
    if(!cfg().supabaseUrl || !cfg().anonKey) return REPAIRS;
    try{
      const r = await fetch(`${cfg().supabaseUrl}/rest/v1/rpc/site_get`, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: "{}" });
      const c = r.ok ? await r.json() : null;
      let sur = cleanSurcharge(c && c.prices && c.prices.surcharge);
      let list = ((c && c.prices && c.prices.services) || [])
        .filter(x => x && x.type === "repair" && x.title)
        .map(x => ({ title: String(x.title).trim(), price: num(x.price), desc: String(x.desc || "").trim() }))
        .filter(x => x.price > 0);
      // No price list saved in the Restored Rarity portal yet: read the prices built into restoredraritytcg.com itself
      if(!list.length){
        const site = (cfg().portalUrl || "https://restoredraritytcg.com/portal/view.html").replace(/portal\/.*$/, "");
        const html = await fetch(site, { cache: "no-store" }).then(r => r.ok ? r.text() : "");
        const block = (html.match(/let REPAIR_TIERS = \[([\s\S]*?)\n\];/) || [])[1] || "";
        const field = (o, k) => { const m = o.match(new RegExp(k + ':"((?:[^"\\\\]|\\\\.)*)"')); return m ? JSON.parse('"' + m[1] + '"') : ""; };
        if(!sur.length){ const sb = (html.match(/surcharge:\s*(\[[^\]]*\])/) || [])[1]; if(sb) sur = cleanSurcharge([...sb.matchAll(/upTo:\s*([0-9.]+)\s*,\s*rate:\s*([0-9.]+)/g)].map(m => ({ upTo: m[1], rate: m[2] }))); }
        for(const o of block.match(/\{[^{}]*\}/g) || []){
          const title = field(o, "title"), price = num(field(o, "price"));
          if(title && price > 0) list.push({ title, price, desc: field(o, "desc") });
        }
      }
      if(sur.length) SURCHARGE = sur;
      if(list.length){ REPAIRS = list; loadedAt = new Date().toISOString(); try{ localStorage.setItem(CACHE, JSON.stringify({ list, at: loadedAt, surcharge: SURCHARGE })); }catch(_){} }
    }catch(e){ console.warn("Restored Rarity prices not loaded; using the last saved list", e); }
    return REPAIRS;
  }
  // Value surcharge for a card: null = over the last limit (custom quote)
  function surchargeFor(value){
    const v = num(value), t = SURCHARGE; if(!v || !t.length) return 0;
    if(v > t[t.length - 1].upTo) return null;
    const row = t.find(x => v <= x.upTo); return row && row.rate ? Math.ceil(v * row.rate / 100) : 0;
  }
  // Price for one repair: Restored Rarity's posted price + the card-value surcharge = Restored Rarity's total;
  // the PBG discount comes off that total.
  function quote(title, value){
    const t = REPAIR_SERVICE[title] || title, r = REPAIRS.find(x => x.title === t);
    if(!r) return null;
    const sur = surchargeFor(value), rate = (SURCHARGE.find(x => num(value) <= x.upTo) || {}).rate || 0;
    if(sur === null) return { title: r.title, desc: r.desc, base: r.price, list: null, surcharge: null, rate: null, pbg: null, off: discount(), custom: true, over: SURCHARGE[SURCHARGE.length - 1].upTo };
    const list = r2(r.price + sur);
    return { title: r.title, desc: r.desc, base: r.price, surcharge: sur, rate, list, pbg: r2(list * (1 - discount() / 100)), off: discount(), custom: false };
  }
  const label = c => !c ? "" : c.repairType === "unsure" ? "Not sure, needs a look" : (REPAIR_SERVICE[c.repairType] || c.repairType || "Repair");
  const SHOP = "PBG Cards & Collectibles HTX, 25170 I-45 N, Unit 9, Spring, TX 77386";

  const cfg = () => (window.PBG_CONFIG && window.PBG_CONFIG.restoredRarity) || {};
  const live = () => window.PBG && PBG.mode === "live" && cfg().supabaseUrl && cfg().anonKey && cfg().appsScriptUrl;
  const headers = extra => Object.assign({ apikey: cfg().anonKey, Authorization: "Bearer " + cfg().anonKey }, extra);

  async function rpc(fn, args){
    const r = await fetch(`${cfg().supabaseUrl}/rest/v1/rpc/${fn}`, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(args) });
    const body = await r.json().catch(() => null);
    if(!r.ok) throw new Error("Restored Rarity portal: " + ((body && body.message) || r.status));
    return body;
  }
  function blobOf(dataUrl){
    const [h, b] = dataUrl.split(","), mime = h.match(/data:([^;]+)/)[1], bin = atob(b), u = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: mime });
  }
  const fileName = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const details = c => [c.set, c.number, c.year].filter(Boolean).join(" · ");
  const serviceOf = c => REPAIR_SERVICE[c.repairType] || c.repairType || REPAIR_SERVICE.base;
  const partnerCards = s => (s.cards || []).filter(c => c.clean || c.eval || c.repair);
  // One line the Restored Rarity portal shows on the order: where it came from, and the PBG ticket it is tied to.
  const fromPbg = s => `From PBG · ${s.ticket}`;
  const GRADERS = new Set(["PSA", "CGC", "BGS", "TAG"]);
  // Work on this card, in Restored Rarity's service field. A repair name stays first when
  // there is one, so Restored Rarity's quote still recognizes Base Repair / Major Repair.
  const workOf = c => {
    const parts = [];
    if(c.repair) parts.push(serviceOf(c));
    if(c.eval) parts.push("Pre-grade evaluation");
    if(c.clean) parts.push("Prep");
    return parts.join(" + ") || "Prep";
  };

  async function pushRepairs(s){
    const cards = partnerCards(s);
    if(!cards.length) return { code: null, link: null };
    if(!live()) return { code: "RR-DEMO" + s.ticket.slice(-3), link: "#demo", demo: true };

    const c0 = s.customer, name = `${c0.first} ${c0.last}`.trim();
    const grading = GRADERS.has(s.grader) ? s.grader : "";
    const alsoGrading = grading ? ` PBG is also submitting it to ${grading} ${s.tier || ""}.`.replace(/\s+\./, ".") : "";
    const pbgNote = c => [
      `From PBG. PBG order ${s.ticket}.`,
      `Service: ${workOf(c)}`,
      c.variant ? `Variant: ${c.variant}` : "",
      c.value ? `Declared value: $${String(c.value).replace(/^\$/, "")}` : "",
      c.repair && c.repairNote ? `Needs: ${c.repairNote}` : "",
      c.repair && c.repairPrice ? `PBG customer repair price: $${(+c.repairPrice).toFixed(2)} (${c.repairOff || 10}% off the $${(+c.repairList).toFixed(2)} total${c.repairSurcharge ? `: $${(+c.repairBase).toFixed(2)} repair + $${(+c.repairSurcharge).toFixed(2)} value surcharge` : ""}). PBG collects this estimate at payment. Adjust later if the final price differs.` : (c.repair ? `PBG customer: ${discount()}% off the repair total (repair + value surcharge). ${c.repairCustom ? "Card value is over the surcharge table: custom quote, collected at PBG once priced." : "PBG collects the repair at payment."}` : ""),
      (c.clean || c.eval) ? `${[c.clean && "Prep", c.eval && "Pre-grade evaluation"].filter(Boolean).join(" and ")} paid at PBG. This order is the work ticket, not a second bill.` : "",
      `Dropped off at PBG.${alsoGrading}`
    ].filter(Boolean).join("\n");
    const works = [...new Set(cards.map(workOf))];
    const serviceLine = `${fromPbg(s)} · ${works.join("; ")}`.slice(0, 200);

    // 1 + 2: one Restored Rarity order and its photos (once per PBG ticket)
    if(!s.rrPortal){
      const portal = await rpc("intake_submit", { p: {
        name, email: c0.email || "", phone: c0.phone || "",
        service: serviceLine,
        notes: `PBG order ${s.ticket}. Dropped off at PBG Cards & Collectibles HTX.`,
        intake_info: [
          "Source: PBG Cards & Collectibles HTX",
          `PBG order: ${s.ticket}`,
          "This Restored Rarity order is tied to that PBG ticket.",
          `Delivery: Dropped off at ${SHOP}`,
          `Received by: ${s.staff || ""}`,
          `Services: ${works.join("; ")}`,
          cards.some(c => c.repair) ? "Customer agreed to Restored Rarity's Terms & Conditions on the PBG iPad for the repair cards." : "Prep and pre-grade evaluation were ordered at PBG."
        ].join("\n"),
        cards: cards.map(c => ({ name: c.name, details: details(c), service: workOf(c), grading, grade_level: grading ? (s.tier || "") : "", notes: pbgNote(c) }))
      }});
      s.rrPortal = { code: portal.code, token: portal.token, storage_key: portal.storage_key, card_ids: portal.card_ids || [], pbg_ticket: s.ticket };
      const bucket = cfg().bucket || "portal";
      for(let i = 0; i < cards.length; i++){
        for(const [side, label] of [["front", "front"], ["back", "back"]]){
          const d = cards[i][side]; if(!d) continue;
          try{
            const path = `u/${portal.storage_key}/${fileName()}.jpg`;
            const up = await fetch(`${cfg().supabaseUrl}/storage/v1/object/${bucket}/${path}`, { method: "POST", headers: headers({ "Content-Type": "image/jpeg" }), body: blobOf(d) });
            if(!up.ok) throw new Error(up.status);
            await rpc("portal_add_photo", { p_token: portal.token, p_path: path, p_caption: `Card ${i + 1} · ${label} · ${fromPbg(s)}`,
              p_card_id: (portal.card_ids || [])[i] || null, p_submission_code: portal.code, p_source: "intake" });
          }catch(e){ console.warn("Restored Rarity photo upload failed", e); }
        }
      }
    }

    // 3: Apps Script (Google Sheet + Restored Rarity's confirmation and owner emails).
    // The sheet's order id is the Restored Rarity order number. The address line carries the PBG ticket.
    const record = {
      id: s.rrPortal.code, name, email: c0.email || "", phone: c0.phone || "",
      deliveryMethod: "Hand delivered", address: `PBG order ${s.ticket} · Dropped off at ${SHOP}`,
      insuredShipping: false, referralCode: cfg().referralCode || "",
      cards: cards.map(c => ({ card: c.name, value: c.value ? String(c.value) : "", service: workOf(c), notes: pbgNote(c), grading,
        set: c.set || "", cardNo: c.number || "", year: c.year || "", photos: { front: "", back: "", details: [] } })),
      agreedToTerms: !!(s.agreedRR || cards.some(c => c.repair)), status: "New", createdAt: s.createdAt
    };
    const res = await fetch(cfg().appsScriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(record) });
    const out = await res.json().catch(() => null);
    if(!out || !out.success) throw new Error("Restored Rarity sheet: " + ((out && out.error) || "no answer"));

    const base = (cfg().portalUrl || "https://restoredraritytcg.com/portal/view.html").replace(/#.*$/, "");
    return { code: s.rrPortal.code, link: `${base}#t=${s.rrPortal.token}` };
  }

  window.RR = { pushRepairs, pushOrder: pushRepairs, REPAIR_SERVICE, loadPrices, quote, surchargeFor, label, repairs: () => REPAIRS, surcharge: () => SURCHARGE, loadedAt: () => loadedAt, discount };
})();
