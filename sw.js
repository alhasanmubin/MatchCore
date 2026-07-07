const CACHE_NAME = "matchcore-cache-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./style.css",
  "./dashboard.css",
  "./admin.css",
  "./app.js",
  "./dashboard.js",
  "./admin.js",
  "./firebase-config.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedCachedResponse || fetch(e.request).catch(() => {
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});