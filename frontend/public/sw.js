/* Minimal app-shell service worker.
   ponytail: hand-rolled caching; if offline needs grow (stale-while-revalidate,
   precached font CSS, per-release cache busting for /assets), swap for Workbox. */
const CACHE = 'maiindex-shell-v1';
const SHELL = ['/', '/manifest.json', '/favicon.png', '/pwa-192.png', '/pwa-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never touch API/health or cross-origin (Google Fonts etc.) requests.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health')) return;

  if (e.request.mode === 'navigate') {
    // Network-first HTML so deploys show up immediately, cache as offline fallback.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    // Vite hashes filenames, so cache-first is safe: a new deploy = new URLs.
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          })
      )
    );
  }
});
