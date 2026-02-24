import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.NEXT_PUBLIC_APP_VERSION ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_DEPLOYMENT_ID ||
      process.env.npm_package_version ||
      'dev',
  },
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
        source: '/sw.js',
        headers: [
          { key: 'cache-control', value: 'no-store, max-age=0' },
          { key: 'service-worker-allowed', value: '/' },
        ],
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

export default nextConfig
