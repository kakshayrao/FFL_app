/* RFL Service Worker - basic offline + runtime caching */
const VERSION = 'v1';
const CACHE_PAGES = `rfl-pages-${VERSION}`;
const CACHE_ASSETS = `rfl-assets-${VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/dashboard',
  '/team',
  '/leaderboards',
  '/rules',
  '/offline',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_PAGES).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => ![CACHE_PAGES, CACHE_ASSETS].includes(k)).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function isAssetRequest(req) {
  const url = new URL(req.url);
  return (
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.woff') || url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.ttf') || url.pathname.endsWith('.otf') ||
    url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.jpeg') || url.pathname.endsWith('.webp') || url.pathname.endsWith('.svg')
  );
}

function isSupabaseStorage(url) {
  return /supabase\.co\/.+\/storage\//.test(url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navigations: network-first with timeout → cache → offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      try {
        const network = await fetch(req, { signal: ctrl.signal });
        const cache = await caches.open(CACHE_PAGES);
        cache.put(req, network.clone());
        clearTimeout(t);
        return network;
      } catch (e) {
        const cache = await caches.open(CACHE_PAGES);
        const cached = await cache.match(req);
        return cached || caches.match('/offline');
      }
    })());
    return;
  }

  const url = req.url;
  // Assets: stale-while-revalidate
  if (isAssetRequest(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_ASSETS);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then((res) => {
        cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })());
    return;
  }

  // Supabase Storage images: cache-first
  if (isSupabaseStorage(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_ASSETS);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      cache.put(req, res.clone());
      return res;
    })());
    return;
  }
});


