import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { respondDbError } from '@/utils/api/dbError'
import { logError, logInfo } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Cron diário — lembrete de mensalidade PIX recorrente do ALUNO.
 *
 * A cobrança recorrente por PIX não debita sozinha (PIX não tem auto-débito). Este cron
 * automatiza a PARTE que o aluno esquecia: todo ciclo, quando a assinatura recorrente por PIX
 * chega no vencimento, notifica o aluno pra pagar em 1 toque no app (fluxo api/student/charge,
 * que já existe). As assinaturas por CARTÃO NÃO entram aqui — o MercadoPago as cobra sozinho.
 *
 * Robusto a run perdido: pega `next_due_date <= hoje` (não igualdade exata, senão um run
 * atrasado/perdido pularia permanentemente a coorte daquele dia). Como a assinatura fica 'active'
 * durante a janela de renovação e a `next_due_date` só avança quando o pagamento é confirmado
 * (webhook), o aluno é lembrado enquanto não paga e sai da janela ao pagar (ou é suspenso pelo
 * cron de carência). Pode repetir o lembrete alguns dias na janela — aceitável pra cobrança.
 */

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const admin = createAdminClient()
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)

    // Assinaturas recorrentes por PIX ativas cuja cobrança já venceu (next_due_date <= hoje).
    const { data: rows, error } = await admin
      .from('student_subscriptions')
      .select('id, student_user_id, teacher_user_id, next_due_date, student_service_plans(name)')
      .eq('recurring', true)
      .eq('billing_method', 'pix')
      .eq('status', 'active')
      .lte('next_due_date', today)
      .not('student_user_id', 'is', null)
      .limit(5000)

    if (error) return respondDbError('cron:student-charges-due', error, 500)

    const targets = (rows ?? []).filter((r) => Boolean(r.student_user_id))
    if (targets.length === 0) return NextResponse.json({ ok: true, reminded: 0 })

    const notifs = targets.map((r) => {
      const uid = String(r.student_user_id || '')
      const planData = r.student_service_plans
      const planRow = (Array.isArray(planData) ? planData[0] : planData) as { name?: string } | null | undefined
      const planName = String(planRow?.name || 'seu plano')
      return {
        user_id: uid,
        recipient_id: uid,
        sender_id: String(r.teacher_user_id || uid),
        type: 'billing_issue' as const,
        title: '💸 Mensalidade disponível para pagamento',
        message: `A mensalidade de ${planName} está disponível. Abra o app e pague via PIX em 1 toque para manter seu acesso.`,
        is_read: false,
        metadata: {
          scope: 'student_charge_due',
          subscription_id: String(r.id),
        },
      }
    })

    await insertNotifications(notifs)

    logInfo('cron:student-charges-due', `Lembrete de mensalidade enviado para ${targets.length} aluno(s)`)
    return NextResponse.json({ ok: true, reminded: targets.length })
  } catch (e) {
    logError('cron:student-charges-due', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
