import { NextResponse } from 'next/server'

export function GET(req: Request) {
  return NextResponse.redirect(new URL('/icone.png', req.url), 307)
}

