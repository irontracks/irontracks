import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  const hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  try {
    const supabase = await createClient()
    await supabase.auth.getUser()
    return NextResponse.json({ ok: true, hasUrl, hasAnon })
  } catch {
    return NextResponse.json({ ok: false, hasUrl, hasAnon }, { status: 500 })
  }
}
