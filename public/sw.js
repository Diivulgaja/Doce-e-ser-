const CACHE = "doce-e-ser-v2";
const PRECACHE = ["/assets/logo-doce-e-ser.png", "/assets/catalogo-doces.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const clone = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, clone));
    }
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || Response.error())));
});
