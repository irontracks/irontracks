import { updateSession } from '@/utils/supabase/middleware'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  if (pathname === '/@vite/client' || pathname.startsWith('/@vite/')) {
    return new Response('export {}', {
      status: 200,
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store, max-age=0',
      },
    })
  }

  try {
    const hostname = request.nextUrl.hostname
    if (hostname === 'www.irontracks.com.br') {
      const url = request.nextUrl.clone()
      url.hostname = 'irontracks.com.br'
      return NextResponse.redirect(url)
    }
  } catch {}
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/@vite/:path*',
    '/((?!_next/|favicon.ico|manifest.json|icone.png|robots.txt|sitemap.xml|auth).*)',
  ],
}
