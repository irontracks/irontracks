import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync } from '@/utils/rateLimit'
import { respondDbError } from '@/utils/api/dbError'
import { respondInternalError } from '@/utils/api/internalError'
import { brtDateKey } from '@/utils/cron/dateBrt'
import { normalizarHorario } from '@/lib/nutrition/mealTimes'
import { medicamentoValeNoDia, podeRegistrarTomada } from '@/lib/medications/agenda'
import type { Medication, MedicationIntake } from '@/types/medications'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * /api/medications/intakes — o "Tomei" e o "Desfazer".
 *
 * Duas fronteiras que não podem cair:
 *  1. SÓ HOJE (dia BRT, decisão D6). Marcar dia passado reescreveria a adesão que o
 *     professor lê; dia futuro seria registrar o que não houve. 409 `dia_virou`.
 *  2. A tomada tem de ser de uma DOSE QUE EXISTE: o horário está em `times` e o
 *     remédio vale hoje. Sem isso, qualquer cliente gravaria tomada fantasma.
 *
 * ⚠️ A tabela NÃO tem policy de UPDATE: gravar é INSERT que ignora duplicata
 * (`ON CONFLICT DO NOTHING`) e reler a linha. `ON CONFLICT DO UPDATE` seria
 * barrado pela RLS e o segundo toque em "Tomei" viraria erro.
 * ────────────────────────────────────────────────────────── */

const DiaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).')
const BodySchema = z.object({
  medicationId: z.string().uuid(),
  time: z.string().trim().min(1).max(10),
  dateKey: DiaSchema,
})

const erro = (status: number, error: string) => NextResponse.json({ ok: false as const, error }, { status })

async function limitar(userId: string) {
  const rl = await checkRateLimitAsync(`medications-intake:${userId}`, 60, 60_000)
  if (rl.allowed) return null
  return NextResponse.json(
    { ok: false as const, error: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
  )
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const { supabase, user } = auth

    const limitada = await limitar(user.id)
    if (limitada) return limitada

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { medicationId, time, dateKey } = parsed.data as z.infer<typeof BodySchema>

    if (!podeRegistrarTomada(dateKey, brtDateKey())) return erro(409, 'dia_virou')

    const horario = normalizarHorario(time)
    if (!horario) return erro(400, 'horario_invalido')

    const { data: med, error: medError } = await supabase
      .from('medications')
      .select('*')
      .eq('id', medicationId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (medError) return respondDbError('medications:intake:med', medError, 500)
    if (!med) return erro(404, 'nao_encontrado')

    const remedio = med as Medication
    const horarios = (Array.isArray(remedio.times) ? remedio.times : []).map((t) => normalizarHorario(t))
    if (!horarios.includes(horario) || !medicamentoValeNoDia(remedio, dateKey)) {
      return erro(400, 'horario_invalido')
    }

    const { error: insertError } = await supabase.from('medication_intakes').upsert(
      {
        medication_id: medicationId,
        user_id: user.id,
        date: dateKey,
        scheduled_time: horario,
        recorded_by: user.id,
      },
      { onConflict: 'medication_id,date,scheduled_time', ignoreDuplicates: true },
    )
    if (insertError) return respondDbError('medications:intake:insert', insertError, 500)

    // Duplicata ignorada não devolve linha: relê a tomada (a nova ou a que já existia).
    const { data: intake, error: readError } = await supabase
      .from('medication_intakes')
      .select('*')
      .eq('medication_id', medicationId)
      .eq('user_id', user.id)
      .eq('date', dateKey)
      .eq('scheduled_time', horario)
      .maybeSingle()
    if (readError) return respondDbError('medications:intake:read', readError, 500)
    if (!intake) return respondDbError('medications:intake:read', new Error('tomada não encontrada após gravar'), 500)

    return NextResponse.json({ ok: true, intake: intake as MedicationIntake })
  } catch (e: unknown) {
    return respondInternalError('api:medications:intakes:post', e)
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const { supabase, user } = auth

    const limitada = await limitar(user.id)
    if (limitada) return limitada

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { medicationId, time, dateKey } = parsed.data as z.infer<typeof BodySchema>

    if (!podeRegistrarTomada(dateKey, brtDateKey())) return erro(409, 'dia_virou')

    const horario = normalizarHorario(time)
    if (!horario) return erro(400, 'horario_invalido')

    // Idempotente: desfazer uma tomada que já não existe também é sucesso.
    const { error } = await supabase
      .from('medication_intakes')
      .delete()
      .eq('medication_id', medicationId)
      .eq('user_id', user.id)
      .eq('date', dateKey)
      .eq('scheduled_time', horario)
    if (error) return respondDbError('medications:intake:delete', error, 500)

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return respondInternalError('api:medications:intakes:delete', e)
  }
}
