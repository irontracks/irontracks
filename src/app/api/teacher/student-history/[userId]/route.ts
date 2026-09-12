/**
 * O histórico de carga do aluno, resumido para o painel de controle do professor.
 *
 * POR QUE UMA ROTA NOVA, e não a de admin que já existe
 *
 * `/api/admin/workouts/history` devolve a coluna `notes` CRUA, com teto de 200
 * sessões. Medido em produção: ~9,3 kB por sessão e um aluno com 162 sessões —
 * **1,9 MB** num único GET, dentro de um modal aberto durante o treino, no wifi
 * da academia. É o mesmo engorda-payload que o `slimHistoryRow` desfez no
 * histórico, em escala maior. Aqui o resumo acontece no SERVIDOR e o que trafega
 * é só `{ peso, reps, rpe }` por série dos exercícios do treino de hoje.
 *
 * ⚠️ O acesso é o mesmo de `student-session`: service-role + vínculo
 * professor↔aluno conferido em `students` (admin alcança qualquer um). O cliente
 * RLS do professor até lê `workouts` do aluno (policy `is_teacher_of`), mas a
 * rota usa service-role para ficar no mesmo molde de autorização do resto da
 * família `/api/teacher/` — uma checagem, num lugar.
 *
 * O QUE ESTA ROTA **NÃO** FAZ, de propósito: a sugestão do motor de carga.
 * Ela depende do gate do ALUNO (`autoLoadBeta && autoLoad`, em `user_settings`,
 * que é self-only), da prontidão do check-in de hoje e do grid de pesos da
 * máquina — e calcular sem esses insumos devolveria um número DIFERENTE do que
 * o aluno tem na tela, que é pior que não sugerir. O que trafega aqui é fato
 * medido ("da última vez ele fez 80 kg"), não palpite.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { respondDbError } from '@/utils/api/dbError'
import { respondInternalError } from '@/utils/api/internalError'
import {
  buildReportHistoryFromWorkouts,
  REPORT_HISTORY_LIMIT,
} from '@/lib/workout/reportHistoryFromWorkouts'
import { ultimaVezPorSerie } from '@/lib/workout/ultimaVezDoAluno'
import { normalizeExerciseKey } from '@/components/workout/utils'

export const dynamic = 'force-dynamic'

/**
 * Nomes dos exercícios do treino que está sendo controlado AGORA.
 *
 * Pedir a lista em vez de devolver o histórico inteiro é o que mantém a resposta
 * pequena: dez exercícios contra os 251 da biblioteca. Teto de 40 para uma
 * chamada malformada não virar varredura.
 */
const QuerySchema = z.object({
  exercicios: z.array(z.string().min(1).max(200)).min(1).max(40),
  series: z.array(z.number().int().min(0).max(60)).max(40).optional(),
})

async function verificarAcesso(req: Request, userId: string) {
  if (!userId) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: 'missing userId' }, { status: 400 }) }
  }

  const auth = await requireRoleOrBearer(req, ['admin', 'teacher'])
  if (!auth.ok) return { ok: false as const, response: auth.response }

  const admin = createAdminClient()

  if (auth.role === 'admin') {
    const { data: student, error } = await admin
      .from('students')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return { ok: false as const, response: respondDbError('teacher:student-history:students-admin', error) }
    if (!student) return { ok: false as const, response: NextResponse.json({ ok: false, error: 'student not found' }, { status: 404 }) }
  } else {
    const { data: student, error } = await admin
      .from('students')
      .select('user_id, teacher_id')
      .eq('user_id', userId)
      .eq('teacher_id', auth.user.id)
      .maybeSingle()
    if (error) return { ok: false as const, response: respondDbError('teacher:student-history:students-teacher', error) }
    if (!student) return { ok: false as const, response: NextResponse.json({ ok: false, error: 'student not found or not yours' }, { status: 403 }) }
  }

  return { ok: true as const, admin }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params
    const acesso = await verificarAcesso(req, userId)
    if (!acesso.ok) return acesso.response

    let corpo: unknown
    try {
      corpo = await req.json()
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
    }
    const parsed = QuerySchema.safeParse(corpo)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
    }
    const { exercicios, series } = parsed.data

    // As MESMAS 80 sessões que o app do aluno lê. Ler mais aqui faria o professor
    // ver um "última vez" que a tela do aluno não conhece.
    const { data: rows, error } = await acesso.admin
      .from('workouts')
      .select('id, notes, date, created_at')
      .eq('user_id', userId)
      .eq('is_template', false)
      .order('created_at', { ascending: false })
      .limit(REPORT_HISTORY_LIMIT)

    if (error) return respondDbError('teacher:student-history:workouts', error)

    const historico = buildReportHistoryFromWorkouts(rows ?? [])

    // Resumo: só os exercícios pedidos, só o watermark por série.
    const porExercicio: Record<string, Record<number, { weight: number | null; reps: number | null; rpe: number | null }>> = {}
    exercicios.forEach((nome, i) => {
      const chave = normalizeExerciseKey(String(nome || '').trim())
      if (!chave) return
      const entrada = historico.exercises?.[chave]
      if (!entrada) return
      // Sem a contagem, um teto conservador: o watermark é por índice de série,
      // e pedir mais índices do que o exercício tem só devolveria entradas que
      // ninguém lê. O cliente manda a contagem real.
      const quantas = Number.isInteger(series?.[i]) ? Number(series?.[i]) : 6
      const mapa = ultimaVezPorSerie(entrada.items, quantas)
      if (Object.keys(mapa).length > 0) porExercicio[nome] = mapa
    })

    return NextResponse.json({ ok: true, ultimaVez: porExercicio })
  } catch (e: unknown) {
    return respondInternalError('api:teacher:student-history:[userId]', e)
  }
}
