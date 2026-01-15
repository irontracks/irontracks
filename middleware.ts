import { updateSession } from '@/utils/supabase/middleware'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
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
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icone.png|robots.txt|sitemap.xml).*)',
  ],
}
