import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { z } from 'zod'
import { requireRole } from '@/utils/auth/route'
import { canCoachStudent } from '@/utils/auth/studentAccess'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync } from '@/utils/rateLimit'
import { respondDbError } from '@/utils/api/dbError'
import { respondInternalError } from '@/utils/api/internalError'
import { brtDateKey, brtDateKeyDaysAgo } from '@/utils/cron/dateBrt'
import { notifyCoachChange } from '@/lib/notifications/coachChangeNotice'
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
 * /api/teacher/medications — o professor VÊ e EDITA a lista de remédios do aluno
 * vinculado (decisão do dono, 03/10/2026).
 *
 * Fronteiras, na ordem em que cada método as aplica:
 *   requireRole → corpo/consulta válidos → `canCoachStudent` → rate limit.
 *
 * ⚠️ Cliente da SESSÃO do professor, NUNCA service-role: a RLS de `medications`
 * (`is_teacher_of`) é a segunda trava — se `canCoachStudent` algum dia errar, o
 * banco ainda recusa. Com o admin client as duas travas virariam uma. O núcleo
 * ainda filtra `.eq('user_id', studentId)` em toda escrita.
 *
 * O professor NÃO registra "Tomei" (só o aluno) e só LÊ as tomadas — dos últimos 7
 * dias, para a adesão em texto.
 *
 * Dado de saúde (LGPD art. 11): erro de banco nunca sai em texto cru.
 * ────────────────────────────────────────────────────────── */

const DIAS_DE_ADESAO = 7

const StudentIdSchema = z.object({ studentId: z.string().uuid() })
const IdSchema = z.object({ id: z.string().uuid() })
// `.and` em vez de `.extend`: entrada e patch são schemas com `refine`.
const PostBodySchema = StudentIdSchema.and(MedicationInputSchema)
const PatchBodySchema = StudentIdSchema.and(IdSchema).and(MedicationPatchSchema)
const DeleteBodySchema = StudentIdSchema.and(IdSchema)

const STATUS_DA_FALHA: Record<Exclude<CodigoDeFalha, 'database_error'>, number> = {
  limite_atingido: 409,
  nao_encontrado: 404,
  datas_invalidas: 400,
}

function responderFalha(logKey: string, falha: { code: CodigoDeFalha; error?: unknown }) {
  if (falha.code === 'database_error') return respondDbError(logKey, falha.error, 500)
  return NextResponse.json({ ok: false as const, error: falha.code }, { status: STATUS_DA_FALHA[falha.code] })
}

const proibido = () => NextResponse.json({ ok: false as const, error: 'forbidden' }, { status: 403 })

function limitado(retryAfterSeconds: number) {
  return NextResponse.json(
    { ok: false as const, error: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}

/**
 * Aviso ao aluno — só depois da escrita CONFIRMADA, e best-effort: a mudança já está
 * gravada e falhar o push não pode devolver erro ao professor. A janela de 30 min do
 * módulo agrupa uma rodada de edições num aviso só.
 */
function avisarAluno(studentId: string) {
  waitUntil(
    notifyCoachChange({ studentUserId: studentId, kind: 'medication_updated', origem: 'medication_edit' })
      .catch(() => { }),
  )
}

export async function GET(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const { supabase, user } = auth

    const consulta = StudentIdSchema.safeParse({ studentId: new URL(req.url).searchParams.get('studentId') })
    if (!consulta.success) {
      return NextResponse.json({ ok: false as const, error: 'invalid_student_id' }, { status: 400 })
    }
    const { studentId } = consulta.data

    if (!(await canCoachStudent({ id: user.id, email: user.email }, studentId))) return proibido()

    const rl = await checkRateLimitAsync(`teacher-medications:${user.id}`, 120, 60_000)
    if (!rl.allowed) return limitado(rl.retryAfterSeconds)

    // Hoje e os 6 dias anteriores, em BRT (inclusivo): 7 dias de adesão.
    const hoje = brtDateKey()
    const desde = brtDateKeyDaysAgo(DIAS_DE_ADESAO - 1)
    const [meds, intakes] = await Promise.all([
      listMedicationsCore(supabase, studentId),
      listIntakesCore(supabase, studentId, desde, hoje),
    ])
    if (!meds.ok) return responderFalha('teacher-medications:list', meds)
    if (!intakes.ok) return responderFalha('teacher-medications:intakes', intakes)

    return NextResponse.json({ ok: true, medications: meds.data, intakes: intakes.data })
  } catch (e: unknown) {
    return respondInternalError('api:teacher:medications:get', e)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const { supabase, user } = auth

    const parsed = await parseJsonBody(req, PostBodySchema)
    if (parsed.response) return parsed.response
    const { studentId, ...input } = parsed.data as z.infer<typeof PostBodySchema>

    if (!(await canCoachStudent({ id: user.id, email: user.email }, studentId))) return proibido()

    const rl = await checkRateLimitAsync(`teacher-medications:${user.id}`, 60, 60_000)
    if (!rl.allowed) return limitado(rl.retryAfterSeconds)

    const r = await createMedicationCore(supabase, studentId, input, user.id)
    if (!r.ok) return responderFalha('teacher-medications:create', r)

    avisarAluno(studentId)
    return NextResponse.json({ ok: true, medication: r.data })
  } catch (e: unknown) {
    return respondInternalError('api:teacher:medications:post', e)
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const { supabase, user } = auth

    const parsed = await parseJsonBody(req, PatchBodySchema)
    if (parsed.response) return parsed.response
    const { studentId, id, ...patch } = parsed.data as z.infer<typeof PatchBodySchema>

    if (!(await canCoachStudent({ id: user.id, email: user.email }, studentId))) return proibido()

    const rl = await checkRateLimitAsync(`teacher-medications:${user.id}`, 60, 60_000)
    if (!rl.allowed) return limitado(rl.retryAfterSeconds)

    const r = await updateMedicationCore(supabase, studentId, id, patch, user.id)
    if (!r.ok) return responderFalha('teacher-medications:update', r)

    avisarAluno(studentId)
    return NextResponse.json({ ok: true, medication: r.data })
  } catch (e: unknown) {
    return respondInternalError('api:teacher:medications:patch', e)
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const { supabase, user } = auth

    const parsed = await parseJsonBody(req, DeleteBodySchema)
    if (parsed.response) return parsed.response
    const { studentId, id } = parsed.data as z.infer<typeof DeleteBodySchema>

    if (!(await canCoachStudent({ id: user.id, email: user.email }, studentId))) return proibido()

    const rl = await checkRateLimitAsync(`teacher-medications:${user.id}`, 60, 60_000)
    if (!rl.allowed) return limitado(rl.retryAfterSeconds)

    const r = await deleteMedicationCore(supabase, studentId, id)
    if (!r.ok) return responderFalha('teacher-medications:delete', r)

    avisarAluno(studentId)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return respondInternalError('api:teacher:medications:delete', e)
  }
}
