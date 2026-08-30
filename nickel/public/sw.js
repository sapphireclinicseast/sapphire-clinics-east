// Minimal service worker — enables PWA installability and a graceful offline
// page. The app is server-rendered and auth'd, so we deliberately DO NOT cache
// pages or API responses; we only serve a small offline fallback when the
// network is unavailable. This keeps content always-fresh (a new deploy shows
// immediately) while still satisfying the installability criteria.
const OFFLINE_URL = '/offline.html'
const CACHE = 'nickel-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, '/icons/icon-192.png'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  // Navigations: network-first, fall back to the offline page.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)))
    return
  }
  // Cached shell assets (icons) — cache-first for speed.
  const url = new URL(req.url)
  if (url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)))
  }
})
