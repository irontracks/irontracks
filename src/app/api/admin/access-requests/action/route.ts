import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError, logWarn } from '@/lib/logger'
import { safeEmailLike } from '@/utils/safePgFilter'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { cacheDeletePattern } from '@/utils/cache'
import { env } from '@/utils/env'
import { sendTransactionalEmail, describeEmailFailure, type EmailResult } from '@/utils/email/sendEmail'
import { buildApprovalEmail, SUPPORT_EMAIL } from '@/utils/email/approvalEmail'

// Normaliza número BR para E.164 sem o "+": 5511999999999
function normalizeBrPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11) return `55${digits}`  // (11) 9xxxx-xxxx
  if (digits.length === 13 && digits.startsWith('55')) return digits
  if (digits.length === 12 && digits.startsWith('55')) return digits
  return null
}

const sendWhatsAppMessage = async (rawPhone: string, fullName: string, accountExisted: boolean) => {
  const instanceId = env.zapi.instanceId
  const token = env.zapi.token
  if (!instanceId || !token) return

  const phone = normalizeBrPhone(rawPhone)
  if (!phone) return

  const name = (fullName || 'Atleta').split(' ')[0]
  const message = accountExisted
    ? `Olá ${name}! Seu acesso ao *IronTracks* foi aprovado. Você já pode entrar com seu e-mail e senha. Bons treinos! 💪`
    : `Olá ${name}! Seu acesso ao *IronTracks* foi aprovado. Acesse https://irontracks.com.br para criar sua senha e começar a treinar!`

  const clientToken = env.zapi.clientToken
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (clientToken) headers['Client-Token'] = clientToken

  await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone, message }),
  }).catch((): null => null)
}

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    requestId: z.string().min(1),
    action: z.enum(['accept', 'reject']),
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

    if (!requestId || (action !== 'accept' && action !== 'reject')) {
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

    if (request.status !== 'pending') {
      const wasApproved = request.status === 'approved' || request.status === 'accepted'
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

      return NextResponse.json({ ok: true, message: 'Solicitação recusada e removida.' })
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

      // E-mail + WhatsApp são APIs externas: ficam FORA da transação do banco.
      // A aprovação já está gravada — falhar aqui não desfaz nada, mas precisa
      // aparecer, porque a tela de espera promete o e-mail ao usuário.
      const resolvedName = result.full_name || String(request.full_name || '')
      const resolvedEmail = result.email || String(request.email || '')
      const emailResult = await sendApprovalEmail(resolvedEmail, resolvedName, result.account_existed)

      // Registro PERSISTENTE do envio. Sem isto, "fulano recebeu o e-mail?" não
      // tem resposta: log da Vercel expira e o Sentry não recebe erro de rota
      // server neste projeto. Com o `provider_id` dá para achar a entrega no
      // painel da Resend. Falhar a auditoria não pode derrubar a aprovação.
      try {
        await admin.from('audit_events').insert({
          actor_id: actorId,
          actor_email: actorEmail,
          actor_role: actorRole,
          action: emailResult.ok ? 'approval_email_sent' : 'approval_email_failed',
          entity_type: 'access_request',
          entity_id: requestId,
          metadata: {
            email: resolvedEmail,
            account_existed: result.account_existed,
            ...(emailResult.ok
              ? { provider_id: emailResult.id }
              : { reason: emailResult.reason, detail: emailResult.detail ?? null }),
          },
        })
      } catch (e) {
        logError('admin:access-requests:action', e, { stage: 'email_audit' })
      }

      const phone = String(request.phone || '').trim()
      if (phone) {
        sendWhatsAppMessage(phone, resolvedName, result.account_existed).catch(
          (e) => logError('admin:access-requests:action', e, { stage: 'whatsapp' }),
        )
      }

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
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
