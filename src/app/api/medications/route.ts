import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync } from '@/utils/rateLimit'
import { respondDbError } from '@/utils/api/dbError'
import { respondInternalError } from '@/utils/api/internalError'
import { brtDateKey } from '@/utils/cron/dateBrt'
import { MedicationInputSchema, MedicationPatchSchema } from '@/schemas/medications'
import {
  createMedicationCore,
  deleteMedicationCore,
  listIntakesCore,
  listMedicationsCore,
  updateMedicationCore,
  type CodigoDeFalha,
} from '@/lib/medications/mutations'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * /api/medications — a lista de remédios do PRÓPRIO usuário.
 *
 * Cliente da SESSÃO (RLS), nunca service-role: o dono só alcança o que é dele, e o
 * núcleo ainda filtra por `user_id` em toda escrita. O professor vinculado edita
 * por outra rota (`/api/teacher/medications`).
 *
 * Dado de saúde (LGPD art. 11): erro de banco NUNCA sai em texto cru — vai por
 * `respondDbError`/`respondInternalError`.
 * ────────────────────────────────────────────────────────── */

const IdSchema = z.object({ id: z.string().uuid() })
// `.and` em vez de `.extend`: o patch é um schema com `refine`, que não estende.
const PatchBodySchema = IdSchema.and(MedicationPatchSchema)

const STATUS_DA_FALHA: Record<Exclude<CodigoDeFalha, 'database_error'>, number> = {
  limite_atingido: 409,
  nao_encontrado: 404,
  datas_invalidas: 400,
}

function responderFalha(logKey: string, falha: { code: CodigoDeFalha; error?: unknown }) {
  if (falha.code === 'database_error') return respondDbError(logKey, falha.error, 500)
  return NextResponse.json({ ok: false as const, error: falha.code }, { status: STATUS_DA_FALHA[falha.code] })
}

function limitado(retryAfterSeconds: number) {
  return NextResponse.json(
    { ok: false as const, error: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const { supabase, user } = auth

    const rl = await checkRateLimitAsync(`medications-read:${user.id}`, 120, 60_000)
    if (!rl.allowed) return limitado(rl.retryAfterSeconds)

    const today = brtDateKey()
    const [meds, intakes, vinculo] = await Promise.all([
      listMedicationsCore(supabase, user.id),
      listIntakesCore(supabase, user.id, today, today),
      supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .not('teacher_id', 'is', null)
        .limit(1)
        .maybeSingle(),
    ])
    if (!meds.ok) return responderFalha('medications:list', meds)
    if (!intakes.ok) return responderFalha('medications:intakes', intakes)

    // O vínculo só alimenta uma linha informativa da tela ("seu professor pode
    // ver…"): falha na leitura vira `false`, não derruba a lista de remédios.
    const hasCoach = !vinculo.error && Boolean(vinculo.data?.id)

    return NextResponse.json({
      ok: true,
      medications: meds.data,
      intakes: intakes.data,
      today,
      hasCoach,
    })
  } catch (e: unknown) {
    return respondInternalError('api:medications:get', e)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const { supabase, user } = auth

    const rl = await checkRateLimitAsync(`medications-write:${user.id}`, 60, 60_000)
    if (!rl.allowed) return limitado(rl.retryAfterSeconds)

    const parsed = await parseJsonBody(req, MedicationInputSchema)
    if (parsed.response) return parsed.response
    const input = parsed.data as z.infer<typeof MedicationInputSchema>

    const r = await createMedicationCore(supabase, user.id, input, user.id)
    if (!r.ok) return responderFalha('medications:create', r)
    return NextResponse.json({ ok: true, medication: r.data })
  } catch (e: unknown) {
    return respondInternalError('api:medications:post', e)
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const { supabase, user } = auth

    const rl = await checkRateLimitAsync(`medications-write:${user.id}`, 60, 60_000)
    if (!rl.allowed) return limitado(rl.retryAfterSeconds)

    const parsed = await parseJsonBody(req, PatchBodySchema)
    if (parsed.response) return parsed.response
    const { id, ...patch } = parsed.data as z.infer<typeof PatchBodySchema>

    const r = await updateMedicationCore(supabase, user.id, id, patch, user.id)
    if (!r.ok) return responderFalha('medications:update', r)
    return NextResponse.json({ ok: true, medication: r.data })
  } catch (e: unknown) {
    return respondInternalError('api:medications:patch', e)
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const { supabase, user } = auth

    const rl = await checkRateLimitAsync(`medications-write:${user.id}`, 60, 60_000)
    if (!rl.allowed) return limitado(rl.retryAfterSeconds)

    const parsed = await parseJsonBody(req, IdSchema)
    if (parsed.response) return parsed.response
    const { id } = parsed.data as z.infer<typeof IdSchema>

    const r = await deleteMedicationCore(supabase, user.id, id)
    if (!r.ok) return responderFalha('medications:delete', r)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return respondInternalError('api:medications:delete', e)
  }
}
