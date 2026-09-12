import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { respondDbError } from '@/utils/api/dbError'
import { respondInternalError } from '@/utils/api/internalError'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * GET /api/workouts/exercise-chat-summaries?workoutId=…
 *
 * Os resumos que a IA escreveu no chat de cada exercício DAQUELE treino. As
 * linhas nascem durante a sessão sem `workout_id` (o treino ainda não existe) e
 * são carimbadas na finalização — por isso a consulta é pelo treino.
 *
 * ⚠️ **Só o DONO lê.** A conversa é do aluno e nem professor nem admin a
 * alcançam: `exercise_chat_summaries` é uma das duas únicas tabelas do treino
 * sem policy de coach, por requisito explícito do dono. Daí esta rota usar o
 * cliente AUTENTICADO e nunca o service-role — a fronteira é a RLS, não um
 * `if` que alguém possa reescrever aqui.
 * ────────────────────────────────────────────────────────── */

/** Teto de leitura: são no máximo ~um resumo por exercício da sessão. */
const LIMITE_DE_RESUMOS = 40

export async function GET(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const userId = String(auth.user.id)
  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`exercise-chat-summaries:${userId}:${ip}`, 60, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  try {
    const url = new URL(req.url)
    const workoutId = String(url.searchParams.get('workoutId') || '').trim()
    // Relatório de sessão não gravada (id ausente) devolve vazio — não é erro,
    // e a tela precisa distinguir "não tem" de "falhou" para não desenhar nada.
    if (!/^[0-9a-f-]{36}$/i.test(workoutId)) return NextResponse.json({ ok: true, items: [] })

    const { data, error } = await auth.supabase
      .from('exercise_chat_summaries')
      .select('exercise_index, exercise_name, summary, created_at')
      .eq('workout_id', workoutId)
      .eq('user_id', userId)
      .order('exercise_index', { ascending: true })
      .limit(LIMITE_DE_RESUMOS)
    if (error) return respondDbError('api:workouts:exercise-chat-summaries', error)

    const items = (Array.isArray(data) ? data : []).map((r) => ({
      exerciseIndex: r.exercise_index,
      exerciseName: r.exercise_name,
      summary: r.summary,
      createdAt: r.created_at,
    }))
    return NextResponse.json(
      { ok: true, items },
      { headers: { 'cache-control': 'no-store, max-age=0' } },
    )
  } catch (e: unknown) {
    return respondInternalError('api:workouts:exercise-chat-summaries', e)
  }
}
