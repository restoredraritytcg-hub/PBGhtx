/* PBG website content.
   The text and photos written in index.html are the defaults. Anything saved in the staff
   portal's Website section (Supabase table site_content, read with the public site_get() call)
   replaces them when the page loads. Grading prices come from the same pricing the iPad uses.
   The last copy is kept in this browser so the next visit shows it straight away.
   Add ?nocms to the page address to see the built-in defaults only. */
(function(){
  const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const IG = "https://www.instagram.com/pbgcardshophtx/";

  const DEFAULTS = {
    business: {
      phone: "832-610-7081",
      street: "25170 I-45 N, Unit 9",
      city: "Spring, TX 77386",
      near: "Near Rayford Road, Spring, TX",
      instagram: "pbgcardshophtx",
      hours: DAYS.map(day => ({ day, closed: false, open: "11:00", close: "19:00" })),
      hoursNote: ""
    },
    announcement: { on: false, text: "", linkText: "", link: "", style: "red", until: "" },
    hero: {
      headline: "Sports cards and Pokémon, right off I-45 in Spring.",
      intro: "Buy, sell and trade singles, graded slabs and sealed product. Drop off your cards for PSA, CGC, BGS or TAG grading at the counter, and we'll handle the rest. New boxes hit the shelves every week.",
      tag: "Just in",
      images: [
        { src: "assets/topps-heritage.jpg", alt: "2026 Topps Heritage Football hobby boxes, in stock now", link: IG },
        { src: "assets/topps-flagship.jpg", alt: "Topps Flagship basketball hobby and jumbo boxes, now in stock", link: IG },
        { src: "assets/bowman-best.jpg", alt: "2026 Bowman Best hobby boxes, now in stock", link: IG }
      ]
    },
    promos: [
      { id: "gameday", on: true, title: "Game day at the shop", start: "", end: "",
        text: "Show up in your team's gear, tell us your favorite player and walk out with a free pack of football cards. Buy any football cards in store and get another pack free.",
        image: "assets/gameday.jpg", alt: "Game Day Giveaway flyer: free pack of football cards for wearing team gear" }
    ],
    events: [],
    shop: {
      intro: "Come dig through the singles, crack a pack at the counter, or find the slab you've been chasing.",
      photos: [
        { src: "assets/pokemon-case.jpg", caption: "Charizards in the case, priced and ready.", alt: "Display case full of Charizard cards in toploaders with PBG price tags" },
        { src: "assets/riftbound-shelf.jpg", caption: "Riftbound boxes on the counter.", alt: "Riftbound League of Legends booster boxes stacked on a glass case" }
      ],
      cats: [
        { title: "Sports cards", text: "Football, basketball, baseball and more. Hobby boxes, singles, rookies and autos." },
        { title: "Pokémon TCG", text: "Vintage to modern singles, chase cards and the newest sets." },
        { title: "Graded cards", text: "Slabs from PSA, CGC, Beckett, TAG and more." },
        { title: "Sealed product", text: "Hobby and jumbo boxes, ETBs, packs and collections, including Riftbound." }
      ]
    },
    instagram: {
      posts: [
        { image: "assets/gameday.jpg", alt: "Game Day Giveaway", link: IG },
        { image: "assets/bowman-best.jpg", alt: "Bowman Best in stock", link: IG },
        { image: "assets/topps-flagship.jpg", alt: "Topps Flagship in stock", link: IG },
        { image: "assets/riftbound-shelf.jpg", alt: "Riftbound boxes", link: IG },
        { image: "assets/sell-pokemon.jpg", alt: "Sell us your Pokémon cards", link: IG },
        { image: "assets/topps-heritage.jpg", alt: "Topps Heritage Football in stock", link: IG }
      ]
    },
    pricing: { markup: 20, evalPrice: 17, prepPrice: 7, magPrice: 15,
      gemTiers: [{ over: 4000, fee: 40 }, { over: 6000, fee: 60 }, { over: 8000, fee: 80 }, { over: 10000, fee: 100 }] }
  };

  /* ---------- helpers ---------- */
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const money = n => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const safeUrl = u => /^(https?:|mailto:|tel:|#|assets\/|data:image\/)/i.test(String(u || "").trim()) ? String(u).trim() : "";
  const mins = t => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
  function time12(t){ const m = mins(t), h = Math.floor(m / 60) % 24, mm = m % 60; return `${h % 12 || 12}${mm ? ":" + String(mm).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`; }
  const range = d => d.closed ? "Closed" : `${time12(d.open)} to ${time12(d.close)}`;
  const short = d => d.slice(0, 3);

  // "Open daily, 11 AM to 7 PM" or grouped runs like "Mon to Fri 11 AM to 7 PM, Sat 10 AM to 6 PM, Sun closed"
  function hoursGroups(hours){
    const order = [1,2,3,4,5,6,0].map(i => hours.find(h => h.day === DAYS[i]) || { day: DAYS[i], closed: true });
    const groups = [];
    order.forEach(d => { const k = range(d), g = groups[groups.length - 1]; if(g && g.k === k) g.days.push(d.day); else groups.push({ k, days: [d.day] }); });
    return groups;
  }
  function hoursShort(hours){
    const g = hoursGroups(hours);
    if(g.length === 1) return g[0].k === "Closed" ? "Closed" : `Open daily, ${g[0].k}`;
    return g.map(x => `${x.days.length > 1 ? short(x.days[0]) + " to " + short(x.days[x.days.length - 1]) : short(x.days[0])} ${x.k === "Closed" ? "closed" : x.k}`).join(", ");
  }
  function hoursLong(hours){
    const g = hoursGroups(hours);
    if(g.length === 1) return g[0].k === "Closed" ? "Closed" : `Monday to Sunday, ${g[0].k}`;
    return g.map(x => `${x.days.length > 1 ? x.days[0] + " to " + x.days[x.days.length - 1] : x.days[0]}: ${x.k === "Closed" ? "closed" : x.k}`).join("<br>");
  }
  function openStatus(hours){
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
    const day = parts.find(p => p.type === "weekday").value, t = (+parts.find(p => p.type === "hour").value % 24) * 60 + +parts.find(p => p.type === "minute").value;
    const by = d => hours.find(h => h.day === d) || { closed: true }, today = by(day);
    if(!today.closed && t >= mins(today.open) && t < mins(today.close)) return { open: true, text: `Open now until ${time12(today.close)}` };
    if(!today.closed && t < mins(today.open)) return { open: false, text: `Opens today at ${time12(today.open)}` };
    for(let i = 1; i <= 7; i++){ const dn = DAYS[(DAYS.indexOf(day) + i) % 7], d = by(dn); if(!d.closed) return { open: false, text: `Opens ${i === 1 ? "tomorrow" : dn} at ${time12(d.open)}` }; }
    return { open: false, text: "Closed" };
  }
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());   // YYYY-MM-DD
  const live = (start, end) => { const t = today(); return (!start || start <= t) && (!end || end >= t); };
  function fmtEventDate(d){ if(!d) return ""; const x = new Date(d + "T12:00:00"); return x.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }

  /* ---------- apply ---------- */
  function apply(c){
    c = c || {};
    const run = (name, fn) => { try{ fn(); }catch(e){ console.warn("Site content: " + name + " skipped", e); } };
    const B = Object.assign({}, DEFAULTS.business, c.business || {});

    run("business", () => {
      const tel = "+1" + String(B.phone).replace(/\D/g, "").slice(-10), dest = encodeURIComponent(`PBG Cards & Collectibles ${B.street} ${B.city}`);
      $$('a[href^="tel:"]').forEach(a => { a.href = "tel:" + tel; a.innerHTML = a.innerHTML.replace(/\d{3}-\d{3}-\d{4}/, esc(B.phone)); });
      $$('a[href*="google.com/maps/dir"]').forEach(a => { a.href = "https://www.google.com/maps/dir/?api=1&destination=" + dest; if(/I-45|Unit|TX/.test(a.textContent)) a.textContent = `${B.street}, ${B.city.replace(/\s*\d{5}$/, "")}`; });
      const ig = "https://www.instagram.com/" + String(B.instagram).replace(/^@/, "") + "/";
      $$('a[href*="instagram.com/"]').forEach(a => { a.href = ig; a.innerHTML = a.innerHTML.replace(/@[\w.]+/, "@" + esc(B.instagram.replace(/^@/, ""))); });
      const st = openStatus(B.hours), s = $("#status"), d = $("#dot");
      if(s){ s.textContent = st.text; d && d.classList.toggle("on", st.open); }
      if($("#stripHours")) $("#stripHours").textContent = hoursShort(B.hours);
      const f = $("#visitFacts");
      if(f) f.innerHTML = `<dt>Address</dt><dd>${esc(B.street)}<br>${esc(B.city)}</dd>
        <dt>Hours</dt><dd>${hoursLong(B.hours)}${B.hoursNote ? `<div class="hours-note">${esc(B.hoursNote)}</div>` : ""}</dd>
        <dt>Phone</dt><dd><a href="tel:${tel}">${esc(B.phone)}</a></dd>
        <dt>Instagram</dt><dd><a href="${ig}">@${esc(B.instagram.replace(/^@/, ""))}</a></dd>`;
      const fb = $(".map .fallback"); if(fb) fb.innerHTML = `<b>${esc(B.street)}</b><span class="muted">${esc(B.near || B.city)}</span>`;
      const fr = $(".map iframe"); if(fr && c.business) fr.src = "https://maps.google.com/maps?q=" + encodeURIComponent(`${B.street}, ${B.city}`) + "&z=15&output=embed";
      if($("#footInfo")) $("#footInfo").innerHTML = `${esc(B.street)}, ${esc(B.city)}<br>${esc(hoursShort(B.hours))}. ${esc(B.phone)}`;
    });

    run("announcement", () => {
      const A = c.announcement, el = $("#announce"); if(!el) return;
      const on = A && A.on && A.text && (!A.until || A.until >= today());
      el.hidden = !on; if(!on) return;
      el.className = A.style === "black" ? "black" : A.style === "gold" ? "gold" : "";
      const href = safeUrl(A.link);
      el.innerHTML = esc(A.text) + (href && A.linkText ? `<a href="${esc(href)}">${esc(A.linkText)}</a>` : "");
    });

    if(c.hero) run("hero", () => {
      const H = Object.assign({}, DEFAULTS.hero, c.hero);
      $("#heroTitle").textContent = H.headline; $("#heroIntro").textContent = H.intro;
      const imgs = (H.images || []).filter(i => safeUrl(i.src)).slice(0, 3), fan = $("#heroFan");
      if(fan && imgs.length) fan.innerHTML = imgs.map(i => `<a href="${esc(safeUrl(i.link) || "#grading")}"><img src="${esc(i.src)}" alt="${esc(i.alt || "")}" width="590" height="731"></a>`).join("") + (H.tag ? `<span class="tag">${esc(H.tag)}</span>` : "");
    });

    if(c.shop) run("shop", () => {
      const S = Object.assign({}, DEFAULTS.shop, c.shop);
      $("#shopIntro").textContent = S.intro;
      const ph = (S.photos || []).filter(p => safeUrl(p.src)).slice(0, 2);
      if(ph.length) $("#shopPhotos").innerHTML = ph.map(p => `<figure><img src="${esc(p.src)}" alt="${esc(p.alt || p.caption || "")}" loading="lazy">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ""}</figure>`).join("");
      const cats = (S.cats || []).filter(x => x.title);
      if(cats.length) $("#shopCats").innerHTML = cats.map(x => `<div><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></div>`).join("");
    });

    if(c.promos) run("promos", () => {
      const ig = "https://www.instagram.com/" + String(B.instagram).replace(/^@/, "") + "/";
      const list = (c.promos || []).filter(p => p.on !== false && p.title && live(p.start, p.end));
      $("#promos").innerHTML = list.map(p => `<section class="promo"><div class="wrap"><div>
        <h2>${esc(p.title)}</h2><p class="muted" style="margin-top:16px;font-size:19px">${esc(p.text)}</p>
        ${p.end ? `<p class="note">Through ${esc(fmtEventDate(p.end))}.</p>` : ""}
        <p class="note">Promotions change often. Follow <a href="${ig}">@${esc(B.instagram.replace(/^@/, ""))}</a> for this week's deals.</p></div>
        ${safeUrl(p.image) ? `<img src="${esc(p.image)}" alt="${esc(p.alt || p.title)}" loading="lazy">` : "<div></div>"}</div></section>`).join("");
    });

    run("events", () => {
      const list = (c.events || []).filter(e => e.title && e.date && e.date >= today()).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
      const sec = $("#events"); if(!sec) return;
      sec.hidden = !list.length; if(!list.length) return;
      $("#eventList").innerHTML = list.slice(0, 9).map(e => `<article class="event">${safeUrl(e.image) ? `<img src="${esc(e.image)}" alt="" loading="lazy">` : ""}
        <div class="b"><div class="when">${esc(fmtEventDate(e.date))}${e.time ? " · " + esc(e.time) : ""}</div><h3>${esc(e.title)}</h3>${e.text ? `<p>${esc(e.text)}</p>` : ""}</div></article>`).join("");
    });

    if(c.instagram) run("instagram", () => {
      const ig = "https://www.instagram.com/" + String(B.instagram).replace(/^@/, "") + "/";
      const posts = (c.instagram.posts || []).filter(p => safeUrl(p.image)).slice(0, 6);
      if(posts.length) $("#igGrid").innerHTML = posts.map(p => `<a href="${esc(safeUrl(p.link) || ig)}"><img src="${esc(p.image)}" alt="${esc(p.alt || "Instagram post")}" loading="lazy"></a>`).join("");
    });

    if(c.pricing) run("pricing", () => {
      const P = Object.assign({}, DEFAULTS.pricing, c.pricing), tiers = [...(P.gemTiers || [])].sort((a, b) => a.over - b.over);
      if($("#evalDeal")) $("#evalDeal").textContent = money(P.evalPrice) + " per card";
      if($("#prepDeal")) $("#prepDeal").textContent = money(P.prepPrice) + " per card";
      const g = $("#gradingPrices"); if(!g) return;
      g.textContent = `We submit to PSA, CGC, Beckett (BGS) and TAG. Grading prices are the company's current fee plus a ${money(P.markup)} PBG handling fee per card.` +
        (tiers.length ? ` Cards worth over ${money(tiers[0].over)} get our gem service, with a magnetic case to display the slab: ${tiers.map(t => `${money(t.fee)} over ${money(t.over)}`).join(", ").replace(/, ([^,]*)$/, " and $1")}.` : "") +
        (P.magPrice ? ` Want your slab ready to display? Add a matching magnetic slab case for ${money(P.magPrice)} a card with any grading submission, and we'll hand it to you with your slab at pickup.` : "") +
        " Ask at the counter for service levels and turnaround.";
    });
  }

  /* ---------- load ---------- */
  const CACHE = "pbg-site-content-v1";
  function demoContent(){
    try{
      const saved = JSON.parse(localStorage.getItem("pbg.site.v1")) || {};
      const out = Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, v.value]));
      const demo = JSON.parse(localStorage.getItem("pbg.demo.v14") || "null");
      if(demo && demo.pricing && demo.pricing.rules) out.pricing = demo.pricing.rules;
      return out;
    }catch(e){ return {}; }
  }
  function load(){
    if(/[?&]nocms\b/.test(location.search)) return apply({});
    const cfg = window.PBG_CONFIG || {};
    if(!cfg.supabaseUrl || !cfg.supabaseAnonKey) return apply(demoContent());   // demo: shows what was saved in this browser's staff portal
    let cached = null;
    try{ cached = JSON.parse(localStorage.getItem(CACHE) || "null"); }catch(e){}
    apply(cached || {});
    fetch(cfg.supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/site_get", {
      method: "POST", headers: { apikey: cfg.supabaseAnonKey, Authorization: "Bearer " + cfg.supabaseAnonKey, "Content-Type": "application/json" }, body: "{}"
    }).then(r => r.ok ? r.json() : null).then(c => {
      if(!c || typeof c !== "object") return;
      const fresh = JSON.stringify(c);
      try{ localStorage.setItem(CACHE, fresh); }catch(e){}
      if(JSON.stringify(cached) !== fresh) apply(c);
    }).catch(e => console.warn("Site content not loaded (using built-in content)", e));
  }

  window.PBGSite = { DEFAULTS, DAYS, apply, hoursShort, hoursLong, openStatus, time12 };
  if(document.getElementById("heroTitle")){
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();
  }
})();
