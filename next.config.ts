import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // ─── App version injected at build time (used by ServiceWorkerRegister) ───
  // Falls back to VERCEL_GIT_COMMIT_SHA → VERCEL_DEPLOYMENT_ID → package version
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.NEXT_PUBLIC_APP_VERSION ||
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
      process.env.VERCEL_DEPLOYMENT_ID ||
      require('./package.json').version,
  },

  // ─── Gzip / Brotli compression for serverless responses ───────────────────
  compress: true,

  // ─── Tree-shake heavy libs at build time (reduces JS bundle size) ─────────
  // lucide-react: saves ~200kb by only importing icons actually used
  // chart.js / react-chartjs-2: only bundles chart types imported
  experimental: {
    optimizePackageImports: ['lucide-react', 'chart.js', 'react-chartjs-2', '@tanstack/react-virtual', '@tanstack/react-query', 'framer-motion'],
  },

  // TypeScript bloqueia o build remoto também (rede de segurança caso um commit
  // chegue ao Vercel sem ter passado pelo tsc local/CI). O código já compila
  // limpo sob strict (tsconfig strict: true).
  typescript: { ignoreBuildErrors: false },

  images: {
    // localPatterns restricts which /public-served paths next/image can load.
    // The previous list only whitelisted /api/social/stories/media and every
    // other local asset (illustrations, badges, muscle-overlays, onboarding,
    // body-types …) silently triggered an Error Boundary on any screen that
    // rendered one of them (Comunidade crashed on /illustrations/empty-community.png).
    localPatterns: [
      { pathname: '/api/social/stories/media/**' },
      { pathname: '/illustrations/**' },
      { pathname: '/icons/**' },
      { pathname: '/badge-**' },
      { pathname: '/muscle-overlays/**' },
      { pathname: '/muscle-overlays-female/**' },
      { pathname: '/body-types/**' },
      { pathname: '/onboarding-**' },
      { pathname: '/body-**' },
      { pathname: '/default-avatar.png' },
      { pathname: '/empty-**' },
      { pathname: '/header-dumbbell.png' },
      { pathname: '/login-hero.png' },
      { pathname: '/icone.png' },
      { pathname: '/icone-192.png' },
      { pathname: '/icone-512.png' },
      { pathname: '/logo-irontracks.png' },
      { pathname: '/logo-irontracks-splash.webp' },
      { pathname: '/vip-crown.png' },
      { pathname: '/screenshot/**' },
      { pathname: '/rank-**' },
      { pathname: '/report-**' },
      { pathname: '/sticker-**' },
      { pathname: '/seasonal/**' },
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
      // Cloudinary — user profile photos + uploaded media. Its absence here
      // was causing Conversas (chat list) to crash when any DM partner had
      // a Cloudinary-hosted avatar.
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
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
        source: '/icone-:size.png',
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
        headers: [
          { key: 'cache-control', value: 'no-store, max-age=0' },
          { key: 'x-frame-options', value: 'DENY' },
          { key: 'x-content-type-options', value: 'nosniff' },
        ],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  org: "irontracks-company",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
  // Sourcemaps só são gerados/enviados quando há SENTRY_AUTH_TOKEN (ex.: no
  // Vercel). Sem token, ficam desabilitados — zero custo de build e nenhum risco
  // de vazar o código-fonte. Defina SENTRY_AUTH_TOKEN no ambiente do Vercel pra
  // ativar stack traces legíveis em produção.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    // Apaga os .map do output após o upload pro Sentry — nunca servidos publicamente.
    deleteSourcemapsAfterUpload: true,
  },
})

