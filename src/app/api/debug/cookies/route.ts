import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse(null, { status: 404 })
  }

  const cookieNames = req.cookies
    .getAll()
    .map((c) => c.name)
    .filter(Boolean)
    .sort()

  const hasSbCookie = cookieNames.some((n) => n.startsWith('sb-'))
  const hasSbAuthToken = cookieNames.some((n) => n.includes('auth-token'))
  const hasCodeVerifier = cookieNames.some((n) => n.includes('code-verifier'))

  return NextResponse.json(
    {
      ok: true,
      host: req.nextUrl.host,
      path: req.nextUrl.pathname,
      hasSbCookie,
      hasSbAuthToken,
      hasCodeVerifier,
      cookieNames,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}

