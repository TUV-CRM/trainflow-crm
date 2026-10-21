/* TrainFlow CRM — service worker (PWA shell)
 * SECURITY / DATA POLICY
 *  - Caches ONLY static, non-sensitive files listed in SHELL (icons, manifest, offline page).
 *  - Never caches index.html (it always comes fresh from the network, so a new version is
 *    picked up on the next open and no stale app UI can stay installed).
 *  - Never touches Firebase, Google sign-in, GitHub API, CDN or any other cross-origin request,
 *    and never touches POST/PUT/PATCH/DELETE — those requests are not intercepted at all.
 *  - Offline: opening the app shows offline.html (an honest "no connection" page); the CRM
 *    itself is NOT claimed to work offline.
 * CACHE ISOLATION (v60)
 *  - The GitHub Pages origin can be shared with other projects, so this worker only ever reads,
 *    writes or deletes caches that belong to TrainFlow: names starting with CACHE_PREFIX, plus the
 *    known legacy TrainFlow cache 'tf-pwa-v1'. Any other cache on the origin is never touched.
 */
const CACHE_PREFIX = 'trainflow-crm-pwa-';
const VERSION = CACHE_PREFIX + 'v2';
const LEGACY_CACHES = ['tf-pwa-v1'];          // TrainFlow's own earlier cache name (_59)
function isTrainFlowCache(name) { return name.indexOf(CACHE_PREFIX) === 0 || LEGACY_CACHES.indexOf(name) >= 0; }

const SHELL = [
  './offline.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];
const SHELL_URLS = SHELL.map(function (p) { return new URL(p, self.registration.scope).href; });
const OFFLINE_URL = new URL('./offline.html', self.registration.scope).href;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION)
      .then(function (c) { return c.addAll(SHELL.map(function (p) { return new Request(p, { cache: 'reload' }); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        // delete ONLY older TrainFlow caches; keep the current one and every non-TrainFlow cache
        return Promise.all(keys.filter(function (k) { return isTrainFlowCache(k) && k !== VERSION; })
                               .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;                       // writes / sync / sign-in: untouched
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // Firebase, Google, GitHub API, CDN: untouched

  // App page: always from the network (bypassing the HTTP cache); offline → honest offline page
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .catch(function () { return caches.open(VERSION).then(function (c) { return c.match(OFFLINE_URL); }); })
    );
    return;
  }

  // Static shell files only: from TrainFlow's own cache first, refreshed whenever VERSION changes
  const clean = url.origin + url.pathname;
  if (SHELL_URLS.indexOf(clean) >= 0) {
    event.respondWith(
      caches.open(VERSION)
        .then(function (c) { return c.match(clean); })
        .then(function (hit) { return hit || fetch(req); })
    );
  }
  // everything else: not intercepted
});
