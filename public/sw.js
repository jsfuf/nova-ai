const CACHE = "nova-v8";
const ASSETS = ["/", "/index.html", "/manifest.json"];
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  // never cache API or firebase
  if (req.url.includes("/9router/") || req.url.includes("firestore") || req.url.includes("firebase") || req.url.includes("rtdb")) return;
  if (req.headers.get("accept")?.includes("text/html")) {
    e.respondWith(fetch(req).then(r=>{ const c=r.clone(); caches.open(CACHE).then(cache=>cache.put(req,c)); return r; }).catch(()=>caches.match("/index.html")));
    return;
  }
  // network-first for static assets too -> everyone always gets the newest build (hard refresh)
  e.respondWith(fetch(req).then(r=>{ if(r.ok) caches.open(CACHE).then(c=>c.put(req,r.clone())); return r; }).catch(()=>caches.match(req).then(hit=>hit||caches.match("/index.html"))));
});



