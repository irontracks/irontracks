import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const PostBodySchema = z
  .object({
    thread_id: z.string().min(1),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1),
  })
  .passthrough()

export async function GET(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  const entitlement = await getVipPlanLimits(supabase, user.id)
  if (entitlement.tier === 'free') return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

  try {
    const url = new URL(req.url)
    const threadId = String(url.searchParams.get('thread_id') || '').trim()
    if (!threadId) return NextResponse.json({ ok: false, error: 'missing_thread_id' }, { status: 400 })

    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 60) || 60))

    const { data, error } = await supabase
      .from('vip_chat_messages')
      .select('id, thread_id, user_id, role, content, created_at')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, messages: data || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e as any)?.message ?? String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  const entitlement = await getVipPlanLimits(supabase, user.id)
  if (entitlement.tier === 'free') return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

  try {
    const parsedBody = await parseJsonBody(req, PostBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const threadId = String(body.thread_id || '').trim()
    const role = String(body.role || '').trim()
    const content = String(body.content || '').trim()
    if (!threadId || !role || !content) return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })

    const { data, error } = await supabase
      .from('vip_chat_messages')
      .insert({ thread_id: threadId, user_id: user.id, role, content })
      .select('id, thread_id, user_id, role, content, created_at')
      .single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, message: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e as any)?.message ?? String(e) }, { status: 500 })
  }
}
