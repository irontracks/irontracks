import { NextResponse } from 'next/server'

export const buildCspHeader = (nonce: string, isDev: boolean) => {
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}'`
  const styleSrc = `'self' 'unsafe-inline' https://fonts.googleapis.com`

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `style-src-attr 'unsafe-inline'`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `img-src 'self' data: blob: https://*.googleusercontent.com https://*.supabase.co https://*.supabase.in https://res.cloudinary.com https://i.ytimg.com https://img.youtube.com https://*.basemaps.cartocdn.com https://tile.openstreetmap.org`,
    `media-src 'self' blob: https://*.supabase.co https://*.supabase.in https://res.cloudinary.com`,
    `connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://generativelanguage.googleapis.com https://api.mercadopago.com https://www.googleapis.com https://*.basemaps.cartocdn.com https://tile.openstreetmap.org`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `worker-src 'self' blob:`,
  ].join('; ')
}

export const applySecurityHeaders = (response: NextResponse, nonce: string, isDev: boolean) => {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=self, microphone=self, geolocation=self, payment=()')
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
  // COEP removed: Safari/WKWebView does not support 'credentialless' and
  // 'require-corp' blocks third-party map tiles (CartoDB). The CSP policy
  // already restricts resource loading to whitelisted origins.

  if (!isDev) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  response.headers.set('Content-Security-Policy', buildCspHeader(nonce, isDev))
  return response
}
