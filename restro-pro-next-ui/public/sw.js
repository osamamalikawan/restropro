// Restro Pro service worker.
// Strategy: app shell cache-first (fast, works offline); everything else network-first
// with a cache fallback. The REAL offline speed comes from IndexedDB (lib/offline-db.ts) —
// this service worker is what lets the app shell itself load with no network at all.
const CACHE_NAME = "restropro-shell-v1";
const SHELL_URLS = ["/dashboard", "/login", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never cache mutating requests (POST/PUT/DELETE)

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/dashboard")))
  );
});
