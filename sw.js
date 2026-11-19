/* Nocturne service worker – csak a saját mappájára (scope: ./) vonatkozik. */
const CACHE_PREFIX = 'nocturne_cache_';
const VERSION = 'v1';
const CACHE = CACHE_PREFIX + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/util.js',
  './js/form.js',
  './js/journal.js',
  './js/calendar.js',
  './js/stats.js',
  './js/map.js',
  './js/backup.js',
  './fonts/space-grotesk-latin-400-normal.woff2',
  './fonts/space-grotesk-latin-600-normal.woff2',
  './fonts/space-grotesk-latin-ext-400-normal.woff2',
  './fonts/space-grotesk-latin-ext-600-normal.woff2',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        // Csak a saját (nocturne_cache_) régi cache-eket töröljük, más app cache-éhez nem nyúlunk.
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scopePath = new URL(self.registration.scope).pathname;
  if (url.origin !== location.origin || !url.pathname.startsWith(scopePath)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { cacheName: CACHE }).then((hit) => hit || fetch(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
