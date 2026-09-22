const CACHE_VERSION = "sicurezza-clienti-v1";
const ASSETS = ["./", "index.html", "config.js", "categories.js", "app.js", "manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
