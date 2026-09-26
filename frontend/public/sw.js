/* Minimal app-shell service worker.
   ponytail: hand-rolled caching; if offline needs grow (stale-while-revalidate,
   precached font CSS, per-release cache busting for /assets), swap for Workbox. */
const CACHE = 'maiindex-shell-v2'; // bumped when the icon set changed, or installed
                                 // PWAs keep serving the precached old icon
const DATA_CACHE = 'maiindex-api-v1';
const SHELL = ['/', '/manifest.json', '/favicon.png', '/pwa-192.png', '/pwa-512.png'];

// Song-list queries only. Cover/audio/detail stay network-only: they are big, and
// detail/cover are keyed per song so a stale copy is worse than none.
const isCacheableQuery = (pathname) =>
  pathname === '/api/songs' ||
  pathname === '/api/songs/versions' ||
  pathname === '/api/songs/genres' ||
  pathname === '/api/songs/levels';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never touch health or cross-origin (Google Fonts etc.) requests.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/health')) return;

  // Song lists: network-first so a 6-hourly sync shows up, cache as the offline
  // fallback so the installed app opens with a catalog instead of an empty grid.
  if (isCacheableQuery(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) return;

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
