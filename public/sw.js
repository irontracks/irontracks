/**
 * IronTracks Service Worker v1
 *
 * Estratégias de cache:
 * - /_next/static/**     → cache-first (assets imutáveis)
 * - /api/**              → network-only (dados sempre frescos)
 * - Páginas navegáveis   → stale-while-revalidate
 * - Outros              → network-first com fallback
 */

const CACHE_NAME = 'irontracks-v3'
const STATIC_CACHE = 'irontracks-static-v3'

// Páginas críticas pré-cacheadas na instalação
const PRECACHE_URLS = [
    '/dashboard',
    '/offline',
]

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            cache.addAll(PRECACHE_URLS).catch(() => {
                // Silently fail if precache fails (first visit, no connectivity)
            })
        )
    )
    // Take control immediately
    self.skipWaiting()
})

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE)
                    .map((k) => caches.delete(k))
            )
        )
    )
    self.clients.claim()
})

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const { request } = event
    const url = new URL(request.url)

    // Only handle same-origin requests
    if (url.origin !== self.location.origin) return

    // Skip non-GET requests
    if (request.method !== 'GET') return

    // API routes → network-only (never cache)
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(fetch(request).catch(() => new Response('{"ok":false,"error":"offline"}', {
            headers: { 'content-type': 'application/json' },
            status: 503,
        })))
        return
    }

    // Next.js static assets → cache-first (they have content hashes)
    if (url.pathname.startsWith('/_next/static/')) {
        event.respondWith(
            caches.open(STATIC_CACHE).then(async (cache) => {
                const cached = await cache.match(request)
                if (cached) return cached
                const response = await fetch(request)
                if (response.ok) cache.put(request, response.clone())
                return response
            })
        )
        return
    }

    // Root path — always network-first (middleware redirects logged-in users)
    // Using stale-while-revalidate here would flash the cached login page.
    if (url.pathname === '/') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) caches.open(CACHE_NAME).then((c) => c.put(request, response.clone()))
                    return response
                })
                .catch(() => caches.match(request).then((r) => r ?? new Response('Offline', { status: 503 })))
        )
        return
    }

    // Navigation requests → stale-while-revalidate
    if (request.mode === 'navigate') {
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                const cached = await cache.match(request)
                const networkPromise = fetch(request).then((response) => {
                    if (response.ok) cache.put(request, response.clone())
                    return response
                }).catch(() => cached ?? new Response('Offline', { status: 503 }))

                return cached ?? networkPromise
            })
        )
        return
    }

    // Default → network-first
    event.respondWith(
        fetch(request).catch(() => caches.match(request).then((r) => r ?? new Response('', { status: 504 })))
    )
})
