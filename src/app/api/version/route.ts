import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  const payload = {
    ok: true,
    version: process.env.npm_package_version ?? null,
    createdAt: new Date().toISOString(),
  }

  return NextResponse.json(payload, {
    headers: {
      'cache-control': 'no-store, max-age=0',
    },
  })
}

