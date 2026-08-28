// Aura Health Rehab patient portal — service worker.
// Minimal, dependency-free. Goal: installability + an offline shell. It is
// deliberately conservative — it NEVER caches API responses or authenticated
// data, so patients never see stale medical/booking info.
//
// Strategy:
//  • navigations (HTML): network-first, fall back to the offline page.
//  • same-origin static assets (Next chunks, images, fonts, css): cache-first.
//  • everything else (incl. /api/*, cross-origin): passthrough to network.

const CACHE = 'aura-portal-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = ['/offline.html', '/icon-192.png', '/icon-512.png', '/aura-mark.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Allow the page to trigger an immediate update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(url) {
  return url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') ||
      /\.(?:png|jpg|jpeg|svg|webp|gif|ico|css|js|woff2?|ttf)$/.test(url.pathname));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never touch API or auth-scoped requests — always go to the network.
  if (url.pathname.startsWith('/api/')) return;

  // Page navigations: network-first with an offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then((cached) => cached || caches.match(OFFLINE_URL))
      )
    );
    return;
  }

  // Static assets: cache-first, then populate the cache.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
      )
    );
  }
});
