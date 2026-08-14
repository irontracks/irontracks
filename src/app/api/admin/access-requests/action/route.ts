import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { logError, logWarn } from '@/lib/logger'
import { safeEmailLike } from '@/utils/safePgFilter'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { cacheDeletePattern } from '@/utils/cache'
import { sendTransactionalEmail, describeEmailFailure, type EmailResult } from '@/utils/email/sendEmail'
import { buildApprovalEmail, buildRejectionEmail, SUPPORT_EMAIL } from '@/utils/email/approvalEmail'

/**
 * Registro PERSISTENTE de cada tentativa de envio.
 *
 * Sem isto, "fulano recebeu o e-mail?" não tem resposta: o log da Vercel expira
 * e o Sentry não recebe erro de rota server neste projeto. Com o `provider_id`
 * dá para achar a entrega no painel da Resend.
 *
 * Nunca lança: falhar a auditoria não pode derrubar a aprovação, que já está
 * gravada pela RPC.
 */
async function recordEmailAttempt(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    requestId: string
    email: string
    accountExisted: boolean
    result: EmailResult
    resent?: boolean
    actorId: string | null
    actorEmail: string | null
    actorRole: string
  },
): Promise<void> {
  try {
    await admin.from('audit_events').insert({
      actor_id: input.actorId,
      actor_email: input.actorEmail,
      actor_role: input.actorRole,
      action: input.result.ok ? 'approval_email_sent' : 'approval_email_failed',
      entity_type: 'access_request',
      entity_id: input.requestId,
      metadata: {
        email: input.email,
        account_existed: input.accountExisted,
        ...(input.resent ? { resent: true } : {}),
        ...(input.result.ok
          ? { provider_id: input.result.id }
          : { reason: input.result.reason, detail: input.result.detail ?? null }),
      },
    })
  } catch (e) {
    logError('admin:access-requests:action', e, { stage: 'email_audit' })
  }
}

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    requestId: z.string().min(1),
    // `resend_email` reenvia o aviso de aprovação de uma solicitação JÁ
    // aprovada. Existe porque o envio podia falhar sem deixar rastro e o admin
    // não tinha como tentar de novo — só avisar por fora.
    action: z.enum(['accept', 'reject', 'resend_email']),
  })
  .strip()

/**
 * Envia o e-mail de aprovação e devolve o que ACONTECEU.
 *
 * A versão anterior era um `fetch(...).catch(() => null)` que não olhava
 * `res.ok`: chave ausente, domínio não verificado e erro de rede saíam todos
 * como sucesso, e o `email_warning` da resposta era código morto. Ver
 * `src/utils/email/sendEmail.ts` para o histórico completo.
 */
const sendApprovalEmail = async (
  toEmail: string,
  fullName: string,
  accountAlreadyCreated: boolean,
): Promise<EmailResult> => {
  const built = buildApprovalEmail({ name: fullName, accountExisted: accountAlreadyCreated })
  return sendTransactionalEmail({
    to: String(toEmail || '').trim(),
    subject: built.subject,
    html: built.html,
    text: built.text,
    replyTo: SUPPORT_EMAIL,
  })
}

export async function POST(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin'])
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rlKey = `admin:access-action:${auth.user.id}:${ip}`
    const rl = await checkRateLimitAsync(rlKey, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body: Record<string, unknown> = parsedBody.data!
    const requestId = String(body?.requestId || '').trim()
    const action = String(body?.action || '').trim()

    if (!requestId || (action !== 'accept' && action !== 'reject' && action !== 'resend_email')) {
      return NextResponse.json({ ok: false, error: 'Dados inválidos.' }, { status: 400 })
    }

    let admin: ReturnType<typeof createAdminClient>
    try {
      admin = createAdminClient()
    } catch (adminErr) {
      const msg = adminErr instanceof Error ? adminErr.message : String(adminErr)
      logError('access-requests/action', 'Admin client creation failed:', msg)
      return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
    }

    // Fetch request details — select only columns that exist in access_requests.
    // Historical note: the previous select referenced nonexistent columns
    // (requester_id, teacher_id, gym_id, message) causing every approve/reject
    // to fail with a 500 before even reaching the RPC.
    const { data: request, error: fetchError } = await admin
      .from('access_requests')
      .select('id, status, created_at, email, full_name, phone')
      .eq('id', requestId)
      .maybeSingle()

    if (fetchError) {
      logError('access-requests/action', `Fetch error for requestId ${requestId}: ${fetchError.message}`)
      return NextResponse.json({ ok: false, error: 'Erro ao buscar solicitação.' }, { status: 500 })
    }

    if (!request) {
      logWarn('access-requests/action', 'Request not found — may have been processed by another admin. requestId:', requestId)
      return NextResponse.json({ ok: false, error: 'Essa solicitação já foi processada ou removida. Atualize a lista.' }, { status: 404 })
    }

    const wasApproved = request.status === 'approved' || request.status === 'accepted'

    // ── RESEND ────────────────────────────────────────────────────────────────
    // Só faz sentido para solicitação já aprovada: é o segundo tiro depois de o
    // primeiro e-mail ter falhado (antes, o admin não tinha nenhum).
    if (action === 'resend_email') {
      if (!wasApproved) {
        return NextResponse.json({ ok: false, error: 'Só dá para reenviar o e-mail de uma solicitação já aprovada.' }, { status: 400 })
      }

      const email = String(request.email || '').trim()
      const name = String(request.full_name || '')
      // O texto muda se a conta existe ou não — precisa ser reconferido agora,
      // porque a pessoa pode ter criado a conta depois da aprovação.
      const { data: profile } = await admin
        .from('profiles').select('id').ilike('email', safeEmailLike(email)).maybeSingle()
      const accountExisted = Boolean((profile as { id?: string } | null)?.id)

      const emailResult = await sendApprovalEmail(email, name, accountExisted)
      await recordEmailAttempt(admin, {
        requestId, email, accountExisted, result: emailResult, resent: true,
        actorId: String(auth.user?.id || '').trim() || null,
        actorEmail: auth.user?.email ? String(auth.user.email).trim() : null,
        actorRole: String(auth.role || 'admin'),
      })

      return emailResult.ok
        ? NextResponse.json({ ok: true, message: `E-mail reenviado para ${email}.` })
        : NextResponse.json({
            ok: false,
            error: describeEmailFailure(emailResult.reason),
          }, { status: 502 })
    }

    if (request.status !== 'pending') {
      return NextResponse.json({
        ok: false,
        error: `Essa solicitação já foi ${wasApproved ? 'aprovada' : 'recusada'} anteriormente.`,
      }, { status: 400 })
    }

    // ── REJECT ────────────────────────────────────────────────────────────────
    if (action === 'reject') {
      const email = String(request.email || '').trim()

      await admin.from('audit_events').insert({
        actor_id: auth.user.id,
        actor_email: String(auth.user.email || '').trim() || null,
        actor_role: auth.role,
        action: 'access_request_reject',
        entity_type: 'access_request',
        entity_id: requestId,
        metadata: { email },
      })

      const { data: profile } = await admin
        .from('profiles')
        .select('id, role, is_approved')
        .ilike('email', safeEmailLike(email))
        .maybeSingle()

      if (profile?.id && profile.is_approved !== true) {
        const role = String(profile.role || '').toLowerCase()
        const isStaff = role === 'admin' || role === 'teacher'
        if (!isStaff) {
          await admin.from('audit_events').insert({
            actor_id: auth.user.id,
            actor_email: String(auth.user.email || '').trim() || null,
            actor_role: auth.role,
            action: 'access_request_reject_cleanup_user',
            entity_type: 'profile',
            entity_id: profile.id,
            metadata: { email, role },
          })
          await admin.from('profiles').delete().eq('id', profile.id)
          await admin.auth.admin.deleteUser(profile.id)
          await admin.from('students').update({ user_id: null }).ilike('email', safeEmailLike(email))
        }
      }

      const { error: deleteError } = await admin.from('access_requests').delete().eq('id', requestId)
      if (deleteError) throw deleteError

      // Até ago/2026 quem era recusado não recebia nada: a solicitação sumia, a
      // conta era deletada, e a pessoa ficava na tela de espera para sempre sem
      // saber. Enviado DEPOIS das escritas — o e-mail é cortesia, a recusa não
      // depende dele.
      const rejection = buildRejectionEmail({ name: String(request.full_name || '') })
      const rejectionResult = await sendTransactionalEmail({
        to: email,
        subject: rejection.subject,
        html: rejection.html,
        text: rejection.text,
        replyTo: SUPPORT_EMAIL,
      })
      if (!rejectionResult.ok) {
        logError('admin:access-requests:action', new Error('rejection_email_failed'), {
          reason: rejectionResult.reason,
        })
      }

      return NextResponse.json({
        ok: true,
        message: rejectionResult.ok
          ? 'Solicitação recusada e o usuário foi avisado por e-mail.'
          : 'Solicitação recusada, mas o e-mail de aviso NÃO foi enviado.',
        ...(rejectionResult.ok ? {} : {
          email_warning: true,
          email_error: describeEmailFailure(rejectionResult.reason),
        }),
      })
    }

    // ── ACCEPT ────────────────────────────────────────────────────────────────
    if (action === 'accept') {
      const actorId = String(auth.user?.id || '').trim() || null
      const actorEmail = auth.user?.email ? String(auth.user.email).trim() : null
      const actorRole = String(auth.role || 'admin')

      // Atomically approve via RPC — all DB writes in one transaction
      const { data: rpcResult, error: rpcError } = await admin.rpc('approve_access_request', {
        p_request_id:  requestId,
        p_actor_id:    actorId,
        p_actor_email: actorEmail,
        p_actor_role:  actorRole,
      })

      if (rpcError) {
        const msg = String(rpcError.message || '').trim()
        const lower = msg.toLowerCase()
        if (lower.includes('request_not_found')) {
          return NextResponse.json({ ok: false, error: 'Solicitação não encontrada.' }, { status: 404 })
        }
        if (lower.includes('request_not_pending')) {
          return NextResponse.json({ ok: false, error: 'Essa solicitação já foi processada.' }, { status: 400 })
        }
        if (lower.includes('schema cache') || lower.includes('approve_access_request')) {
          return NextResponse.json({
            ok: false,
            error: 'Função de aprovação não encontrada. Rode a migration 20260401_approve_access_request_rpc.sql no Supabase.',
          }, { status: 400 })
        }
        throw rpcError
      }

      const result = (rpcResult || {}) as {
        user_id: string | null
        email: string
        full_name: string
        role: string
        account_existed: boolean
      }

      // O e-mail é API externa: fica FORA da transação do banco. A aprovação já
      // está gravada — falhar aqui não desfaz nada, mas precisa aparecer,
      // porque a tela de espera promete o e-mail ao usuário.
      //
      // Havia um aviso paralelo por WhatsApp (Z-API), removido em ago/2026
      // junto com o resto do sistema: 2 conversas no total, a última em maio.
      // O e-mail é o único canal agora — mais uma razão para ele não falhar mudo.
      const resolvedName = result.full_name || String(request.full_name || '')
      const resolvedEmail = result.email || String(request.email || '')
      const emailResult = await sendApprovalEmail(resolvedEmail, resolvedName, result.account_existed)

      await recordEmailAttempt(admin, {
        requestId, email: resolvedEmail, accountExisted: result.account_existed,
        result: emailResult, actorId, actorEmail, actorRole,
      })

      // Bust students list cache so admin panel reflects the change immediately
      try { await cacheDeletePattern('admin:students:list:*') } catch { /* non-fatal */ }

      // A mensagem não pode afirmar envio sem prova — era o que dizia antes.
      return NextResponse.json({
        ok: true,
        message: emailResult.ok
          ? 'Acesso liberado e e-mail de aprovação enviado.'
          : 'Acesso liberado, mas o e-mail NÃO foi enviado.',
        ...(emailResult.ok ? {} : {
          email_warning: true,
          email_error: describeEmailFailure(emailResult.reason),
        }),
      })
    }

  } catch (e: unknown) {
    logError('error', 'Access Action Error:', e)
    return respondInternalError('api:admin:access-requests:action', e)
  }
}
