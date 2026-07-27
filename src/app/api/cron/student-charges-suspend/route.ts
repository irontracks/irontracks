import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { respondDbError } from '@/utils/api/dbError'
import { logError, logInfo } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Cron diário — suspende assinatura recorrente do aluno (cartão OU PIX) cujo acesso venceu há
 * mais que a carência. `expires_at` só avança quando um pagamento é confirmado (webhook), então
 * quem pagou tem `expires_at` no futuro e NÃO é pego; quem não pagou fica com `expires_at` no
 * passado e, passada a carência, cai pra `past_due`.
 *
 * "Suspender" aqui = status 'past_due' (não apaga nada; pagar reativa). Idempotente: só
 * transiciona 'active' → 'past_due' (subs já em past_due não são re-pegos, sem spam).
 */

const GRACE_DAYS = 3

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const admin = createAdminClient()
    const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000)

    const { data: rows, error } = await admin
      .from('student_subscriptions')
      .select('id, student_user_id, teacher_user_id, billing_method, student_service_plans(name)')
      .eq('recurring', true)
      .eq('status', 'active')
      .lt('expires_at', cutoff.toISOString())
      .not('student_user_id', 'is', null)
      .limit(5000)

    if (error) return respondDbError('cron:student-charges-suspend', error, 500)

    const targets = (rows ?? []).filter((r) => Boolean(r.student_user_id))
    if (targets.length === 0) return NextResponse.json({ ok: true, suspended: 0 })

    const ids = targets.map((r) => String(r.id)).filter(Boolean)
    const { error: updErr } = await admin
      .from('student_subscriptions')
      .update({ status: 'past_due', updated_at: new Date().toISOString() })
      .in('id', ids)
    if (updErr) return respondDbError('cron:student-charges-suspend:update', updErr, 500)

    // Notifica aluno E professor (o professor precisa saber que o aluno está inadimplente).
    const notifs: Array<Record<string, unknown>> = []
    for (const r of targets) {
      const studentId = String(r.student_user_id || '')
      const teacherId = String(r.teacher_user_id || '')
      const planData = r.student_service_plans
      const planRow = (Array.isArray(planData) ? planData[0] : planData) as { name?: string } | null | undefined
      const planName = String(planRow?.name || 'o plano')
      if (studentId) {
        notifs.push({
          user_id: studentId, recipient_id: studentId, sender_id: teacherId || studentId,
          type: 'billing_issue',
          title: '🚫 Assinatura suspensa por falta de pagamento',
          message: `Sua assinatura de ${planName} foi suspensa. Regularize o pagamento no app para reativar.`,
          is_read: false,
          metadata: { scope: 'student_subscription_suspended', subscription_id: String(r.id) },
        })
      }
      if (teacherId) {
        notifs.push({
          user_id: teacherId, recipient_id: teacherId, sender_id: studentId || teacherId,
          type: 'billing_issue',
          title: '⚠️ Aluno inadimplente',
          message: `Um aluno teve a assinatura de ${planName} suspensa por falta de pagamento.`,
          is_read: false,
          metadata: { scope: 'student_subscription_suspended_teacher', subscription_id: String(r.id) },
        })
      }
    }
    if (notifs.length) await insertNotifications(notifs)

    logInfo('cron:student-charges-suspend', `Suspensas ${targets.length} assinatura(s) de aluno após a carência`)
    return NextResponse.json({ ok: true, suspended: targets.length })
  } catch (e) {
    logError('cron:student-charges-suspend', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
