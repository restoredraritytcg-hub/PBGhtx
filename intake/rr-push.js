/* Sends repair cards from the PBG iPad to Restored Rarity's website backend, the same way
   restoredraritytcg.com's own intake form does:
     1. Restored Rarity portal (Supabase RPC intake_submit) -> RR code + customer's private link
     2. Card photos to the portal's storage + portal_add_photo
     3. Restored Rarity Apps Script (Google Sheet, quote, confirmation + owner emails)
   Each step is remembered on the submission, so a retry never creates a second submission.
   In demo mode (PBG Supabase not connected) nothing is sent; a pretend RR code is returned. */
(function(){
  const REPAIR_SERVICE = { base: "Base Repair", major: "Major Repair", unsure: "Repair evaluation, quote needed" };
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
  const serviceOf = c => REPAIR_SERVICE[c.repairType] || REPAIR_SERVICE.base;

  async function pushRepairs(s){
    const cards = s.cards.filter(c => c.repair);
    if(!cards.length) return { code: null, link: null };
    if(!live()) return { code: "RR-DEMO" + s.ticket.slice(-3), link: "#demo", demo: true };

    const c0 = s.customer, name = `${c0.first} ${c0.last}`.trim();
    const pbgNote = c => [
      `Service: ${serviceOf(c)}`,
      c.value ? `NM value: $${String(c.value).replace(/^\$/, "")}` : "",
      c.repairNote ? `Needs: ${c.repairNote}` : "",
      `Dropped off at PBG, ticket ${s.ticket}` + (s.grader && s.grader !== "None" ? ` (PBG is also submitting it to ${s.grader} ${s.tier || ""})` : "")
    ].filter(Boolean).join("\n");

    // 1 + 2: portal submission and photos (once)
    if(!s.rrPortal){
      const portal = await rpc("intake_submit", { p: {
        name, email: c0.email || "", phone: c0.phone || "",
        service: [...new Set(cards.map(serviceOf))].join("; "),
        notes: "",
        intake_info: [`Delivery: Dropped off at ${SHOP}`, `PBG ticket: ${s.ticket}`, `Received by: ${s.staff || ""}`,
          "Customer agreed to Restored Rarity's Terms & Conditions on the PBG iPad"].join("\n"),
        cards: cards.map(c => ({ name: c.name, details: details(c), service: serviceOf(c), grading: "", notes: pbgNote(c) }))
      }});
      s.rrPortal = { code: portal.code, token: portal.token, storage_key: portal.storage_key, card_ids: portal.card_ids || [] };
      const bucket = cfg().bucket || "portal";
      for(let i = 0; i < cards.length; i++){
        for(const [side, label] of [["front", "front"], ["back", "back"]]){
          const d = cards[i][side]; if(!d) continue;
          try{
            const path = `u/${portal.storage_key}/${fileName()}.jpg`;
            const up = await fetch(`${cfg().supabaseUrl}/storage/v1/object/${bucket}/${path}`, { method: "POST", headers: headers({ "Content-Type": "image/jpeg" }), body: blobOf(d) });
            if(!up.ok) throw new Error(up.status);
            await rpc("portal_add_photo", { p_token: portal.token, p_path: path, p_caption: `Card ${i + 1} · ${label}`,
              p_card_id: (portal.card_ids || [])[i] || null, p_submission_code: portal.code, p_source: "intake" });
          }catch(e){ console.warn("Restored Rarity photo upload failed", e); }
        }
      }
    }

    // 3: Apps Script (Google Sheet + Restored Rarity's confirmation and owner emails)
    const record = {
      id: s.rrPortal.code, name, email: c0.email || "", phone: c0.phone || "",
      deliveryMethod: "Hand delivered", address: `Dropped off at ${SHOP} (PBG ticket ${s.ticket})`,
      insuredShipping: false, referralCode: cfg().referralCode || "",
      cards: cards.map(c => ({ card: c.name, value: c.value ? String(c.value) : "", service: serviceOf(c), notes: pbgNote(c), grading: "",
        set: c.set || "", cardNo: c.number || "", year: c.year || "", photos: { front: "", back: "", details: [] } })),
      agreedToTerms: true, status: "New", createdAt: s.createdAt
    };
    const res = await fetch(cfg().appsScriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(record) });
    const out = await res.json().catch(() => null);
    if(!out || !out.success) throw new Error("Restored Rarity sheet: " + ((out && out.error) || "no answer"));

    const base = (cfg().portalUrl || "https://restoredraritytcg.com/portal/view.html").replace(/#.*$/, "");
    return { code: s.rrPortal.code, link: `${base}#t=${s.rrPortal.token}` };
  }

  window.RR = { pushRepairs, REPAIR_SERVICE };
})();
