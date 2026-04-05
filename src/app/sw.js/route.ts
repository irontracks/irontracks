import { NextResponse } from 'next/server'

const getVersion = () => {
  const v =
    process.env.NEXT_PUBLIC_APP_VERSION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.npm_package_version ??
    'v1'
  return String(v || 'v1')
}

export async function GET() {
  const version = getVersion()
  const body = `
const APP_VERSION=${JSON.stringify(version)};
const CACHE_PREFIX='irontracks';
const STATIC_CACHE=\`\${CACHE_PREFIX}-static-\${APP_VERSION}\`;
const RUNTIME_CACHE=\`\${CACHE_PREFIX}-runtime-\${APP_VERSION}\`;
const OFFLINE_URL='/offline';

const precache = async () => {
  const cache = await caches.open(STATIC_CACHE);
  await cache.addAll([OFFLINE_URL,'/manifest.json','/icone.png']);
};

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k.startsWith(CACHE_PREFIX) && !k.includes(APP_VERSION) ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event?.data?.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('sync', (event) => {
  if (event?.tag !== 'it-auth-refresh') return;
  event.waitUntil(fetch('/api/auth/ping', { method: 'GET', credentials: 'include', cache: 'no-store' }).catch(() => null));
});

const isSameOrigin = (url) => {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
};

const isAsset = (pathname) =>
  pathname.startsWith('/_next/static/') ||
  pathname.endsWith('.js') ||
  pathname.endsWith('.css') ||
  pathname.endsWith('.woff2') ||
  pathname.endsWith('.woff') ||
  pathname.endsWith('.ttf') ||
  pathname.endsWith('.png') ||
  pathname.endsWith('.jpg') ||
  pathname.endsWith('.jpeg') ||
  pathname.endsWith('.svg') ||
  pathname.endsWith('.webp') ||
  pathname.endsWith('.ico');

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = isSameOrigin(request.url);

  if (!sameOrigin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, res.clone());
        return res;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        const offline = await caches.match(OFFLINE_URL);
        return offline || new Response('', { status: 503, statusText: 'offline' });
      }
    })());
    return;
  }

  if (isAsset(url.pathname)) {
    // ── Network-first for JS/CSS bundles (_next/static/) to prevent stale
    // code from being served on iOS WKWebView after a deploy. Stale
    // bundles can reintroduce fixed bugs (e.g., race conditions in
    // workout state management). Other assets (images, fonts) keep
    // stale-while-revalidate for faster loads.
    const isCodeBundle = url.pathname.startsWith('/_next/static/') &&
      (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'));

    if (isCodeBundle) {
      event.respondWith((async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        try {
          const res = await fetch(request);
          cache.put(request, res.clone());
          return res;
        } catch {
          const cached = await cache.match(request);
          return cached || new Response('', { status: 504 });
        }
      })());
      return;
    }

    // Stale-while-revalidate for non-code assets (images, fonts, etc.)
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((res) => {
          cache.put(request, res.clone());
          return res;
        })
        .catch(() => null);
      return cached || (await fetchPromise) || new Response('', { status: 504 });
    })());
  }
});
`

  return new NextResponse(body, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'service-worker-allowed': '/',
    },
  })
}
