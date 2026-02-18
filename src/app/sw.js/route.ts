export function GET() {
  const body = [
    "self.addEventListener('install', (event) => {",
    '  self.skipWaiting();',
    '});',
    '',
    "self.addEventListener('activate', (event) => {",
    '  event.waitUntil(self.clients.claim());',
    '});',
    '',
    "self.addEventListener('fetch', (event) => {",
    '  return;',
    '});',
    '',
  ].join('\n')

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  })
}

