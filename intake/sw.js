/* PBG Intake offline support. Bump VERSION when you upload new app files so iPads pick them up. */
const VERSION = "pbg-intake-v7";
const SHELL = ["./", "index.html", "../pbg-config.js", "../pbg-api.js", "cardsearch.js", "rr-push.js", "cards.json", "pbg-logo.png", "restored-rarity-logo.jpg", "manifest.webmanifest",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];
const CDN = ["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2", "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(SHELL);
    await Promise.all(CDN.map(u => c.add(u).catch(() => {})));
  }).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if(req.method !== "GET") return;
  if(url.hostname.endsWith("supabase.co")) return;                 // always live data
  if(url.pathname.endsWith("/cards.json") && url.origin !== location.origin){
    // shared card list: try the network, keep a copy for offline use
    e.respondWith(fetch(req).then(r => { if(r.ok){ const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; }).catch(() => caches.match(req)));
    return;
  }
  const isApp = url.origin === location.origin, isCdn = CDN.some(u => req.url.startsWith(u)) || url.hostname.includes("fonts.g");
  if(!isApp && !isCdn) return;
  // App files: network first so updates arrive, cache as fallback. CDN/fonts: cache first.
  e.respondWith(isApp
    ? fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; }).catch(() => caches.match(req, { ignoreSearch: true }))
    : caches.match(req).then(hit => hit || fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; })));
});
