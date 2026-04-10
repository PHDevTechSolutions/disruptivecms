/* JARIS CMS Service Worker */

const CACHE_NAME = "jaris-cms-v1";

const STATIC_ASSETS = ["/", "/manifest.json", "/jarislogo.png", "/offline"];

// INSTALL → cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

// ACTIVATE → clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      ),
    ),
  );
  self.clients.claim();
});

// FETCH → smart caching strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // API → Network-first (fresh CMS data)
  if (request.url.includes("/api")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
          return res;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Pages & assets → Cache-first with fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request)
          .then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
            return res;
          })
          .catch(() => {
            if (request.mode === "navigate") {
              return caches.match("/offline");
            }
          })
      );
    }),
  );
});
