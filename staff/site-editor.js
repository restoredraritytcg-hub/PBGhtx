/* Staff portal > Website. Lets the owner (or a 'web' website-only account) change the public site
   without touching code: business info and hours, announcement bar, homepage hero, promotions,
   events, the "In the shop" section and the Instagram grid. Saved per section in Supabase
   (site_content); the public site reads it with site_get(). Grading prices are not edited here:
   they come from the pricing the iPad uses (iPad > Staff > Settings). */
const SITE_TABS = [["business","Business info"],["announcement","Announcement bar"],["hero","Homepage top"],["promos","Promotions"],["events","Events"],["shop","In the shop"],["instagram","Instagram grid"]];
let siteData = null;

const D = () => window.PBGSite.DEFAULTS;
const siteVal = key => { const r = siteData && siteData[key]; return structuredClone(r ? r.value : D()[key]); };
const sid = () => Math.random().toString(36).slice(2, 9);

function shrinkImage(file, max){
  return new Promise((res, rej) => {
    if(!/^image\//.test(file.type)) return rej(new Error("That file isn't a photo."));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", .85)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Couldn't read that photo.")); };
    img.src = url;
  });
}
// A photo picker: shows the current photo, uploads a new one, writes the URL into the hidden input.
const photoField = (name, src, label = "Photo") => `<div class="ph" data-ph="${esc(name)}">
  <div class="phimg" style="${src ? `background-image:url('${esc(src.startsWith("assets/") ? "../" + src : src)}')` : ""}">${src ? "" : "No photo"}</div>
  <div><span class="f" style="font-size:13px;font-weight:650;color:var(--steel)">${esc(label)}</span>
  <div class="next" style="margin-top:4px"><label class="btn btn-line btn-sm">Choose photo<input type="file" accept="image/*" hidden></label>
  ${src ? `<button type="button" class="btn btn-ghost btn-sm" data-clear>Remove</button>` : ""}</div>
  <input type="hidden" data-src value="${esc(src || "")}"></div></div>`;
function wirePhotos(root){
  root.querySelectorAll("[data-ph]").forEach(box => {
    const inp = box.querySelector("input[type=file]"), hid = box.querySelector("[data-src]"), im = box.querySelector(".phimg");
    inp.onchange = async () => {
      const f = inp.files[0]; if(!f) return; im.textContent = "Uploading…";
      try{ const d = await shrinkImage(f, PBG.mode === "demo" ? 900 : 1600), url = await PBG.uploadSiteImage(d);
        hid.value = url; im.style.backgroundImage = `url('${url}')`; im.textContent = ""; toast("Photo ready. Save to put it on the site."); }
      catch(e){ im.textContent = ""; toast(e.message); }
    };
    const clr = box.querySelector("[data-clear]"); if(clr) clr.onclick = () => { hid.value = ""; im.style.backgroundImage = ""; im.textContent = "No photo"; };
  });
}
const phVal = (root, name) => { const b = root.querySelector(`[data-ph="${name}"] [data-src]`); return b ? b.value : ""; };

async function saveSection(key, value, btn){
  btn.disabled = true;
  try{ await PBG.saveSite(key, value); siteData = await PBG.getSite(); toast("Saved. It's live on the website now."); sitePage(key); }
  catch(e){ toast(e.message); btn.disabled = false; }
}
const savedLine = key => { const r = siteData && siteData[key]; return r ? `Last saved ${fmtDate(r.updated_at, true)}${r.updated_by ? " by " + esc(r.updated_by) : ""}.` : "Showing the website's original content. Nothing saved yet."; };

async function sitePage(tab){
  if(!SITE_TABS.some(([k]) => k === tab)) tab = "business";
  if(!siteData){ try{ siteData = await PBG.getSite(); }catch(e){ $("#app").innerHTML = `<div class="wrap"><div class="panel">Couldn't load the website content: ${esc(e.message)}</div></div>`; return; } }
  const siteUrl = (PBG_CONFIG.statusUrl || "../status.html").replace(/status\.html.*$/, "");
  $("#app").innerHTML = `<div class="wrap site">
    <div class="top"><h1>Website</h1><a class="btn btn-line" href="${esc(PBG.mode === "demo" ? "../" : siteUrl)}" target="_blank" rel="noopener">View the website</a></div>
    <nav class="groups" aria-label="Website sections">${SITE_TABS.map(([k, l]) => `<a class="chip" href="#site/${k}" aria-pressed="${k === tab}" style="text-decoration:none">${l}</a>`).join("")}</nav>
    <div id="sbody"></div></div>`;
  const body = $("#sbody");
  ({ business, announcement, hero, promos, events, shop, instagram })[tab](body);
  wirePhotos(body);
}

/* ---------- Business info and hours ---------- */
function business(body){
  const B = Object.assign({}, D().business, siteVal("business"));
  body.innerHTML = `<div class="panel"><h2>Business info</h2><p class="hint">Used everywhere on the site: the header call button, the hours strip, "Open now", the Visit section, the map and the footer.</p>
    <div class="g2">
      <label class="f">Phone<input class="t" id="bPhone" value="${esc(B.phone)}"></label>
      <label class="f">Instagram handle<input class="t" id="bIg" value="${esc(B.instagram)}" placeholder="pbgcardshophtx"></label>
      <label class="f">Street address<input class="t" id="bStreet" value="${esc(B.street)}"></label>
      <label class="f">City, state, ZIP<input class="t" id="bCity" value="${esc(B.city)}"></label>
      <label class="f wide">Landmark under the map (optional)<input class="t" id="bNear" value="${esc(B.near)}"></label>
    </div></div>
    <div class="panel"><h2>Hours</h2><p class="hint">Times are Central. The homepage shows "Open now" or when you open next from these.</p>
      <div class="hours">${PBGSite.DAYS.map((d, i) => { const h = B.hours.find(x => x.day === d) || { day: d, closed: true, open: "11:00", close: "19:00" };
        return `<div class="hr" data-day="${d}"><b>${d}</b><label class="toggle"><input type="checkbox" data-closed ${h.closed ? "checked" : ""}> Closed</label>
          <input class="t" type="time" data-open value="${esc(h.open)}" ${h.closed ? "disabled" : ""}><span>to</span><input class="t" type="time" data-close value="${esc(h.close)}" ${h.closed ? "disabled" : ""}></div>`; }).join("")}</div>
      <label class="f" style="margin-top:14px">Hours note (optional, e.g. "Closed Thanksgiving Day")<input class="t" id="bNote" value="${esc(B.hoursNote)}"></label>
      <p class="hint" id="hPrev" style="margin-top:12px"></p>
      <div class="next"><button class="btn btn-red" id="save">Save business info</button><span class="hint">${savedLine("business")}</span></div></div>`;
  const read = () => ({ phone: $("#bPhone").value.trim(), instagram: $("#bIg").value.trim().replace(/^@/, ""), street: $("#bStreet").value.trim(), city: $("#bCity").value.trim(), near: $("#bNear").value.trim(),
    hoursNote: $("#bNote").value.trim(), hours: [...body.querySelectorAll(".hr")].map(r => ({ day: r.dataset.day, closed: r.querySelector("[data-closed]").checked, open: r.querySelector("[data-open]").value || "11:00", close: r.querySelector("[data-close]").value || "19:00" })) });
  const prev = () => { const v = read(); $("#hPrev").innerHTML = `On the site: <b>${esc(PBGSite.hoursShort(v.hours))}</b>`; };
  body.querySelectorAll("[data-closed]").forEach(c => c.onchange = () => { c.closest(".hr").querySelectorAll("input[type=time]").forEach(t => t.disabled = c.checked); prev(); });
  body.querySelectorAll("input[type=time]").forEach(t => t.oninput = prev); prev();
  $("#save").onclick = () => {
    const v = read();
    if(v.phone.replace(/\D/g, "").length < 10) return toast("Enter a 10-digit phone number.");
    if(!v.street || !v.city) return toast("Enter the full address.");
    if(v.hours.some(h => !h.closed && h.close <= h.open)) return toast("Closing time has to be after opening time.");
    saveSection("business", v, $("#save"));
  };
}

/* ---------- Announcement bar ---------- */
function announcement(body){
  const A = Object.assign({}, D().announcement, siteVal("announcement"));
  body.innerHTML = `<div class="panel"><h2>Announcement bar</h2><p class="hint">A strip across the very top of the website. Good for holiday hours, a new release or a sale.</p>
    <label class="toggle" style="margin-top:14px"><input type="checkbox" id="aOn" ${A.on ? "checked" : ""}> <b>Show the announcement bar</b></label>
    <div class="g2" style="margin-top:12px">
      <label class="f wide">Message<input class="t" id="aText" maxlength="160" value="${esc(A.text)}" placeholder="e.g. Prismatic Evolutions restock Saturday at 11 AM"></label>
      <label class="f">Link text (optional)<input class="t" id="aLinkText" value="${esc(A.linkText)}" placeholder="e.g. See details"></label>
      <label class="f">Link (optional)<input class="t" id="aLink" value="${esc(A.link)}" placeholder="https://… or #grading"></label>
      <label class="f">Color<select class="t" id="aStyle">${[["red","PBG red"],["black","Black"],["gold","Gold"]].map(([k, l]) => `<option value="${k}" ${A.style === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="f">Hide automatically after (optional)<input class="t" type="date" id="aUntil" value="${esc(A.until)}"></label>
    </div>
    <div class="annprev" id="aPrev"></div>
    <div class="next"><button class="btn btn-red" id="save">Save announcement</button><span class="hint">${savedLine("announcement")}</span></div></div>`;
  const read = () => ({ on: $("#aOn").checked, text: $("#aText").value.trim(), linkText: $("#aLinkText").value.trim(), link: $("#aLink").value.trim(), style: $("#aStyle").value, until: $("#aUntil").value });
  const prev = () => { const v = read(), p = $("#aPrev"); p.className = "annprev " + v.style; p.hidden = !(v.on && v.text); p.innerHTML = esc(v.text) + (v.linkText ? ` <u>${esc(v.linkText)}</u>` : ""); };
  body.querySelectorAll("input,select").forEach(i => i.addEventListener("input", prev)); prev();
  $("#save").onclick = () => { const v = read(); if(v.on && !v.text) return toast("Type a message, or untick Show."); if(v.link && !/^(https?:\/\/|#|tel:|mailto:)/.test(v.link)) return toast("Links need to start with https://"); saveSection("announcement", v, $("#save")); };
}

/* ---------- Homepage top ---------- */
function hero(body){
  const H = Object.assign({}, D().hero, siteVal("hero")), imgs = [0, 1, 2].map(i => H.images[i] || { src: "", alt: "", link: "" });
  body.innerHTML = `<div class="panel"><h2>Homepage top</h2><p class="hint">The big headline and the three fanned photos people see first. Use the photos for what just came in.</p>
    <label class="f" style="margin-top:14px">Headline<input class="t" id="hHead" maxlength="90" value="${esc(H.headline)}"></label>
    <label class="f" style="margin-top:12px">Intro<textarea class="t" id="hIntro" maxlength="360">${esc(H.intro)}</textarea></label>
    <label class="f" style="margin-top:12px;max-width:260px">Photo badge (blank for none)<input class="t" id="hTag" maxlength="20" value="${esc(H.tag)}"></label></div>
    <div class="panel"><h2>Photos</h2><p class="hint">Tall photos work best (about 4 by 5). They show in this order, front to back.</p>
    ${imgs.map((im, i) => `<div class="item">${photoField("h" + i, im.src, "Photo " + (i + 1))}
      <div class="g2"><label class="f">Describe the photo (for screen readers and Google)<input class="t" data-alt="${i}" value="${esc(im.alt)}"></label>
      <label class="f">Link when tapped (optional)<input class="t" data-link="${i}" value="${esc(im.link)}" placeholder="https://www.instagram.com/…"></label></div></div>`).join("")}
    <div class="next"><button class="btn btn-red" id="save">Save homepage top</button><span class="hint">${savedLine("hero")}</span></div></div>`;
  $("#save").onclick = () => {
    const v = { headline: $("#hHead").value.trim(), intro: $("#hIntro").value.trim(), tag: $("#hTag").value.trim(),
      images: [0, 1, 2].map(i => ({ src: phVal(body, "h" + i), alt: $(`[data-alt="${i}"]`).value.trim(), link: $(`[data-link="${i}"]`).value.trim() })).filter(x => x.src) };
    if(!v.headline) return toast("The headline can't be empty.");
    if(!v.images.length) return toast("Keep at least one photo.");
    saveSection("hero", v, $("#save"));
  };
}

/* ---------- Promotions ---------- */
function promos(body){
  const list = siteVal("promos") || [];
  const card = (p, i) => `<div class="item" data-i="${i}">
    <div class="ihead"><b>${esc(p.title || "New promotion")}</b><label class="toggle" style="margin:0"><input type="checkbox" data-on ${p.on !== false ? "checked" : ""}> Show on the site</label>
      <span class="spacer"></span><button type="button" class="btn btn-ghost btn-sm" data-up ${i ? "" : "disabled"}>Move up</button><button type="button" class="btn btn-ghost btn-sm" data-del>Delete</button></div>
    <div class="g2"><label class="f wide">Title<input class="t" data-k="title" value="${esc(p.title)}"></label>
      <label class="f wide">Details<textarea class="t" data-k="text">${esc(p.text)}</textarea></label>
      <label class="f">Starts (optional)<input class="t" type="date" data-k="start" value="${esc(p.start)}"></label>
      <label class="f">Ends (optional, hides itself after)<input class="t" type="date" data-k="end" value="${esc(p.end)}"></label></div>
    ${photoField("p" + i, p.image, "Flyer or photo (square works best)")}</div>`;
  body.innerHTML = `<div class="panel"><h2>Promotions</h2><p class="hint">Deals and giveaways shown under "Sell your cards". Each one can start and end on its own dates. Untick Show to hide one without deleting it.</p>
    <div id="plist">${list.map(card).join("") || `<div class="empty">No promotions. The section is hidden on the site.</div>`}</div>
    <div class="next"><button class="btn btn-line" id="add">Add a promotion</button></div>
    <div class="next"><button class="btn btn-red" id="save">Save promotions</button><span class="hint">${savedLine("promos")}</span></div></div>`;
  const read = () => [...body.querySelectorAll("#plist .item")].map(el => ({ id: list[+el.dataset.i]?.id || sid(), on: el.querySelector("[data-on]").checked,
    ...Object.fromEntries([...el.querySelectorAll("[data-k]")].map(x => [x.dataset.k, x.value.trim()])), image: phVal(el, "p" + el.dataset.i), alt: list[+el.dataset.i]?.alt || "" }));
  const rerender = v => { list.length = 0; list.push(...v); $("#plist").innerHTML = list.map(card).join("") || `<div class="empty">No promotions. The section is hidden on the site.</div>`; wirePhotos(body); wire(); };
  const wire = () => body.querySelectorAll("#plist .item").forEach(el => {
    const i = +el.dataset.i;
    el.querySelector("[data-del]").onclick = async () => { if(await confirmBox("Delete this promotion?", "It comes off the website when you save.", "Delete")){ const v = read(); v.splice(i, 1); rerender(v); } };
    el.querySelector("[data-up]").onclick = () => { const v = read(); [v[i - 1], v[i]] = [v[i], v[i - 1]]; rerender(v); };
  });
  wire();
  $("#add").onclick = () => { const v = read(); v.push({ id: sid(), on: true, title: "", text: "", start: "", end: "", image: "" }); rerender(v); };
  $("#save").onclick = () => { const v = read(); if(v.some(p => !p.title)) return toast("Every promotion needs a title."); if(v.some(p => p.start && p.end && p.end < p.start)) return toast("An end date is before its start date."); saveSection("promos", v, $("#save")); };
}

/* ---------- Events ---------- */
function events(body){
  const list = (siteVal("events") || []).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const todayIso = new Date().toISOString().slice(0, 10);
  const card = (e, i) => `<div class="item ${e.date && e.date < todayIso ? "past" : ""}" data-i="${i}">
    <div class="ihead"><b>${esc(e.title || "New event")}</b>${e.date && e.date < todayIso ? '<span class="tag" style="background:#EEE;color:#555">Past, hidden on the site</span>' : ""}<span class="spacer"></span><button type="button" class="btn btn-ghost btn-sm" data-del>Delete</button></div>
    <div class="g2"><label class="f">Date<input class="t" type="date" data-k="date" value="${esc(e.date)}"></label>
      <label class="f">Time (optional)<input class="t" data-k="time" value="${esc(e.time)}" placeholder="e.g. 6 PM"></label>
      <label class="f wide">Title<input class="t" data-k="title" value="${esc(e.title)}" placeholder="e.g. Pokémon league night"></label>
      <label class="f wide">Details (optional)<textarea class="t" data-k="text">${esc(e.text)}</textarea></label></div>
    ${photoField("e" + i, e.image, "Photo (optional)")}</div>`;
  body.innerHTML = `<div class="panel"><h2>Events</h2><p class="hint">Tournaments, release nights, meetups. Upcoming events show in an "Events at the shop" section; past ones drop off by themselves. With no upcoming events the section is hidden.</p>
    <div id="elist">${list.map(card).join("") || `<div class="empty">No events yet.</div>`}</div>
    <div class="next"><button class="btn btn-line" id="add">Add an event</button></div>
    <div class="next"><button class="btn btn-red" id="save">Save events</button><span class="hint">${savedLine("events")}</span></div></div>`;
  const read = () => [...body.querySelectorAll("#elist .item")].map(el => ({ id: list[+el.dataset.i]?.id || sid(),
    ...Object.fromEntries([...el.querySelectorAll("[data-k]")].map(x => [x.dataset.k, x.value.trim()])), image: phVal(el, "e" + el.dataset.i) }));
  const rerender = v => { list.length = 0; list.push(...v); $("#elist").innerHTML = list.map(card).join("") || `<div class="empty">No events yet.</div>`; wirePhotos(body); wire(); };
  const wire = () => body.querySelectorAll("#elist .item").forEach(el => el.querySelector("[data-del]").onclick = async () => {
    if(await confirmBox("Delete this event?", "It comes off the website when you save.", "Delete")){ const v = read(); v.splice(+el.dataset.i, 1); rerender(v); } });
  wire();
  $("#add").onclick = () => { const v = read(); v.push({ id: sid(), date: "", time: "", title: "", text: "", image: "" }); rerender(v); };
  $("#save").onclick = () => { const v = read(); if(v.some(e => !e.title || !e.date)) return toast("Every event needs a date and a title."); saveSection("events", v, $("#save")); };
}

/* ---------- In the shop ---------- */
function shop(body){
  const S = Object.assign({}, D().shop, siteVal("shop")), ph = [0, 1].map(i => S.photos[i] || { src: "", caption: "" }), cats = [0, 1, 2, 3].map(i => S.cats[i] || { title: "", text: "" });
  body.innerHTML = `<div class="panel"><h2>In the shop</h2><p class="hint">The "What's in the cases" section: two photos and up to four things you carry.</p>
    <label class="f" style="margin-top:14px">Intro<textarea class="t" id="sIntro">${esc(S.intro)}</textarea></label></div>
    <div class="panel"><h2>Photos</h2>${ph.map((p, i) => `<div class="item">${photoField("s" + i, p.src, "Photo " + (i + 1))}
      <label class="f">Caption<input class="t" data-cap="${i}" value="${esc(p.caption)}"></label></div>`).join("")}</div>
    <div class="panel"><h2>What you carry</h2><div class="g2">${cats.map((c, i) => `<div><label class="f">Heading<input class="t" data-ct="${i}" value="${esc(c.title)}"></label>
      <label class="f" style="margin-top:6px">Description<textarea class="t" data-cx="${i}">${esc(c.text)}</textarea></label></div>`).join("")}</div>
    <div class="next"><button class="btn btn-red" id="save">Save In the shop</button><span class="hint">${savedLine("shop")}</span></div></div>`;
  $("#save").onclick = () => saveSection("shop", { intro: $("#sIntro").value.trim(),
    photos: [0, 1].map(i => ({ src: phVal(body, "s" + i), caption: $(`[data-cap="${i}"]`).value.trim(), alt: $(`[data-cap="${i}"]`).value.trim() })).filter(p => p.src),
    cats: [0, 1, 2, 3].map(i => ({ title: $(`[data-ct="${i}"]`).value.trim(), text: $(`[data-cx="${i}"]`).value.trim() })).filter(c => c.title) }, $("#save"));
}

/* ---------- Instagram grid ---------- */
function instagram(body){
  const I = siteVal("instagram") || D().instagram, posts = [0, 1, 2, 3, 4, 5].map(i => I.posts[i] || { image: "", link: "", alt: "" });
  body.innerHTML = `<div class="panel"><h2>Instagram grid</h2><p class="hint">Six square photos in the "On the feed" section. Paste each post's link so tapping a photo opens that post (open the post on Instagram, tap ⋯ > Copy link).</p>
    <div class="iggrid">${posts.map((p, i) => `<div class="item">${photoField("i" + i, p.image, "Post " + (i + 1))}
      <label class="f">Post link<input class="t" data-link="${i}" value="${esc(p.link)}" placeholder="https://www.instagram.com/p/…"></label>
      <label class="f" style="margin-top:6px">Describe the photo<input class="t" data-alt="${i}" value="${esc(p.alt)}"></label></div>`).join("")}</div>
    <div class="next"><button class="btn btn-red" id="save">Save Instagram grid</button><span class="hint">${savedLine("instagram")}</span></div></div>`;
  $("#save").onclick = () => {
    const v = { posts: [0, 1, 2, 3, 4, 5].map(i => ({ image: phVal(body, "i" + i), link: $(`[data-link="${i}"]`).value.trim(), alt: $(`[data-alt="${i}"]`).value.trim() })).filter(p => p.image) };
    if(v.posts.some(p => p.link && !/^https:\/\/(www\.)?instagram\.com\//.test(p.link))) return toast("Post links should start with https://www.instagram.com/");
    saveSection("instagram", v, $("#save"));
  };
}

/* styles for this section */
document.head.insertAdjacentHTML("beforeend", `<style>
.site .panel+.panel{margin-top:16px}
.site .hint{color:var(--steel);font-size:14px;margin-top:6px}
.site .g2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
.site .g2 .wide{grid-column:1/-1}
@media (max-width:700px){.site .g2{grid-template-columns:1fr}}
.site .item{border-top:1px solid var(--line);padding:16px 0}
.site .item.past{opacity:.6}
.site .ihead{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.site .spacer{margin-left:auto}
.site .ph{display:grid;grid-template-columns:120px 1fr;gap:14px;align-items:center;margin:12px 0}
.site .phimg{width:120px;height:120px;border-radius:10px;border:1px solid var(--line);background:#EEE center/cover no-repeat;display:grid;place-items:center;font-size:12px;color:var(--steel)}
.site .hours{display:grid;gap:8px;margin-top:12px}
.site .hr{display:grid;grid-template-columns:110px 100px 160px 24px 160px;gap:10px;align-items:center}
.site .hr .toggle{margin:0}
@media (max-width:700px){.site .hr{grid-template-columns:1fr 1fr}.site .hr span{display:none}}
.site .annprev{margin-top:14px;background:var(--red);color:#fff;text-align:center;font-weight:800;padding:10px;border-radius:8px}
.site .annprev.black{background:#000}.site .annprev.gold{background:#F5C518;color:#111}
.site .iggrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:0 24px}
</style>`);
