import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { hasValidInternalSecret, requireRole } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'

export async function GET(req: Request) {
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  const hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const isDev = process.env.NODE_ENV === 'development'
  const isInternal = hasValidInternalSecret(req)
  if (!isInternal && !isDev) {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return auth.response
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      return NextResponse.json(
        { ok: false, hasUrl, hasAnon, error: error.message || 'unauthorized' },
        { status: 401 }
      )
    }
    if (isInternal || isDev) {
      const cookieStore = await cookies()
      const cookieNames = (cookieStore.getAll() || []).map((c) => c?.name).filter(Boolean).sort()
      return NextResponse.json({
        ok: true,
        hasUrl,
        hasAnon,
        cookieNames,
        userId: data?.user?.id ?? null,
        userEmail: data?.user?.email ?? null,
      })
    }
    return NextResponse.json({ ok: true, hasUrl, hasAnon })
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, hasUrl, hasAnon, error: getErrorMessage(e) },
      { status: 500 }
    )
  }
}
