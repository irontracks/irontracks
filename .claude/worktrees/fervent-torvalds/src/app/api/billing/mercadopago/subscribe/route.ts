import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const resolveBaseUrl = (req: Request) => {
  const env = (process.env.APP_BASE_URL || '').trim().replace(/\/$/, '')
  if (env) return env
  const origin = (req.headers.get('origin') || '').trim().replace(/\/$/, '')
  if (origin) return origin
  return 'http://localhost:3000'
}

const BodySchema = z
  .object({
    planId: z.string().min(1),
  })
  .passthrough()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const planId = parsedBody.data!.planId.trim()

    const admin = createAdminClient()
    const { data: plan, error: planErr } = await admin
      .from('app_plans')
      .select('id, name, price_cents, currency, interval, status')
      .eq('id', planId)
      .maybeSingle()
    if (planErr) return NextResponse.json({ ok: false, error: planErr.message }, { status: 400 })
    if (!plan || plan.status !== 'active') return NextResponse.json({ ok: false, error: 'plan_not_found' }, { status: 404 })

    const { data: anyActive } = await admin
      .from('app_subscriptions')
      .select('id, status, provider, plan_id, metadata, created_at')
      .eq('user_id', user.id)
      .in('status', ['pending', 'active', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (anyActive?.id && String(anyActive.status || '') === 'pending') {
      const ageMs = Date.now() - new Date(String(anyActive.created_at || '')).getTime()
      const meta = (anyActive as Record<string, unknown>)?.metadata
      const metaObj = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : ({} as Record<string, unknown>)
      const mp = metaObj?.mercadopago && typeof metaObj.mercadopago === 'object' ? (metaObj.mercadopago as Record<string, unknown>) : ({} as Record<string, unknown>)
      const initPoint = String(mp?.init_point || '').trim()
      if (String(anyActive.plan_id || '') === planId && String(anyActive.provider || '') === 'mercadopago' && initPoint) {
        return NextResponse.json({ ok: true, subscription: { id: anyActive.id, status: anyActive.status }, redirect_url: initPoint, resumed: true })
      }
      if (Number.isFinite(ageMs) && ageMs > 10 * 60 * 1000) {
        await admin.from('app_subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', anyActive.id)
      } else {
        return NextResponse.json({ ok: false, error: 'pending_subscription_exists' }, { status: 409 })
      }
    }
    if (anyActive?.id && ['active', 'past_due'].includes(String(anyActive.status || ''))) {
      return NextResponse.json({ ok: false, error: 'already_has_active_subscription' }, { status: 409 })
    }

    const baseUrl = resolveBaseUrl(req)
    const amount = Number((plan.price_cents || 0) / 100)
    const currencyId = (plan.currency || 'BRL').toUpperCase()
    const frequencyType = plan.interval === 'year' ? 'months' : 'months'
    const frequency = plan.interval === 'year' ? 12 : 1

    const preapproval = await mercadopagoRequest<{
      id: string
      init_point?: string
      sandbox_init_point?: string
      status?: string
    }>({
      method: 'POST',
      path: '/preapproval',
      body: {
        reason: plan.name,
        external_reference: `vip:${user.id}:${plan.id}`,
        payer_email: user.email || undefined,
        back_url: `${baseUrl}/marketplace`,
        auto_recurring: {
          frequency,
          frequency_type: frequencyType,
          transaction_amount: amount,
          currency_id: currencyId,
        },
      },
    })

    const providerSubscriptionId = String(preapproval?.id || '').trim()
    if (!providerSubscriptionId) {
      return NextResponse.json({ ok: false, error: 'failed_to_create_subscription' }, { status: 400 })
    }

    const initPoint = String(preapproval?.init_point || preapproval?.sandbox_init_point || '').trim()

    const { data: subRow, error: subErr } = await admin
      .from('app_subscriptions')
      .insert({
        plan_id: plan.id,
        user_id: user.id,
        status: 'pending',
        provider: 'mercadopago',
        provider_subscription_id: providerSubscriptionId,
        metadata: { mercadopago: { init_point: initPoint, raw: preapproval } },
      })
      .select('id, status')
      .single()
    if (subErr || !subRow) {
      const msg = String(subErr?.message || '')
      if (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('provider')) {
        return NextResponse.json({ ok: false, error: 'db_migration_required' }, { status: 500 })
      }
      return NextResponse.json({ ok: false, error: subErr?.message || 'failed_to_store_subscription' }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      subscription: subRow,
      redirect_url: initPoint || null,
      provider_subscription_id: providerSubscriptionId,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
