import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { hasValidInternalSecret } from '@/utils/auth/route'

const BodySchema = z.object({
  email: z.string().email(),
  full_name: z.string().optional(),
  check_only: z.boolean().optional(),
})

export async function POST(req: Request) {
  try {
    // R2#1: Require authentication — either internal secret or a valid Bearer token
    const admin = createAdminClient()
    let authenticated = false
    // Fonte da auth: `secret` = server confiável (server-to-server), pode pré-whitelistar
    // qualquer email; `bearer` = usuário logado, só pode pré-whitelistar o PRÓPRIO email.
    let viaSecret = false
    let bearerEmail: string | null = null

    if (hasValidInternalSecret(req)) {
      authenticated = true
      viaSecret = true
    } else {
      const bearer = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
      if (bearer) {
        const { data, error } = await admin.auth.getUser(bearer)
        if (!error && data?.user?.id) {
          authenticated = true
          bearerEmail = String(data.user.email || '').trim().toLowerCase() || null
        }
      }
    }

    if (!authenticated) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const body = parsed.data!

    const email = String(body.email || '').trim().toLowerCase()
    const fullName = String(body.full_name || '').trim()
    if (!email) return NextResponse.json({ ok: false, error: 'missing_email' }, { status: 400 })

    // Um usuário logado (Bearer) só pode pré-whitelistar o PRÓPRIO email. Sem esta
    // trava, qualquer usuário registrado insere emails arbitrários na whitelist
    // `students` — a inserção usa o admin client (service role, ignora RLS) e a
    // whitelist governa o re-login via Apple (`enforce_invite_whitelist`), então
    // seria um bypass do invite-gating + poluição da tabela. O caminho internal-secret
    // (confiável) segue livre para pré-cadastrar convidados.
    if (!viaSecret && (!bearerEmail || email !== bearerEmail)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { data: existingStudent } = await admin
      .from('students')
      .select('id,email')
      .eq('email', email)
      .maybeSingle()

    const { data: existingTeacher } = await admin
      .from('teachers')
      .select('id,email')
      .eq('email', email)
      .maybeSingle()

    if (existingStudent?.id || existingTeacher?.id) {
      return NextResponse.json({ ok: true, existed: true })
    }

    // check_only mode: only verify existence, don't create
    if (body.check_only) {
      return NextResponse.json({ ok: true, existed: false })
    }

    const safeName =
      fullName ||
      email.split('@')[0]?.replace(/[^a-zA-Z0-9\s._-]/g, '').trim() ||
      'Aluno'

    const { error } = await admin
      .from('students')
      .insert({ name: safeName, email })

    if (error) {
      return NextResponse.json({ ok: false, error: error.message || 'insert_failed' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, inserted: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'unexpected_error' }, { status: 500 })
  }
}
