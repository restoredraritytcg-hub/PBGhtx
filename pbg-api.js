/* PBG data layer: Supabase when configured, otherwise a demo store with sample orders.
   Used by the iPad app, the staff portal and the customer status page. */
(function(){
  const cfg = window.PBG_CONFIG || {};
  const LIVE = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const SB_LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  /* ---------- stages (mirror of the seed rows in schema.sql, used in demo mode) ---------- */
  const DEFAULT_STAGES = [
    ["*pre",1,"checked_in","Checked in at PBG","Your cards are at the shop and logged on your ticket."],
    ["*partner",1,"at_partner","With Restored Rarity for prep","Your cards are with our partner, Restored Rarity TCG, for cleaning or a pre-grade evaluation."],
    ["*partner",2,"prep_done","Prep complete","Prep is finished and your cards are back at PBG."],
    ["*ship",1,"shipped_to_grader","On the way to {grader}","Your cards are packed and shipped to {grader} with our next submission."],
    ["PSA",1,"psa_arrived","Arrived at PSA","PSA has the package. It is waiting to be opened and logged."],
    ["PSA",2,"psa_order_prep","Order prep","PSA opened the submission and logged it. Their turnaround clock starts here."],
    ["PSA",3,"psa_research_id","Research & ID","PSA is identifying each card so the label is correct."],
    ["PSA",4,"psa_grading","Grading","Your cards are being graded."],
    ["PSA",5,"psa_assembly","Assembly","Graded cards are being sealed in slabs with their labels."],
    ["PSA",6,"psa_qa1","QA check 1","First quality check on the slabs and labels."],
    ["PSA",7,"psa_qa2","QA check 2","Final quality check before PSA ships the order."],
    ["PSA",8,"psa_shipped","Shipped from PSA","PSA shipped your cards back to PBG."],
    ["CGC",1,"cgc_arrived","Arrived at CGC","CGC has the package. It is waiting to be opened and logged."],
    ["CGC",2,"cgc_received","Received","CGC opened the submission and entered it into their system."],
    ["CGC",3,"cgc_scheduled","Scheduled for grading","Your cards are in line for graders."],
    ["CGC",4,"cgc_grading","Grading, encapsulation & imaging","Your cards are being graded, slabbed and photographed."],
    ["CGC",5,"cgc_qc","Quality control","Final quality check before CGC ships the order."],
    ["CGC",6,"cgc_shipped","Shipped from CGC","CGC shipped your cards back to PBG."],
    ["BGS",1,"bgs_arrived","Arrived at Beckett","Beckett has the package. It is waiting to be opened and logged."],
    ["BGS",2,"bgs_invoiced","Invoiced","Beckett logged and invoiced the submission."],
    ["BGS",3,"bgs_verification","Verification","Beckett is verifying each card against the submission."],
    ["BGS",4,"bgs_grading","Grading","Your cards are being graded and slabbed."],
    ["BGS",5,"bgs_shipped","Shipped from Beckett","Beckett shipped your cards back to PBG."],
    ["SGC",1,"sgc_arrived","Arrived at SGC","SGC has the package. It is waiting to be opened and logged."],
    ["SGC",2,"sgc_received","Received","SGC opened the submission and entered it into their system."],
    ["SGC",3,"sgc_grading","Grading","Your cards are being graded and slabbed."],
    ["SGC",4,"sgc_qc","Quality control","Final quality check before SGC ships the order."],
    ["SGC",5,"sgc_shipped","Shipped from SGC","SGC shipped your cards back to PBG."],
    ["TAG",1,"tag_arrived","Arrived at TAG","TAG has the package. It is waiting to be opened and logged."],
    ["TAG",2,"tag_received","Received","TAG opened the submission and entered each card."],
    ["TAG",3,"tag_grading","Grading","Your cards are being imaged and graded."],
    ["TAG",4,"tag_slabbing","Encapsulation & imaging","Graded cards are being sealed in slabs and photographed."],
    ["TAG",5,"tag_qa","Quality check","Final quality check before TAG ships the order."],
    ["TAG",6,"tag_shipped","Shipped from TAG","TAG shipped your cards back to PBG."],
    ["*generic",1,"gen_arrived","Arrived at {grader}","{grader} has your cards."],
    ["*generic",2,"gen_grading","Grading","Your cards are being graded."],
    ["*generic",3,"gen_shipped","Shipped from {grader}","{grader} shipped your cards back to PBG."],
    ["*post",1,"ready","Ready for pickup","Your cards are back at PBG. Bring your ticket number and a photo ID."],
    ["*post",2,"picked_up","Picked up","You picked up your cards. Thanks for submitting with PBG."],
    ["*auction",1,"auction_sent","Sent to {house}","Your cards are on the way to {house} for auction."],
    ["*auction",2,"auction_received","Received by {house}","{house} has your cards and is placing them in an upcoming auction."],
    ["*auction",3,"auction_live","Auction live","Your cards are up for bidding. We'll send the results when the auction closes."],
    ["*auction",4,"auction_sold","Sold","Your auction closed. We'll pay you 100% of the hammer price as soon as {house} pays us."],
    ["*auction",5,"auction_paid","Paid out","We've paid you 100% of the hammer price. Thanks for consigning with PBG."]
  ].map(([grader,position,code,label,customer_text]) => ({grader,position,code,label,customer_text,
    notify_customer: !["psa_order_prep","psa_qa1","psa_qa2","cgc_received","cgc_qc","bgs_invoiced","sgc_received","sgc_qc","tag_received","tag_qa","auction_received"].includes(code)}));

  const GRADER_NAMES = { BGS: "Beckett" };
  const graderName = g => GRADER_NAMES[g] || g;

  function stageList(order, rows){
    rows = rows || DEFAULT_STAGES;
    const by = g => rows.filter(r => r.grader === g).sort((a,b) => a.position - b.position);
    let list = by("*pre");
    if(order.has_prep) list = list.concat(by("*partner"));
    if(order.grader && order.grader !== "None"){
      list = list.concat(by("*ship"));
      const own = by(order.grader);
      list = list.concat(own.length ? own : by("*generic"));
    }
    // auction orders go to the auction house instead of back to the customer (unless a declined card was sent back for pickup)
    const declined = ["ready","picked_up"].includes(order.current_stage);
    list = list.concat(by(order.auction_house && !declined ? "*auction" : "*post"));
    const name = graderName(order.grader), house = order.auction_house && order.auction_house !== "Best fit" ? order.auction_house : "the auction house";
    const fill = t => t.replaceAll("{grader}", name).replaceAll("{house}", house);
    return list.map(r => ({ ...r, label: fill(r.label), customer_text: fill(r.customer_text),
      phase: r.grader === "*pre" || r.grader === "*post" ? "shop" : r.grader === "*partner" ? "partner" : r.grader === "*ship" ? "ship" : r.grader === "*auction" ? "auction" : "grader" }));
  }

  /* ---------- helpers ---------- */
  function dataUrlToBlob(d){
    const [head, b64] = d.split(","); const mime = head.match(/data:([^;]+)/)[1];
    const bin = atob(b64); const u = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: mime });
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==="x"?r:(r&3|8)).toString(16); }));
  function statusUrl(token){ return (cfg.statusUrl || "status.html").replace(/#.*$/, "") + "#" + token; }

  function orderRowFromSub(s){
    const t = s.totals || {};
    return {
      ticket: s.ticket, public_token: s.publicToken, created_at: s.createdAt,
      customer_first: s.customer.first, customer_last: s.customer.last, phone: s.customer.phone, email: s.customer.email || null, mailing_address: s.customer.address || null,
      contact_pref: s.customer.contact, customer_notes: s.customer.notes || null,
      grader: s.grader, tier: s.tier || null, grade_each: t.gradeEach || 0, grader_fee_each: t.fee || 0,
      graded_count: t.gradedCards || 0, eval_count: t.evalCount || 0, prep_count: t.prepCount || 0, gem_count: t.gemCount || 0, gem_fees: round(t.gems), mag_count: t.magCount || 0, mag_fees: round(t.mags),
      grader_fees: round(t.graderFees), pbg_share: round(t.pbgShare), rr_share: round(t.rrShare),
      has_prep: s.cards.some(c => c.clean || c.eval),
      auction_house: s.auction ? s.auction.house : null, auction_mode: s.auction ? s.auction.mode : null,
      payout_method: s.auction ? s.auction.payout : null, payout_details: s.auction ? (s.auction.payoutDetails || null) : null, rr_code: s.rrCode || null, if_low_grade: s.cards.some(c => c.eval) ? s.ifLowGrade : null,
      subtotal: round(t.subtotal), tax: round(t.tax), total: round(t.total),
      payment_when: s.payment.when, payment_method: s.payment.method,
      signed_name: s.signedName, received_by: s.staff, pickup_policy_ack: !!s.agreedPickup,
      ownership_ack: !!s.agreedOwn, terms_version: s.termsVersion || null, terms_text: s.termsText || null, signed_at: s.signedAt || null
    };
  }
  function cardRowFromSub(c, i){
    return { position: i+1, category: c.category, name: c.name, year: c.year || null, set_name: c.set || null, card_number: c.number || null,
      variant: c.variant || null, declared_value: +c.value || 0, clean: !!c.clean, eval: !!c.eval, repair: !!c.repair, gem: !!c.gem, gem_fee: +c.gemFee || 0, mag_case: !!c.mag,
      grade: c.slabGrade || null, cert_number: c.cert || null,
      repair_note: c.repair ? [({ base: "Base repair", major: "Major repair", unsure: "Repair, needs a look" })[c.repairType] || "Repair", c.repairNote].filter(Boolean).join(": ") : null };
  }
  const round = n => Math.round((+n || 0) * 100) / 100;

  /* =================== LIVE (Supabase) =================== */
  let sb = null, staff = null, stagesCache = null;
  function loadLib(){
    if(window.supabase) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = SB_LIB; s.onload = res;
      s.onerror = () => rej(new Error("Couldn't load the Supabase library. Check the internet connection and reload.")); document.head.appendChild(s); });
  }
  const live = {
    async init(){ await loadLib(); sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "pbg-auth" } }); },
    async currentStaff(){
      const { data: { session } } = await sb.auth.getSession(); if(!session) return null;
      if(staff && staff.user_id === session.user.id) return staff;
      const { data, error } = await sb.from("staff").select("user_id,name,role,active").eq("user_id", session.user.id).maybeSingle();
      if(error) throw error; staff = data && data.active !== false ? { ...data, email: session.user.email } : null; return staff;
    },
    async signIn(email, password){
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if(error) throw new Error(error.message === "Invalid login credentials" ? "That email and password don't match a PBG staff account." : error.message);
      staff = null; const s = await live.currentStaff();
      if(!s){ await sb.auth.signOut(); throw new Error("This account isn't set up as PBG staff yet. Add it to the staff table in Supabase."); }
      return s;
    },
    async signOut(){ staff = null; await sb.auth.signOut(); },
    async staffAuth(action, body = {}, withSession = false){
      const headers = { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" };
      if(withSession){ const { data: { session } } = await sb.auth.getSession(); if(!session) throw new Error("Sign in again."); headers.Authorization = "Bearer " + session.access_token; }
      else if(/^eyJ/.test(cfg.supabaseAnonKey)) headers.Authorization = "Bearer " + cfg.supabaseAnonKey;   // new sb_publishable_ keys go in apikey only
      let r;
      try{ r = await fetch(cfg.supabaseUrl.replace(/\/$/, "") + "/functions/v1/staff-auth", { method: "POST", headers, body: JSON.stringify({ action, ...body }) }); }
      catch(e){ throw new Error("Can't reach the PBG sign-in service. Check the internet connection."); }
      const out = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(out.error || "Sign-in service error (" + r.status + ")");
      return out;
    },
    async pinSession(tokenHash){
      const { error } = await sb.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
      if(error) throw new Error("Sign-in failed: " + error.message);
      staff = null; const s = await live.currentStaff();
      if(!s || !s.role){ await sb.auth.signOut(); throw new Error("This PIN's account is turned off. Ask the owner."); }
      return s;
    },
    async signInWithPin(pin){ const { token_hash } = await live.staffAuth("login", { pin }); return live.pinSession(token_hash); },
    async needsSetup(){ return !!(await live.staffAuth("status")).needsSetup; },
    async setupOwner(name, pin){ const { token_hash } = await live.staffAuth("setup", { name, pin }); return live.pinSession(token_hash); },
    async team(){ return (await live.staffAuth("team", {}, true)).team; },
    async teamAdd(name, role, pin){ return live.staffAuth("add", { name, role, pin }, true); },
    async teamPin(user_id, pin){ return live.staffAuth("pin", { user_id, pin }, true); },
    async teamUpdate(user_id, patch){ return live.staffAuth("update", { user_id, ...patch }, true); },
    async teamRemove(user_id){ return live.staffAuth("remove", { user_id }, true); },
    async stages(){
      if(stagesCache) return stagesCache;
      const { data, error } = await sb.from("grader_stages").select("grader,position,code,label,customer_text,notify_customer").order("grader").order("position");
      if(error) throw error; stagesCache = data.length ? data : DEFAULT_STAGES; return stagesCache;
    },
    async submitOrder(s){
      const token = s.publicToken, up = async (bucket, path, dataUrl) => {
        const { error } = await sb.storage.from(bucket).upload(path, dataUrlToBlob(dataUrl), { upsert: true, contentType: dataUrl.slice(5, dataUrl.indexOf(";")) });
        if(error) throw new Error("Photo upload failed: " + error.message); return path;
      };
      const cards = [];
      for(let i = 0; i < s.cards.length; i++){
        const c = s.cards[i], row = cardRowFromSub(c, i);
        if(c.front) row.front_path = await up("card-photos", `${token}/${s.ticket}-${i+1}-front.jpg`, c.front);
        if(c.back)  row.back_path  = await up("card-photos", `${token}/${s.ticket}-${i+1}-back.jpg`, c.back);
        cards.push(row);
      }
      const order = orderRowFromSub(s);
      if(s.signature) order.signature_path = await up("signatures", `${s.ticket}.png`, s.signature);
      let { data: existing } = await sb.from("orders").select("id").eq("ticket", s.ticket).maybeSingle();
      let id = existing && existing.id;
      if(!id){
        let { data, error } = await sb.from("orders").insert(order).select("id").single();
        // If the database hasn't had the terms columns added yet, save the order without them rather than leave it stuck.
        if(error && /terms_version|terms_text|signed_at|ownership_ack/.test(error.message)){
          const { terms_version, terms_text, signed_at, ownership_ack, ...rest } = order;
          ({ data, error } = await sb.from("orders").insert(rest).select("id").single());
        }
        if(error) throw new Error("Saving the order failed: " + error.message); id = data.id;
      }
      const { error: ce } = await sb.from("cards").upsert(cards.map(c => ({ ...c, order_id: id })), { onConflict: "order_id,position" });
      if(ce) throw new Error("Saving the cards failed: " + ce.message);
      return { id };
    },
    async listOrders(){
      const { data, error } = await sb.from("orders")
        .select("id,ticket,public_token,customer_first,customer_last,phone,email,grader,tier,has_prep,current_stage,created_at,updated_at,total,payment_when,grader_order_no,ready_at,final_notice_at,pickup_deadline,abandoned_at,auction_house,auction_mode,cards(count)")
        .order("created_at", { ascending: false }).limit(1000);
      if(error) throw error;
      return data.map(o => ({ ...o, card_count: o.cards && o.cards[0] ? o.cards[0].count : 0 }));
    },
    async auctionOrders(){
      const { data, error } = await sb.from("orders")
        .select("id,ticket,customer_first,customer_last,phone,grader,tier,current_stage,created_at,updated_at,auction_house,auction_mode,payout_method,payout_details,auction_paid_at,has_prep,cards(name,year,set_name,grade,cert_number,declared_value,hammer_price,auction_lot_url)")
        .not("auction_house", "is", null).order("created_at", { ascending: false }).limit(1000);
      if(error) throw new Error(error.message); return data;
    },
    async getOrder(id){
      const { data, error } = await sb.from("orders").select("*, cards(*), stage_events(*)").eq("id", id).single();
      if(error) throw error;
      data.cards.sort((a,b) => a.position - b.position); data.stage_events.sort((a,b) => a.created_at.localeCompare(b.created_at));
      if(data.signature_path){ const r = await sb.storage.from("signatures").createSignedUrl(data.signature_path, 3600); data.signature_url = r.data && r.data.signedUrl; }
      return data;
    },
    async setStage(orderId, code, note, visible, email){
      const { error } = await sb.rpc("set_order_stage", { p_order: orderId, p_stage: code, p_note: note || null, p_visible: visible !== false, p_email: email === undefined ? null : !!email });
      if(error) throw new Error(error.message);
    },
    async updateOrder(id, patch){ const { error } = await sb.from("orders").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id); if(error) throw new Error(error.message); },
    async updateCard(id, patch){ const { error } = await sb.from("cards").update(patch).eq("id", id); if(error) throw new Error(error.message); },
    async getStatus(token){
      if(!/^[0-9a-f-]{36}$/i.test(token)) return null;
      const { data, error } = await sb.rpc("get_order_status", { p_token: token }); if(error) throw error; return data;
    },
    photoUrl(path){ if(!path) return null; if(path.startsWith("data:")) return path; return sb.storage.from("card-photos").getPublicUrl(path).data.publicUrl; },
    async payouts(from, to){ const { data, error } = await sb.rpc("payout_report", { p_from: from, p_to: to }); if(error) throw new Error(error.message); return data; },
    async getSite(){
      const { data, error } = await sb.from("site_content").select("key,value,updated_at,updated_by");
      if(error) throw new Error(error.message);
      return Object.fromEntries(data.map(r => [r.key, { value: r.value, updated_at: r.updated_at, updated_by: r.updated_by }]));
    },
    async saveSite(key, value){
      const { error } = await sb.from("site_content").upsert({ key, value }, { onConflict: "key" });
      if(error) throw new Error(error.message);
    },
    async uploadSiteImage(dataUrl){
      const path = `${new Date().toISOString().slice(0,10)}/${uuid()}.jpg`;
      const { error } = await sb.storage.from("site-media").upload(path, dataUrlToBlob(dataUrl), { contentType: "image/jpeg", upsert: false });
      if(error) throw new Error("Photo upload failed: " + error.message);
      return sb.storage.from("site-media").getPublicUrl(path).data.publicUrl;
    },
    async linkRestoredRarity(ticket, code){ const { error } = await sb.from("orders").update({ rr_code: code }).eq("ticket", ticket); if(error) throw new Error(error.message); },
    async getPricing(){ const { data, error } = await sb.from("pricing").select("rules,graders,updated_at,updated_by").eq("id", 1).maybeSingle(); if(error) throw new Error(error.message); return data; },
    async savePricing(rules, graders){
      const who = staff ? staff.name : null;
      const { error } = await sb.from("pricing").update({ rules, graders, updated_at: new Date().toISOString(), updated_by: who }).eq("id", 1);
      if(error) throw new Error(error.message);
    }
  };

  /* =================== DEMO (sample data in this browser) =================== */
  const DKEY = "pbg.demo.v15";
  const ph = (bg, fg, label) => "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350"><rect width="250" height="350" rx="14" fill="${fg}"/><rect x="12" y="12" width="226" height="326" rx="8" fill="${bg}"/><circle cx="125" cy="150" r="60" fill="${fg}" opacity=".85"/><rect x="28" y="262" width="194" height="44" rx="6" fill="#fff"/><text x="125" y="291" font-family="Arial" font-weight="700" font-size="18" text-anchor="middle" fill="#111">${label}</text></svg>`);
  function seed(){
    const now = Date.now(), d = n => new Date(now - n*86400000).toISOString();
    const mk = (o, cards, events) => ({ id: uuid(), public_token: uuid(), updated_at: events[events.length-1][1], grader_order_no: null, outbound_tracking: null, return_tracking: null, internal_notes: null, email: null, customer_notes: null, signature_path: null, payment_method: "Card", if_low_grade: "call", ...o,
      cards: cards.map((c,i) => ({ id: uuid(), position: i+1, clean: false, eval: false, repair: false, eval_result: null, repair_quote: null, grade: null, cert_number: null, card_status: null, year: null, set_name: null, card_number: null, variant: null, repair_note: null, back_path: null, ...c })),
      stage_events: events.map(([stage, at, note]) => ({ id: uuid(), stage, created_at: at, note: note || null, visible_to_customer: true, created_by_name: "Demo Staff" })),
      ready_at: (events.find(e => e[0] === "ready") || [])[1] || null,
      current_stage: events[events.length-1][0] });
    return [
      mk({ ticket: "PBG-261021-K7Q", customer_first: "Marcus", customer_last: "Lee", phone: "832-555-0142", contact_pref: "Text", grader: "PSA", tier: "Value", grade_each: 25, has_prep: true, total: 105, payment_when: "dropoff", created_at: d(19), grader_order_no: "PSA 24418873", received_by: "Jordan" },
        [{ category: "Pokémon", name: "Charizard ex", year: "2023", set_name: "Obsidian Flames", card_number: "223", declared_value: 350, clean: true, eval: true, eval_result: "Strong 10 candidate. Centering 55/45.", front_path: ph("#E25822","#F3D27A","Charizard ex") },
         { category: "Pokémon", name: "Umbreon VMAX", year: "2021", set_name: "Evolving Skies", card_number: "215", declared_value: 450, clean: true, eval: true, eval_result: "9 likely. Light whitening on back corner.", front_path: ph("#1F2A44","#F3D27A","Umbreon VMAX") },
         { category: "Pokémon", name: "Pikachu VMAX", year: "2020", set_name: "Vivid Voltage", card_number: "188", declared_value: 120, front_path: ph("#F7D02C","#C21F32","Pikachu VMAX") }],
        [["checked_in", d(19)], ["at_partner", d(18)], ["prep_done", d(15), "All three cleaned. Evaluations attached to each card."], ["shipped_to_grader", d(14)], ["psa_arrived", d(11)], ["psa_order_prep", d(9)], ["psa_research_id", d(6)], ["psa_grading", d(2)]]),
      mk({ ticket: "PBG-261002-M3D", customer_first: "Alyssa", customer_last: "Grant", phone: "281-555-0199", contact_pref: "Call", grader: "CGC", tier: "Standard", grade_each: 30, has_prep: false, total: 60, payment_when: "pickup", created_at: d(38), received_by: "Jordan", return_tracking: "1Z999AA10123456784" },
        [{ category: "Sports", name: "Shohei Ohtani", year: "2018", set_name: "Topps Chrome", card_number: "150", variant: "Rookie", declared_value: 400, grade: "CGC 9.5", cert_number: "4183920011", front_path: ph("#0B3D91","#E31B23","Ohtani RC") },
         { category: "Sports", name: "Victor Wembanyama", year: "2023", set_name: "Prizm", card_number: "136", variant: "Silver", declared_value: 8500, grade: "CGC 10 Pristine", cert_number: "4183920012", front_path: ph("#111","#C0C0C0","Wembanyama") }],
        [["checked_in", d(38)], ["shipped_to_grader", d(36)], ["cgc_arrived", d(33)], ["cgc_received", d(31)], ["cgc_scheduled", d(27)], ["cgc_grading", d(20)], ["cgc_qc", d(12)], ["cgc_shipped", d(5)], ["ready", d(2), "Grades are in. Come by any day 11 to 7."]]),
      mk({ ticket: "PBG-261106-R2T", customer_first: "Devon", customer_last: "Price", phone: "713-555-0110", contact_pref: "Text", grader: "BGS", tier: "Express", grade_each: 30, has_prep: true, total: 50, payment_when: "dropoff", created_at: d(3), received_by: "Alex" },
        [{ category: "Sports", name: "C.J. Stroud", year: "2023", set_name: "Donruss Optic", card_number: "201", variant: "Rated Rookie", declared_value: 200, clean: true, eval: true, front_path: ph("#03202F","#A71930","Stroud RR") }],
        [["checked_in", d(3)], ["at_partner", d(2)]]),
      mk({ ticket: "PBG-261109-W8P", customer_first: "Sam", customer_last: "Ortiz", phone: "832-555-0177", contact_pref: "Text", grader: "TAG", tier: "Standard", grade_each: 25, has_prep: false, total: 75, payment_when: "dropoff", created_at: d(0.1), received_by: "Jordan" },
        [{ category: "Sports", name: "Ken Griffey Jr.", year: "1989", set_name: "Upper Deck", card_number: "1", variant: "Rookie", declared_value: 150, front_path: ph("#1D3557","#F1FAEE","Griffey Jr.") },
         { category: "Sports", name: "Derek Jeter", year: "1993", set_name: "SP", card_number: "279", variant: "Foil Rookie", declared_value: 300, front_path: ph("#0C2340","#C4CED4","Jeter SP") },
         { category: "Sports", name: "Hakeem Olajuwon", year: "1986", set_name: "Fleer", card_number: "82", declared_value: 200, front_path: ph("#CE1141","#FDB927","Olajuwon") }],
        [["checked_in", d(0.1)]]),
      mk({ ticket: "PBG-261028-H5N", customer_first: "Priya", customer_last: "Shah", phone: "346-555-0123", contact_pref: "Email", email: "priya@example.com", grader: "None", tier: null, grade_each: 0, has_prep: true, total: 30, payment_when: "dropoff", created_at: d(12), received_by: "Alex" },
        [{ category: "Pokémon", name: "Lugia", year: "2000", set_name: "Neo Genesis", card_number: "9", variant: "Holo", declared_value: 500, eval: true, eval_result: "Solid 7. Edge wear top left. Not worth PSA Regular.", front_path: ph("#5B7DB1","#E8E8E8","Lugia Holo") },
         { category: "Pokémon", name: "Typhlosion", year: "2000", set_name: "Neo Genesis", card_number: "17", variant: "Holo", declared_value: 120, eval: true, eval_result: "8 possible after cleaning.", front_path: ph("#D35400","#2C3E50","Typhlosion") }],
        [["checked_in", d(12)], ["at_partner", d(11)], ["prep_done", d(6), "Evaluations done. See notes on each card."]]),
      mk({ ticket: "PBG-260712-Z4C", customer_first: "Tyler", customer_last: "Nguyen", phone: "936-555-0188", contact_pref: "Text", email: "tyler@example.com", mailing_address: "1418 Example Ln, Spring, TX 77386", pickup_policy_ack: true, grader: "PSA", tier: "Value", grade_each: 25, has_prep: false, total: 75, payment_when: "pickup", created_at: d(120), received_by: "Jordan", grader_order_no: "PSA 23991020" },
        [{ category: "Sports", name: "Victor Wembanyama", year: "2023", set_name: "Prizm", card_number: "136", variant: "Base", declared_value: 60, grade: "PSA 9", front_path: ph("#1B1B1B","#C0C0C0","Wemby Prizm") },
         { category: "Sports", name: "C.J. Stroud", year: "2023", set_name: "Donruss Optic", card_number: "203", variant: "Rated Rookie", declared_value: 40, grade: "PSA 10", front_path: ph("#03202F","#A71930","Stroud RR") }],
        [["checked_in", d(120)], ["shipped_to_grader", d(118)], ["psa_arrived", d(110)], ["psa_grading", d(90)], ["psa_shipped", d(70)], ["ready", d(64), "Grades are in. Come by any day 11 to 7."]]),
      mk({ ticket: "PBG-261015-A9G", customer_first: "Kayla", customer_last: "Brooks", phone: "281-555-0161", contact_pref: "Text", email: "kayla@example.com", grader: "None", tier: null, grade_each: 0, has_prep: false, total: 0, payment_when: "dropoff", payment_method: "None due", created_at: d(25), received_by: "Jordan",
          auction_house: "Goldin", auction_mode: "standalone", payout_method: "PayPal", payout_details: "kayla@example.com" },
        [{ category: "Sports", name: "Patrick Mahomes", year: "2017", set_name: "Prizm", card_number: "269", variant: "Rookie", declared_value: 2400, grade: "PSA 10", cert_number: "71234567", hammer_price: 2650, front_path: ph("#E31837","#FFB612","Mahomes RC") },
         { category: "Pokémon", name: "Umbreon VMAX", year: "2021", set_name: "Evolving Skies", card_number: "215", variant: "Alt Art", declared_value: 1500, grade: "CGC 9.5", cert_number: "4210098765", hammer_price: 1320, front_path: ph("#1B1B3A","#F2D16B","Umbreon VMAX") }],
        [["checked_in", d(25)], ["auction_sent", d(23)], ["auction_received", d(18)], ["auction_live", d(9)], ["auction_sold", d(2), "Both cards sold. Goldin pays out in about two weeks, then we pay you."]]),
      mk({ ticket: "PBG-261101-F2X", customer_first: "Chris", customer_last: "Vega", phone: "713-555-0133", contact_pref: "Text", grader: "PSA", tier: "Value", grade_each: 25, has_prep: true, total: 54, payment_when: "dropoff", created_at: d(8), received_by: "Alex",
          auction_house: "Fanatics Collect", auction_mode: "after_grading", payout_method: "Wire transfer", payout_details: "Chris Vega" },
        [{ category: "Pokémon", name: "Charizard ex", year: "2023", set_name: "Obsidian Flames", card_number: "223", variant: "Special Illustration Rare", declared_value: 300, clean: true, front_path: ph("#B3121A","#F5C518","Charizard ex") }],
        [["checked_in", d(8)], ["at_partner", d(7)], ["prep_done", d(4)], ["shipped_to_grader", d(3)]])
    ];
  }
  // demo orders: price them with the current rules (fee + $20 split PBG $12 / RR $8; full eval $17, PBG $2; prep $7, PBG $2)
  const DEMO_FEES = { PSA: { Value: 39.99, Standard: 59.99, Priority: 79.99 }, CGC: { Economy: 20, Standard: 55 }, BGS: { Express: 79.95 }, TAG: { Base: 39.95, Standard: 59.95 } };
  function priceDemo(o){
    const fee = (DEMO_FEES[o.grader] || {})[o.tier] || 0, g = o.grader === "None" ? 0 : o.cards.length;
    const ev = o.cards.filter(c => c.eval).length, pr = o.cards.filter(c => c.clean).length, r2 = n => Math.round(n * 100) / 100;
    const gf = v => [[10000,100],[8000,80],[6000,60],[4000,40]].find(([over]) => v > over)?.[1] || 0;
    o.cards.forEach(c => { c.gem_fee = g ? gf(+c.declared_value || 0) : 0; c.gem = c.gem_fee > 0; });
    const gm = o.cards.filter(c => c.gem).length, gemFees = o.cards.reduce((a, c) => a + c.gem_fee, 0);
    Object.assign(o, { grader_fee_each: fee, grade_each: g ? r2(fee + 20) : 0, graded_count: g, eval_count: ev, prep_count: pr, gem_count: gm, gem_fees: gemFees, grader_fees: r2(fee * g),
      pbg_share: r2(g * 12 + ev * 2 + pr * 2 + gemFees * 0.7), rr_share: r2(g * 8 + ev * 15 + pr * 5 + gemFees * 0.3), total: r2((g ? (fee + 20) * g : 0) + ev * 17 + pr * 7 + gemFees), tax: 0 });
    return o;
  }
  function dload(){ try{ const v = JSON.parse(localStorage.getItem(DKEY)); if(v) return v; }catch(e){} const s = { orders: seed().map(priceDemo), staff: null, pricing: { rules: { markup: 20, evalPrice: 17, prepPrice: 7,
      gemTiers: [{ over: 4000, fee: 40 }, { over: 6000, fee: 60 }, { over: 8000, fee: 80 }, { over: 10000, fee: 100 }], magPrice: 15,
      split: { pbgPerGrade: 12, rrPerGrade: 8, pbgPerEval: 2, pbgPerPrep: 2, pbgGemPct: 70, pbgMagPct: 100 }, pricesChecked: "Nov 9, 2026" }, graders: null, updated_at: null, updated_by: null } };
    dsave(s); return s; }
  function dsave(s){ try{ localStorage.setItem(DKEY, JSON.stringify(s)); }catch(e){ demoMem = s; } }
  let demoMem = null; const dget = () => demoMem || dload();
  const clone = o => JSON.parse(JSON.stringify(o));
  const SITE_KEY = "pbg.site.v1";
  function siteDemo(){ try{ return JSON.parse(localStorage.getItem(SITE_KEY)) || {}; }catch(e){ return {}; } }
  const demo = {
    async init(){},
    async currentStaff(){ return dget().staff; },
    async signIn(email, password){
      if(!email || !password) throw new Error("Enter an email and password.");
      const st = dget(); const role = /restored/i.test(email) ? "partner" : /^web|website/i.test(email) ? "web" : "owner";
      st.staff = { user_id: "demo", name: { partner: "Restored Rarity", web: "Website Editor", owner: "Demo Staff" }[role], role, email };
      dsave(st); return st.staff;
    },
    async signOut(){ const st = dget(); st.staff = null; dsave(st); },
    demoTeam(){ const st = dget(); if(!st.team){ st.team = [
        { user_id: "d-owner", name: "Jeff", role: "owner", pin: "482913", active: true, created_at: new Date().toISOString() },
        { user_id: "d-staff", name: "Jordan", role: "staff", pin: "517204", active: true, created_at: new Date().toISOString() },
        { user_id: "d-ipad", name: "Shop iPad", role: "staff", pin: "904372", active: true, created_at: new Date().toISOString() },
        { user_id: "d-rr", name: "Restored Rarity", role: "partner", pin: "260815", active: true, created_at: new Date().toISOString() },
        { user_id: "d-web", name: "PBG Website", role: "web", pin: "739461", active: true, created_at: new Date().toISOString() } ]; dsave(st); }
      return st; },
    async signInWithPin(pin){
      const st = demo.demoTeam(), m = st.team.find(t => t.active && t.pin === pin);
      if(!m) throw new Error("That PIN doesn't match anyone at PBG.");
      st.staff = { user_id: m.user_id, name: m.name, role: m.role, email: "" }; dsave(st); return st.staff;
    },
    async needsSetup(){ return false; },
    async setupOwner(){ throw new Error("Demo mode already has an owner (PIN 482913)."); },
    async team(){ const st = demo.demoTeam(); if(!st.staff || st.staff.role !== "owner") throw new Error("Only an owner can manage the team."); return clone(st.team.map(({ pin, ...t }) => ({ ...t, pin_set_at: t.created_at }))); },
    async teamAdd(name, role, pin){ const st = demo.demoTeam();
      if(!/^[0-9]{6}$/.test(pin)) throw new Error("PIN must be 6 digits."); if(!name.trim()) throw new Error("Enter a name.");
      if(st.team.some(t => t.pin === pin)) throw new Error("That PIN is already used by someone else. Pick another.");
      st.team.push({ user_id: uuid(), name: name.trim(), role, pin, active: true, created_at: new Date().toISOString() }); dsave(st); },
    async teamPin(id, pin){ const st = demo.demoTeam();
      if(!/^[0-9]{6}$/.test(pin)) throw new Error("PIN must be 6 digits.");
      if(st.team.some(t => t.pin === pin && t.user_id !== id)) throw new Error("That PIN is already used by someone else. Pick another.");
      st.team.find(t => t.user_id === id).pin = pin; dsave(st); },
    async teamUpdate(id, patch){ const st = demo.demoTeam(), t = st.team.find(x => x.user_id === id);
      const owners = st.team.filter(x => x.role === "owner" && x.active).length;
      if(t.role === "owner" && owners <= 1 && ((patch.role && patch.role !== "owner") || patch.active === false)) throw new Error("PBG needs at least one owner. Make someone else an owner first.");
      Object.assign(t, patch); dsave(st); },
    async teamRemove(id){ const st = demo.demoTeam(), t = st.team.find(x => x.user_id === id);
      if(st.staff && st.staff.user_id === id) throw new Error("You can't remove yourself.");
      if(t.role === "owner" && st.team.filter(x => x.role === "owner" && x.active).length <= 1) throw new Error("PBG needs at least one owner.");
      st.team = st.team.filter(x => x.user_id !== id); dsave(st); },
    async stages(){ return DEFAULT_STAGES; },
    async submitOrder(s){
      const st = dget(); if(st.orders.some(o => o.ticket === s.ticket)) return {};
      const o = { id: uuid(), ...orderRowFromSub(s), current_stage: "checked_in", updated_at: s.createdAt, grader_order_no: null, outbound_tracking: null, return_tracking: null, internal_notes: null, signature_path: null,
        cards: s.cards.map((c,i) => ({ id: uuid(), ...cardRowFromSub(c,i), front_path: c.thumb || null, back_path: null, eval_result: null, repair_quote: null, card_status: null, hammer_price: null, auction_lot_url: null })),
        stage_events: [{ id: uuid(), stage: "checked_in", note: "Cards accepted at PBG by " + s.staff, created_at: s.createdAt, visible_to_customer: true, created_by_name: (st.staff && st.staff.name) || "iPad" }] };
      st.orders.unshift(o); dsave(st); return { id: o.id };
    },
    async listOrders(){ const st = dget(); return clone(st.orders.filter(o => st.staff && (st.staff.role !== "partner" || o.has_prep)).map(o => ({ ...o, card_count: o.cards.length }))); },
    async auctionOrders(){ const st = dget(); if(!st.staff || !["owner","staff"].includes(st.staff.role)) throw new Error("Only PBG staff can see auctions"); return clone(st.orders.filter(o => o.auction_house)); },
    async getOrder(id){ const o = dget().orders.find(x => x.id === id); if(!o) throw new Error("Order not found"); return clone(o); },
    async setStage(id, code, note, visible, email){
      const st = dget(), o = st.orders.find(x => x.id === id);
      if(st.staff && st.staff.role === "partner" && !["at_partner","prep_done"].includes(code)) throw new Error("Partners can only set prep stages");
      o.current_stage = code; o.updated_at = new Date().toISOString();
      if(code === "ready" && !o.ready_at) o.ready_at = o.updated_at;
      if(code === "auction_paid" && !o.auction_paid_at) o.auction_paid_at = o.updated_at;
      const row = DEFAULT_STAGES.find(r => r.code === code);
      o.stage_events.push({ id: uuid(), stage: code, note: note || null, created_at: o.updated_at, visible_to_customer: visible !== false,
        email_customer: visible !== false && !!o.email && (email === undefined ? (row ? row.notify_customer !== false : true) : !!email), created_by_name: (st.staff && st.staff.name) || "Staff" });
      dsave(st);
    },
    async updateOrder(id, patch){ const st = dget(), o = st.orders.find(x => x.id === id); Object.assign(o, patch, { updated_at: new Date().toISOString() }); dsave(st); },
    async updateCard(id, patch){ const st = dget(); for(const o of st.orders){ const c = o.cards.find(x => x.id === id); if(c){ Object.assign(c, patch); dsave(st); return; } } },
    async getStatus(token){
      const o = dget().orders.find(x => x.public_token === token); if(!o) return null;
      return { ticket: o.ticket, first_name: o.customer_first, created_at: o.created_at, grader: o.grader, tier: o.tier, has_prep: o.has_prep, current_stage: o.current_stage,
        total: o.total, payment_when: o.payment_when, return_tracking: o.return_tracking, auction_house: o.auction_house || null, auction_mode: o.auction_mode || null, cards: clone(o.cards),
        events: o.stage_events.filter(e => e.visible_to_customer).map(e => ({ stage: e.stage, note: e.note, at: e.created_at })) };
    },
    photoUrl(path){ return path || null; },
    async payouts(from, to){
      const st = dget(); if(!st.staff || !["owner","partner"].includes(st.staff.role)) throw new Error("Only owners and the partner can see payouts");
      const a = new Date(from + "T00:00:00"), b = new Date(to + "T23:59:59");
      return st.orders.filter(o => { const d = new Date(o.created_at); return d >= a && d <= b; }).sort((x, y) => x.created_at.localeCompare(y.created_at))
        .map(o => ({ ticket: o.ticket, created_at: o.created_at, grader: o.grader, tier: o.tier, current_stage: o.current_stage, graded_count: o.graded_count || 0,
          eval_count: o.eval_count || 0, prep_count: o.prep_count || 0, gem_count: o.gem_count || 0, gem_fees: o.gem_fees || 0, mag_count: o.mag_count || 0, mag_fees: o.mag_fees || 0, total: o.total, tax: o.tax || 0, grader_fees: o.grader_fees || 0, pbg_share: o.pbg_share || 0, rr_share: o.rr_share || 0 }));
    },
    async getSite(){ return clone(siteDemo()); },
    async saveSite(key, value){
      const st = dget(); if(!st.staff || !["owner","web"].includes(st.staff.role)) throw new Error("Only the owner or a website account can edit the website");
      const all = siteDemo(); all[key] = { value, updated_at: new Date().toISOString(), updated_by: st.staff.name };
      try{ localStorage.setItem(SITE_KEY, JSON.stringify(all)); }catch(e){ throw new Error("This browser is out of space for demo photos. Use smaller photos or reset the demo."); }
    },
    async uploadSiteImage(dataUrl){ return dataUrl; },   // demo: the photo is kept inline
    async linkRestoredRarity(ticket, code){ const st = dget(), o = st.orders.find(x => x.ticket === ticket); if(o){ o.rr_code = code; dsave(st); } },
    async getPricing(){ const p = dget().pricing; return p ? clone(p) : null; },
    async savePricing(rules, graders){ const st = dget(); st.pricing = { rules, graders, updated_at: new Date().toISOString(), updated_by: (st.staff && st.staff.name) || "iPad" }; dsave(st); },
    demoTokens(){ return dget().orders.map(o => ({ ticket: o.ticket, token: o.public_token, name: o.customer_first + " " + o.customer_last, grader: o.grader })); },
    resetDemo(){ try{ localStorage.removeItem(DKEY); }catch(e){} demoMem = null; }
  };

  const impl = LIVE ? live : demo;
  let ready = null;
  window.PBG = {
    mode: LIVE ? "live" : "demo",
    init(){ return ready || (ready = impl.init()); },
    currentStaff: (...a) => impl.currentStaff(...a),
    signIn: (...a) => impl.signIn(...a),
    signOut: (...a) => impl.signOut(...a),
    signInWithPin: (...a) => impl.signInWithPin(...a),
    needsSetup: (...a) => impl.needsSetup(...a),
    setupOwner: (...a) => impl.setupOwner(...a),
    team: (...a) => impl.team(...a),
    teamAdd: (...a) => impl.teamAdd(...a),
    teamPin: (...a) => impl.teamPin(...a),
    teamUpdate: (...a) => impl.teamUpdate(...a),
    teamRemove: (...a) => impl.teamRemove(...a),
    stages: (...a) => impl.stages(...a),
    submitOrder: (...a) => impl.submitOrder(...a),
    listOrders: (...a) => impl.listOrders(...a),
    getOrder: (...a) => impl.getOrder(...a),
    setStage: (...a) => impl.setStage(...a),
    updateOrder: (...a) => impl.updateOrder(...a),
    updateCard: (...a) => impl.updateCard(...a),
    getStatus: (...a) => impl.getStatus(...a),
    photoUrl: (...a) => impl.photoUrl(...a),
    payouts: (...a) => impl.payouts(...a),
    auctionOrders: (...a) => impl.auctionOrders(...a),
    getPricing: (...a) => impl.getPricing(...a),
    linkRestoredRarity: (...a) => impl.linkRestoredRarity(...a),
    savePricing: (...a) => impl.savePricing(...a),
    getSite: (...a) => impl.getSite(...a),
    saveSite: (...a) => impl.saveSite(...a),
    uploadSiteImage: (...a) => impl.uploadSiteImage(...a),
    demoTokens: () => impl.demoTokens ? impl.demoTokens() : [],
    resetDemo: () => impl.resetDemo && impl.resetDemo(),
    stageList, graderName, statusUrl, newToken: uuid, DEFAULT_STAGES
  };
})();
