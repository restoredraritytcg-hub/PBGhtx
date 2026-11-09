// Card-name suggestions, shared with restoredraritytcg.com and the other client sites.
// PBG copy: loads the live list from restoredraritytcg.com (updated on the 1st and 15th by the
// Restored Rarity repo's "Update card list" workflow), falls back to the GitHub copy, then to the
// cards.json bundled with this app (works offline). Extra options here: { fill(card), enabled() }.
// Original: restoredraritytcg-hub/restoredraritytcg portal/cardsearch.js. Keep the search logic in sync.
//
// Card-name suggestions from cards.json (built by tools/build_card_catalog.py).
// Plain script (window.RRCardSearch) so both the main site's intake form and the
// admin portal can use it:
//
//   RRCardSearch.attach(input)                    // picking fills "Charizard — Base Set 4/102 (1999)"
//   RRCardSearch.attach(nameInput, { details })   // name -> "Charizard", details -> "Base Set · 4/102 · 1999"
//
// Typing anything is still allowed; suggestions only help. The list loads on first focus.
(function () {
  const SRC = (document.currentScript && document.currentScript.src) || "";
  const LOCAL = SRC ? new URL("cards.json", SRC).href : "cards.json";
  const SOURCES = [
    "https://restoredraritytcg.com/portal/cards.json",
    "https://raw.githubusercontent.com/restoredraritytcg-hub/restoredraritytcg/main/portal/cards.json",
    LOCAL
  ];
  async function fetchList() {
    let last;
    for (const u of SOURCES) {
      try { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); const d = await r.json(); if (d && d.cards && d.cards.length > 1000) return d; }
      catch (e) { last = e; }
    }
    throw last || new Error("Card list unavailable");
  }
  const MAX = 8;
  let loading = null, DB = null;

  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9/]+/g, " ").trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function load() {
    if (!loading) loading = fetchList().then((d) => {
      const cards = d.cards.map(([name, si, num, img]) => {
        const [, set, year, total, path] = d.sets[si];
        const number = /^\d+$/.test(num) && total ? `${num}/${total}` : num;
        const pic = img === 1 ? `${d.img}${path}/${num}/low.webp` : img ? `${img}/low.webp` : "";
        return { name, set, year, number, pic, n: norm(name), num: norm(num), full: norm(number),
          hay: norm(`${name} ${set} ${number} ${year}`), order: si };
      });
      DB = cards;
      return cards;
    }).catch((e) => { loading = null; throw e; });
    return loading;
  }

  function search(q) {
    const words = norm(q.replace(/#/g, " ")).split(" ").filter(Boolean);
    if (!DB || !words.length || q.trim().length < 2) return [];
    const nq = norm(q);
    const out = [];
    for (const c of DB) {
      if (!words.every((w) => c.hay.includes(w))) continue;
      let score = 0;
      if (c.n === nq) score += 100;
      else if (c.n.startsWith(nq)) score += 60;
      else if (c.n.startsWith(words[0])) score += 40;
      else if (c.n.split(" ").some((t) => t.startsWith(words[0]))) score += 20;
      if (words.some((w) => w === c.num || w === c.full)) score += 50; // "torchic 108" -> card #108 first
      out.push([score, c]);
    }
    out.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length || a[1].order - b[1].order);
    return out.slice(0, MAX).map((x) => x[1]);
  }

  const label = (c) => `${c.name} — ${c.set} ${c.number}${c.year ? ` (${c.year})` : ""}`;
  const details = (c) => [c.set, c.number, c.year].filter(Boolean).join(" · ");

  let css = false;
  function addCss() {
    if (css) return; css = true;
    const st = document.createElement("style");
    st.textContent = `
.rrcs{position:fixed;z-index:9999;max-height:380px;overflow:auto;background:#fff;border:2px solid #141414;
  border-radius:12px;box-shadow:0 14px 34px rgba(0,0,0,.25);font:16px/1.3 Archivo,system-ui,sans-serif;color:#141414;padding:6px}
.rrcs-i{display:flex;gap:12px;align-items:center;padding:8px 10px;border-radius:8px;cursor:pointer;min-height:56px}
.rrcs-i.on,.rrcs-i:hover{background:#FDECEC;outline:2px solid #E31B23}
.rrcs-i img{width:36px;height:50px;object-fit:cover;border-radius:4px;background:#EEE;flex:none}
.rrcs-i .ph{width:36px;height:50px;border-radius:4px;background:#EEE;flex:none}
.rrcs-i b{display:block;font-weight:700}
.rrcs-i span{color:#666D7A;font-size:13px}
.rrcs-note{padding:8px 10px;color:#666D7A;font-size:13px}`;
    document.head.appendChild(st);
  }

  function attach(input, opts = {}) {
    if (!input || input._rrcs) return; input._rrcs = true;
    addCss();
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-autocomplete", "list");
    const box = document.createElement("div");
    box.className = "rrcs"; box.setAttribute("role", "listbox"); box.hidden = true;
    document.body.appendChild(box);
    let items = [], on = -1, timer = 0;

    const place = () => {
      const r = input.getBoundingClientRect();
      box.style.left = r.left + "px"; box.style.width = Math.max(r.width, 260) + "px";
      const below = window.innerHeight - r.bottom;
      if (below < 200 && r.top > below) { box.style.top = ""; box.style.bottom = (window.innerHeight - r.top + 4) + "px"; }
      else { box.style.bottom = ""; box.style.top = (r.bottom + 4) + "px"; }
    };
    const close = () => { box.hidden = true; on = -1; input.setAttribute("aria-expanded", "false"); };
    const highlight = (i) => {
      on = i;
      [...box.children].forEach((el, j) => el.classList.toggle("on", j === i));
      if (box.children[i]) box.children[i].scrollIntoView({ block: "nearest" });
    };
    const pick = (c) => {
      if (opts.fill) { input.value = c.name; opts.fill(c); }
      else if (opts.details) { input.value = c.name; opts.details.value = details(c); }
      else input.value = label(c);
      input.dataset.rrPicked = input.value;
      input.dataset.rrCard = JSON.stringify({ set: c.set || "", cardNo: c.number || "", year: c.year ? String(c.year) : "" });
      close();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (opts.onPick) opts.onPick(c);
    };
    const render = () => {
      if (opts.enabled && !opts.enabled()) { close(); return; }
      items = search(input.value);
      if (!items.length) { close(); return; }
      box.innerHTML = items.map((c) => `<div class="rrcs-i" role="option">
        ${c.pic ? `<img loading="lazy" alt="" src="${esc(c.pic)}" onerror="this.className='ph';this.removeAttribute('src')">` : `<div class="ph"></div>`}
        <div><b>${esc(c.name)}</b><span>${esc(c.set)} · ${esc(c.number)}${c.year ? " · " + esc(c.year) : ""}</span></div></div>`).join("")
        + `<div class="rrcs-note">Not listed? Just type it in.</div>`;
      [...box.querySelectorAll(".rrcs-i")].forEach((el, i) => {
        el.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the input
        el.addEventListener("click", () => pick(items[i]));
      });
      on = -1; place(); box.hidden = false; input.setAttribute("aria-expanded", "true");
    };

    input.addEventListener("focus", () => { load().then(() => { if (document.activeElement === input && input.value) render(); }).catch(() => {}); });
    input.addEventListener("input", (e) => {
      if (!e.isTrusted) return; // our own event after a pick
      clearTimeout(timer);
      timer = setTimeout(() => load().then(render).catch(() => {}), 80);
    });
    input.addEventListener("keydown", (e) => {
      if (box.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); highlight(Math.min(on + 1, items.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlight(Math.max(on - 1, 0)); }
      else if (e.key === "Enter" && on >= 0) { e.preventDefault(); pick(items[on]); }
      else if (e.key === "Escape") close();
    });
    input.addEventListener("blur", () => setTimeout(close, 120));
    window.addEventListener("scroll", () => { if (!box.hidden) place(); }, true);
    window.addEventListener("resize", () => { if (!box.hidden) place(); });
    // the input was removed from the page (re-render) -> drop its list too
    new MutationObserver((_, obs) => { if (!input.isConnected) { box.remove(); obs.disconnect(); } })
      .observe(document.body, { childList: true, subtree: true });
  }

  // Set, card # and year for a card-name field: from the suggestion that was picked, or (typed name) from the list
  // when the text matches exactly one card. Otherwise blank, so the portal shows "Set needed".
  async function info(input) {
    const blank = { set: "", cardNo: "", year: "" }, text = String(input && input.value || "").trim();
    if (!text) return blank;
    if (input.dataset.rrPicked === input.value && input.dataset.rrCard) { try { return JSON.parse(input.dataset.rrCard); } catch {} }
    try { await load(); } catch { return blank; }
    const out = (c) => ({ set: c.set || "", cardNo: c.number || "", year: c.year ? String(c.year) : "" });
    const exact = DB.filter((c) => label(c) === text); if (exact.length === 1) return out(exact[0]);
    const nq = norm(text), words = nq.split(" ").filter(Boolean);
    const all = DB.filter((c) => words.every((w) => c.hay.includes(w)));
    if (all.length === 1) return out(all[0]);
    const same = DB.filter((c) => c.n === nq); if (same.length === 1) return out(same[0]);
    return blank;
  }
  const detailsOf = (i) => [i.set, i.cardNo, i.year].filter(Boolean).join(" · ");

  window.RRCardSearch = { attach, load, search, info, detailsOf };
})();
