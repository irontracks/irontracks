import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError, logWarn } from '@/lib/logger'
import { safePgLike } from '@/utils/safePgFilter'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { cacheDeletePattern } from '@/utils/cache'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    requestId: z.string().min(1),
    action: z.enum(['accept', 'reject']),
  })
  .strip()

const sendApprovalEmail = async (toEmail: string, fullName: string, accountAlreadyCreated: boolean) => {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim()
  const from = String(process.env.RESEND_FROM || '').trim()
  const to = String(toEmail || '').trim()
  if (!apiKey || !from || !to) return

  const name = String(fullName || '').trim() || 'Atleta'
  const subject = 'Seu acesso ao IronTracks foi aprovado'
  const action = accountAlreadyCreated ? 'Você já pode entrar com seu e-mail e senha.' : 'Seu acesso foi aprovado. Agora você já pode criar sua conta e definir sua senha.'
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.5">
      <h2>Olá, ${name}!</h2>
      <p>${action}</p>
      <p><a href="https://irontracks.com.br" target="_blank" rel="noreferrer">Abrir IronTracks</a></p>
      <p style="opacity:.7;font-size:12px">Se você não solicitou acesso, ignore este e-mail.</p>
    </div>
  `

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  }).catch((): null => null)
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

    // Fetch request details
    const { data: request, error: fetchError } = await admin
      .from('access_requests')
      .select('*')
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
        .ilike('email', safePgLike(email))
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
          await admin.from('students').update({ user_id: null }).ilike('email', safePgLike(email))
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

      // Send approval email (external API — outside the DB transaction, best-effort)
      let emailWarning = false
      try {
        await sendApprovalEmail(
          result.email || String(request.email || ''),
          result.full_name || String(request.full_name || ''),
          result.account_existed,
        )
      } catch (e) {
        logWarn('admin:access-requests:action', 'Email send failed (non-fatal):', e)
        emailWarning = true
      }

      // Bust students list cache so admin panel reflects the change immediately
      try { await cacheDeletePattern('admin:students:list:*') } catch { /* non-fatal */ }

      return NextResponse.json({
        ok: true,
        message: result.account_existed
          ? 'Acesso liberado e e-mail enviado.'
          : 'Solicitação aprovada. Usuário já pode criar a conta.',
        ...(emailWarning ? { email_warning: true } : {}),
      })
    }

  } catch (e: unknown) {
    logError('error', 'Access Action Error:', e)
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
