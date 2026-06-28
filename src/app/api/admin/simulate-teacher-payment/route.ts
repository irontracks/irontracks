/**
 * POST /api/admin/simulate-teacher-payment
 *
 * Admin-only utility that simulates a successful teacher plan payment WITHOUT
 * touching MercadoPago. Use cases:
 *
 *   • Smoke-test the full activation pipeline (teachers row + app_payments
 *     invoice + notifications) before running real PIX with a teacher
 *   • Re-activate a teacher whose webhook was lost or arrived corrupted
 *   • Demo the "Faturas" tab during teacher onboarding
 *
 * Security: requireRole(['admin']) and the inserted invoice is marked
 * `raw.simulated = true` so it never blends in with real revenue analytics.
 *
 * Body: { teacherUserId: uuid, planId: 'starter' | 'pro' | 'elite' | 'unlimited' }
 *
 * Effect (mirrors the production webhook handler exactly):
 *   1. teachers.plan_tier_key   = planId
 *   2. teachers.plan_status     = 'active'
 *   3. teachers.plan_valid_until = now + 1 month
 *   4. teachers.plan_subscription_id = 'simulated-<ts>'
 *   5. INSERT app_payments status=approved with raw.scope='teacher_plan'
 *      AND raw.simulated=true
 *   6. notification billing_issue → "Plano ativado (simulação)"
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { respondDbError } from '@/utils/api/dbError'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { logInfo, logWarn } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  teacherUserId: z.string().uuid(),
  planId: z.enum(['starter', 'pro', 'elite', 'unlimited']),
}).strip()

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { teacherUserId, planId } = parsedBody.data!

    const admin = createAdminClient()

    // Fetch the tier to know how much to charge
    const { data: plan, error: planErr } = await admin
      .from('teacher_tiers')
      .select('tier_key, name, price_cents, currency, max_students')
      .eq('tier_key', planId)
      .eq('is_active', true)
      .maybeSingle()
    if (planErr || !plan) {
      return NextResponse.json({ ok: false, error: 'plano_nao_encontrado' }, { status: 404 })
    }

    // Confirm the teacher exists
    const { data: teacher } = await admin
      .from('teachers')
      .select('id, user_id, email, name')
      .eq('user_id', teacherUserId)
      .maybeSingle()
    if (!teacher) {
      return NextResponse.json({ ok: false, error: 'professor_nao_encontrado' }, { status: 404 })
    }

    // Block downgrade that would exceed limit (mirrors checkout flow)
    const newMax = Number(plan.max_students)
    if (newMax > 0) {
      const { data: countResult } = await admin.rpc('teacher_student_count', { p_teacher_user_id: teacherUserId })
      if (Number(countResult ?? 0) > newMax) {
        return NextResponse.json({
          ok: false,
          error: `Professor tem mais alunos que o limite do plano ${plan.name}. Remova alunos antes de simular downgrade.`,
        }, { status: 409 })
      }
    }

    const now = new Date()
    const end = new Date(now); end.setMonth(end.getMonth() + 1)
    const simulatedPaymentId = `simulated-${now.getTime()}`

    // 1. Activate plan on teachers row
    const { error: tErr } = await admin
      .from('teachers')
      .update({
        plan_tier_key:        planId,
        plan_status:          'active',
        plan_valid_until:     end.toISOString(),
        plan_subscription_id: simulatedPaymentId,
      })
      .eq('user_id', teacherUserId)
    if (tErr) {
      return respondDbError('admin:simulate:teachers-update', tErr)
    }

    // 2. Record approved invoice in app_payments (marked simulated)
    try {
      await admin
        .from('app_payments')
        .insert({
          user_id: teacherUserId,
          plan_id: null,
          subscription_id: null,
          amount_cents: Number(plan.price_cents) || 0,
          currency: String(plan.currency ?? 'BRL'),
          status: 'approved',
          provider: 'mercadopago',
          provider_payment_id: simulatedPaymentId,
          paid_at: now.toISOString(),
          raw: {
            scope: 'teacher_plan',
            tier_key: planId,
            plan_name: plan.name,
            simulated: true,
            simulated_by_admin: auth.user.id,
            simulated_at: now.toISOString(),
          },
        })
    } catch (e) {
      logWarn('admin:simulate', 'invoice insert failed', e)
    }

    // 3. Notify the teacher (billing_issue is in NSE wake-screen whitelist)
    try {
      await insertNotifications([{
        user_id: teacherUserId,
        recipient_id: teacherUserId,
        sender_id: auth.user.id,
        type: 'billing_issue',
        title: '✅ Plano ativado',
        message: `Seu plano ${plan.name} foi ativado pelo admin (simulação). Próxima cobrança: ${end.toLocaleDateString('pt-BR')}.`,
        is_read: false,
        metadata: {
          scope: 'teacher_plan_simulated',
          tier_key: planId,
          simulated_by_admin: auth.user.id,
        },
      }])
    } catch (e) {
      logWarn('admin:simulate', 'notification failed', e)
    }

    logInfo('admin:simulate', `Admin ${auth.user.id} activated ${planId} for teacher ${teacherUserId} (simulated)`)

    return NextResponse.json({
      ok: true,
      simulated_payment_id: simulatedPaymentId,
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
      plan: { tier_key: plan.tier_key, name: plan.name, price_cents: plan.price_cents },
      plan_valid_until: end.toISOString(),
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
