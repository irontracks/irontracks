import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user?.id) return new NextResponse(null, { status: 401, headers: { 'cache-control': 'no-store' } })
    return new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  } catch {
    return new NextResponse(null, { status: 401, headers: { 'cache-control': 'no-store' } })
  }
}
