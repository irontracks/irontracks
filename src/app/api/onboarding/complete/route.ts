import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/onboarding/complete
 *
 * Conclui o primeiro acesso do aluno: grava o nome que ele confirmou. O aluno criado por OTP
 * não traz metadata de nome, então o handle_new_user cai no prefixo do email — aqui o próprio
 * aluno corrige. requireUser garante que ele só edita a PRÓPRIA conta. A senha é definida no
 * cliente (supabase.auth.updateUser), que exige a sessão do usuário.
 * ────────────────────────────────────────────────────────── */

const BodySchema = z
  .object({
    fullName: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string().min(2, 'Nome muito curto').transform((s) => s.slice(0, 120))),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { fullName } = parsed.data as { fullName: string }

    const admin = createAdminClient()
    // Nome no profile (só a PRÓPRIA conta — userId vem da sessão, não do body).
    const { error: pErr } = await admin.from('profiles').update({ display_name: fullName }).eq('id', userId)
    if (pErr) { logError('onboarding:complete:profile', pErr); return NextResponse.json({ ok: false, error: 'database_error' }, { status: 500 }) }
    // Nome na linha students vinculada (best-effort — pode não existir se vínculo veio por outro caminho).
    await admin.from('students').update({ name: fullName }).eq('user_id', userId)

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    logError('onboarding:complete', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
