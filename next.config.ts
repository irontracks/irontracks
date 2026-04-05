import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // ─── Gzip / Brotli compression for serverless responses ───────────────────
  compress: true,

  // ─── Tree-shake heavy libs at build time (reduces JS bundle size) ─────────
  // lucide-react: saves ~200kb by only importing icons actually used
  // chart.js / react-chartjs-2: only bundles chart types imported
   
  ...({ optimizePackageImports: ['lucide-react', 'chart.js', 'react-chartjs-2', '@tanstack/react-virtual'] } as any),

  // tsc roda localmente via `npm run deploy` antes de cada push.
  // Desabilitar no build do Vercel evita checagem duplicada (~40-60s por deploy).
  typescript: { ignoreBuildErrors: true },

  images: {
    localPatterns: [
      {
        pathname: '/api/social/stories/media',
      },
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'enbueukmvgodngydkpzm.supabase.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.gstatic.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'media.tenor.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'tenor.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'media.giphy.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.giphy.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'giphy.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Proxy map tiles through same origin — avoids all cross-origin issues in
  // iOS WKWebView (CSP, COEP, CORS). Tiles are served from /map-tiles/...
  async rewrites() {
    return [
      {
        source: '/map-tiles/carto/:path*',
        destination: 'https://a.basemaps.cartocdn.com/:path*',
      },
      {
        source: '/map-tiles/osm/:path*',
        destination: 'https://tile.openstreetmap.org/:path*',
      },
    ]
  },
  async headers() {
    const isDev = String(process.env.NODE_ENV || '').toLowerCase() !== 'production'
    const staticCache = isDev ? 'no-store, max-age=0' : 'public, max-age=31536000, immutable'
    const imageCache = isDev ? 'no-store, max-age=0' : 'public, max-age=0, must-revalidate'

    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'cache-control', value: staticCache }],
      },
      {
        source: '/_next/image',
        headers: [{ key: 'cache-control', value: imageCache }],
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'cache-control', value: 'public, max-age=3600' }],
      },
      {
        source: '/icone.png',
        headers: [{ key: 'cache-control', value: 'public, max-age=86400' }],
      },
      {
        source: '/@vite/client',
        headers: [
          { key: 'content-type', value: 'application/javascript; charset=utf-8' },
          { key: 'cache-control', value: 'no-store, max-age=0' },
        ],
      },
      {
        source: '/((?!_next/static|_next/image|favicon.ico|manifest.json|icone.png|robots.txt|sitemap.xml).*)',
        headers: [{ key: 'cache-control', value: 'no-store, max-age=0' }],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  org: "irontracks-company",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
  disableLogger: true,
  automaticVercelMonitors: false,
  // Desabilita geração de source maps no build do Vercel (~30-50s economizados).
  // Sentry ainda captura erros em produção; stack traces mostram código minificado.
  sourcemaps: { disable: true },
})

