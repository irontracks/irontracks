import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export async function GET() {
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  const hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const cookieStore = await cookies()
  const cookieNames = (cookieStore.getAll() || []).map((c) => c?.name).filter(Boolean).sort()

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      return NextResponse.json(
        { ok: false, hasUrl, hasAnon, cookieNames, error: error.message || 'unauthorized' },
        { status: 401 }
      )
    }
    return NextResponse.json({ ok: true, hasUrl, hasAnon, cookieNames, userId: data?.user?.id ?? null, userEmail: data?.user?.email ?? null })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, hasUrl, hasAnon, cookieNames, error: e?.message ?? String(e) },
      { status: 500 }
    )
  }
}
