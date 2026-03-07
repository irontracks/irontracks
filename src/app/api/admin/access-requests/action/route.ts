import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError, logWarn, logInfo } from '@/lib/logger'

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
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  }).catch((): null => null)
}

export async function POST(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }

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
      return NextResponse.json({ ok: false, error: `Erro interno: ${msg}` }, { status: 500 })
    }

    // Fetch request details — use select('*') to avoid column-not-found errors
    const { data: request, error: fetchError } = await admin
      .from('access_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()

    if (fetchError) {
      logError('access-requests/action', `Fetch error for requestId ${requestId}: ${fetchError.message}`)
      // Expose real error to help diagnose
      return NextResponse.json({ ok: false, error: `Erro ao buscar solicitação: ${fetchError.message}` }, { status: 500 })
    }

    if (!request) {
      logWarn('access-requests/action', 'Request not found — may have been processed by another admin. requestId:', requestId)
      return NextResponse.json({ ok: false, error: 'Essa solicitação já foi processada ou removida. Atualize a lista.' }, { status: 404 })
    }

    if (request.status !== 'pending') {
      return NextResponse.json({ ok: false, error: `Essa solicitação já foi ${request.status === 'accepted' || request.status === 'approved' ? 'aprovada' : 'recusada'} anteriormente.` }, { status: 400 })
    }

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
        .ilike('email', email)
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
          await admin.from('students').update({ user_id: null }).ilike('email', email)
        }
      }

      const { error: deleteError } = await admin.from('access_requests').delete().eq('id', requestId)
      if (deleteError) throw deleteError

      return NextResponse.json({ ok: true, message: 'Solicitação recusada e removida.' })
    }

    if (action === 'accept') {
      const { error: updateError } = await admin
        .from('access_requests')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', requestId)

      if (updateError) throw updateError

      const email = String(request.email || '').trim()
      const fullName = String(request.full_name || '').trim()
      const roleRequested = String(request.role_requested || 'student').trim()
      const cref = String(request.cref || '').trim()

      const { data: profile } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
      const userId = profile?.id ? String(profile.id) : ''

      // If approved and requested to be teacher, promote
      if (roleRequested === 'teacher') {
        // 1. Create Teacher record if not exists
        const { data: existingTeacher } = await admin.from('teachers').select('id').ilike('email', email).maybeSingle()
        if (!existingTeacher) {
          await admin.from('teachers').insert({
            email,
            name: fullName || email.split('@')[0],
            phone: request.phone || null,
            user_id: userId || null,
            status: 'active',
            is_approved: true,          // Bug #8 fix: mark approval upfront
            approved_at: new Date().toISOString(),
            approved_by: auth.user.id,
          })
        } else {
          // Update existing teacher record with approval info
          await admin.from('teachers').update({
            user_id: userId || null,
            is_approved: true,
            approved_at: new Date().toISOString(),
            approved_by: auth.user.id,
          }).eq('id', existingTeacher.id)
        }

        // 2. Update Profile role if exists
        if (userId) {
          await admin.from('profiles').update({
            role: 'teacher',
            is_approved: true,
            approval_status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: auth.user.id,
          }).eq('id', userId)
        }
        // Bug #8 fix: if user has no account yet, store pre-approval in access_requests
        // so that when they sign up, the onboarding flow can pick up their approved status
        if (!userId) {
          try {
            await admin.from('access_requests').update({
              status: 'accepted',
              metadata: {
                pre_approved: true,
                role: 'teacher',
                approved_at: new Date().toISOString(),
                approved_by: auth.user.id,
              }
            }).eq('id', requestId)
          } catch { /* non-fatal — pre-approval stored in teachers table */ }
        }
      }

      if (userId) {
        // If not teacher (or fallback), ensure approved
        if (roleRequested !== 'teacher') {
          const { error: approveError } = await admin.from('profiles').update({
            is_approved: true,
            approval_status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: auth.user.id,
          }).eq('id', userId)
          if (approveError) throw approveError
        }

        const { data: existingStudent } = await admin.from('students').select('id').ilike('email', email).maybeSingle()
        if (!existingStudent?.id) {
          const payload: Record<string, unknown> = { email }
          if (fullName) payload.name = fullName
          payload.user_id = userId
          await admin.from('students').insert(payload)
        } else {
          await admin.from('students').update({ user_id: userId }).eq('id', existingStudent.id)
        }
      }

      try {
        await sendApprovalEmail(email, fullName, !!userId)
      } catch { }

      return NextResponse.json({
        ok: true,
        message: userId ? 'Acesso liberado e e-mail enviado.' : 'Solicitação aprovada. Usuário já pode criar a conta.',
      })
    }

  } catch (e: unknown) {
    logError('error', 'Access Action Error:', e)
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
