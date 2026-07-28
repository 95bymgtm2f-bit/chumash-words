/* Offline support.
 *
 * Deliberately NOT precaching the five sefer files -- that would be ~4 MB on first open, for
 * books she may never read. Each sefer is cached the first time she opens it, so whatever she
 * has actually used works with no signal.
 *
 * Bump VERSION on any deploy that changes the app shell; old caches are dropped on activate.
 */
const VERSION = 'cws-v1';
const SHELL = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png',
               'apple-touch-icon.png', 'data/lex.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())      // a missing shell file must not block install
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The page itself: network first, so a fix reaches her on the next launch. Falls back to
  // the cached copy when there is no signal.
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('a.html')))
    );
    return;
  }

  // Text and lexicon: serve from cache at once, refresh in the background for next time.
  // She never waits, and a corrected gloss still arrives.
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
