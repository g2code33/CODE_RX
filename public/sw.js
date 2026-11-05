// CODE Rx SOCIETY - Service Worker (PWA)
// Keeps the app shell available for an offline launch; API requests are never
// cached.
//
// The shell is served NETWORK FIRST. It used to be cache-first, which meant a
// returning visitor kept the OLD build until the cache name was bumped by hand —
// a deploy that shipped fixes and copy changes nobody could see. Now every
// online launch takes the live build and only falls back to the cache when the
// network is gone.
//
// Still bump this on every release: an old worker installed with a different
// cache name purges its stale shell on activate.
const CACHE = 'code-rx-v8';
const CORE = [
  '/',
  '/index.html',
  // ONE logo everywhere: the official mark, and nothing else.
  '/CODE%20RX11.png',
  '/manifest.webmanifest',
];


self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()) // never block install on a cache miss
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page can ask a waiting worker to take over immediately.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle same-origin GET requests; never cache API calls.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // A page load (and the shell itself) always tries the network first, so a
  // deploy is live on the very next visit; the cached copy is the offline
  // fallback, never the default answer.
  const isShell = request.mode === 'navigate'
    || url.pathname === '/' || url.pathname === '/index.html';

  if (isShell) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Other same-origin GETs (logos, manifest) are cache-first with a refresh in
  // the background — they are content, not the app.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
