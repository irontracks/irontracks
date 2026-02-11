const CACHE_NAME = 'irontracks-sw-v2'
const SHOULD_CACHE = (url) => {
  try {
    if (!url) return false
    const u = new URL(url)
    if (u.origin !== self.location.origin) return false
    if (u.pathname.startsWith('/api/')) return false
    if (u.pathname.startsWith('/auth/')) return false
    if (u.pathname.startsWith('/dashboard')) return false
    if (u.pathname.startsWith('/_next/webpack-hmr')) return false
    return true
  } catch {
    return false
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll([
          '/',
          '/manifest.json',
          '/icone.png',
        ]),
      )
      .then(() => self.skipWaiting())
      .catch(() => null),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => null),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (!req || req.method !== 'GET') return
  if (!SHOULD_CACHE(req.url)) return

  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')
  if (isNav) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          return res
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('/'))),
    )
    return
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => null)
          return res
        })
        .catch(() => null)
      return cached || fetchPromise
    }),
  )
})
