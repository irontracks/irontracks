import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { canCoachStudent } from '@/utils/auth/studentAccess'
import { notifyCoachChange } from '@/lib/notifications/coachChangeNotice'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/notifications/coach-change
 *
 * Avisa o ALUNO que o professor mexeu no treino dele. A dieta não passa por
 * aqui: aquelas escritas já acontecem no servidor (`teacher/diet/*`) e chamam
 * `notifyCoachChange` direto — uma rota a mais no meio só abriria superfície.
 * O treino do painel é gravado pelo CLIENTE (RPC `save_workout_atomic` / server
 * action), e é por isso que esta rota existe.
 *
 * Gate igual ao do `workout-assigned`: papel de professor/admin E
 * `canCoachStudent` — sem o segundo, qualquer professor notificaria aluno
 * alheio (anti-IDOR).
 * ────────────────────────────────────────────────────────── */

const ZodBodySchema = z
  .object({
    studentUserId: z.string().min(1),
    // Hoje só treino. Dieta fica de fora por desenho (ver o cabeçalho) — e um
    // enum aberto convidaria a duplicar o caminho que já roda no servidor.
    kind: z.literal('workout_updated'),
    nome: z.string().max(120).optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response

    const parsed = await parseJsonBody(req, ZodBodySchema)
    if (parsed.response) return parsed.response
    const body = parsed.data as z.infer<typeof ZodBodySchema>
    const studentUserId = String(body.studentUserId || '').trim()

    const allowed = await canCoachStudent({ id: auth.user.id, email: auth.user.email }, studentUserId)
    if (!allowed) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const r = await notifyCoachChange({
      studentUserId,
      kind: body.kind,
      nome: body.nome,
      origem: 'workout_edit',
    })
    return NextResponse.json({ ok: r.ok, notified: r.notified, motivo: r.motivo ?? null })
  } catch (e: unknown) {
    // Nunca devolver a mensagem crua: erro de infra vazaria detalhe interno.
    logError('notifications:coach-change', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
