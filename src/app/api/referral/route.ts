/**
 * GET /api/referral — returns current user's referral code + stats
 * POST /api/referral — register referral (when someone signs up with a code)
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()

  // Get or generate referral code
  const { data: profile } = await admin
    .from('profiles')
    .select('referral_code, display_name')
    .eq('id', auth.user.id)
    .maybeSingle()

  let code = profile?.referral_code || ''
  if (!code) {
    const generated = (auth.user.id.replace(/-/g, '').slice(0, 8)).toUpperCase()
    await admin.from('profiles').update({ referral_code: generated }).eq('id', auth.user.id)
    code = generated
  }

  // Count referrals
  const { count } = await admin
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', auth.user.id)

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.irontracks.com.br'
  const referralUrl = `${baseUrl}/r/${code}`

  return NextResponse.json({
    ok: true,
    code,
    referralUrl,
    count: count || 0,
    displayName: profile?.display_name || '',
  })
}

const BodySchema = z.object({ code: z.string().min(1).max(20) })

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const parsed = await parseJsonBody(req, BodySchema)
  if (parsed.response) return parsed.response
  const { code } = parsed.data!

  const admin = createAdminClient()

  // Find the referrer
  const { data: referrer } = await admin
    .from('profiles')
    .select('id, display_name')
    .eq('referral_code', code.trim().toUpperCase())
    .maybeSingle()

  if (!referrer || referrer.id === auth.user.id) {
    return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 400 })
  }

  // Check if already referred
  const { data: existing } = await admin
    .from('referrals')
    .select('id')
    .eq('referred_id', auth.user.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: false, error: 'already_referred' }, { status: 400 })
  }

  await admin.from('referrals').insert({
    referrer_id: referrer.id,
    referred_id: auth.user.id,
  })

  return NextResponse.json({ ok: true, referrerName: referrer.display_name || 'um amigo' })
}
