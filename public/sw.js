// CODE Rx SOCIETY — Service Worker (PWA + system notifications)
//
// Two jobs:
//   1. Keep the app shell available so the portal opens offline, and take the
//      LIVE build whenever the network is there (cache-first used to keep an
//      old build visible for days — that lesson is preserved below).
//   2. Receive push messages and show them as real system notifications, with
//      the phone's own notification shade, icon and tap-to-open behaviour.
//
// Bump CACHE on every release: an old worker with a different cache name
// purges its stale shell on activate.
const CACHE = 'code-rx-v9';
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

// ---------------------------------------------------------------------------
// Push: a real system notification, even when the app is closed.
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data ? event.data.text() : '' }; }
  const title = payload.title || 'CODE Rx — Classes & Groups';
  const body = payload.body || 'You have a new notice.';
  // Where a tap lands. Only in-app addresses are honoured, so a push can never
  // redirect a student somewhere the app does not own.
  const link = typeof payload.link === 'string' && payload.link.startsWith('#') ? payload.link : '#class-groups/student/notifications';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/CODE%20RX11.png',
      badge: '/CODE%20RX11.png',
      tag: payload.tag || 'code-rx-notice',
      renotify: Boolean(payload.tag),
      data: { link },
      vibrate: [80, 40, 80],
      requireInteraction: false,
    })
  );
});

// A tap focuses the app if it is open (and jumps to the right screen), or opens
// it at that screen if it is not.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '#class-groups/student/notifications';
  const target = new URL(`/${link}`, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'notification-opened', link });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

// ---------------------------------------------------------------------------
// Fetch: shell network-first (a deploy is live on the next visit), content
// cache-first with a background refresh. API traffic is never cached.
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle same-origin GET requests; never cache API calls.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

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
