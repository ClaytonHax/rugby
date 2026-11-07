// Tryline service worker: lets the app shell open with no signal.
// It handles SAME-ORIGIN GET requests only. Firestore, Auth, Google fonts and every other cross-origin request
// never reach it, so player records and identity documents are never copied into a second store here.
// The two constants below are filled in by the build (vite.config.ts); in dev they keep their placeholder values.
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = '__PRECACHE__'; // JSON list of URLs
const CACHE = `tryline-${BUILD_ID}`;
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  // No skipWaiting here: the page decides when to switch, so a half-filled form is never interrupted.
  const urls = PRECACHE.startsWith('__') ? ['/'] : JSON.parse(PRECACHE);
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(urls)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tryline-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const cacheable = (res) => res && res.ok && res.type === 'basic';

async function navigate(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((res) => {
    // Every route is the same single page, so keep one copy of it.
    if (cacheable(res)) cache.put('/', res.clone());
    return res;
  });
  const fallback = () => cache.match('/');
  try {
    // Poor signal: give the network a few seconds, then open the saved shell instead of hanging.
    return await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), NAV_TIMEOUT_MS)),
    ]);
  } catch {
    return (await fallback()) ?? network;
  }
}

async function assetFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (cacheable(res)) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js' || url.pathname.startsWith('/__/')) return;
  if (request.mode === 'navigate') event.respondWith(navigate(request));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(assetFirst(request));
  else event.respondWith(networkFirst(request));
});
