/**
 * buildPostCheckinRow — mapeia o check-out (pós-treino) para uma linha estruturada
 * de `workout_checkins` (kind='post'), pré-requisito #2 do motor de auto-carga.
 *
 * Hoje o RPE/satisfação/dor da SESSÃO vivem só embutidos no JSON de `workouts.notes`
 * (`session.postCheckin`), o que impede consulta longitudinal barata ("RPE médio das
 * últimas 4 sessões"). Esta função gera a linha que o finish route grava também em
 * `workout_checkins`, espelhando o que o pré-treino já faz.
 *
 * Função PURA e defensiva de propósito: o "quando" gravar (pular replays idempotentes,
 * não quebrar a finalização) fica no route; o "o quê" gravar fica aqui, testável isolado.
 *
 * Shape de entrada real (Modals.tsx → postCheckinDraft): { rpe, satisfaction, soreness, notes }
 * como strings, ou null se o usuário pulou. Também aceita o wrapper `{ answers: {...} }`
 * por robustez (o story composer já lê os dois formatos).
 */

export interface PostCheckinRow {
  user_id: string
  kind: 'post'
  workout_id: string
  soreness: number | null
  notes: string | null
  answers: Record<string, number>
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Parseia um número de treino (aceita vírgula decimal), clampa ao [min,max] e arredonda. */
const parseClampedInt = (v: unknown, min: number, max: number): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * Constrói a linha de check-out para `workout_checkins`, ou `null` quando não há nada
 * substantivo a gravar (usuário pulou o check-out, ou faltam ids válidos) — evita linha fantasma.
 */
export function buildPostCheckinRow(
  postCheckin: unknown,
  opts: { userId: string; workoutId: string },
): PostCheckinRow | null {
  const userId = String(opts?.userId ?? '').trim()
  const workoutId = String(opts?.workoutId ?? '').trim()
  if (!userId || !workoutId) return null
  if (!isObject(postCheckin)) return null

  // Aceita tanto o shape plano quanto o aninhado em `answers`.
  const nested = isObject(postCheckin.answers) ? postCheckin.answers : {}
  const pick = (key: string): unknown => postCheckin[key] ?? nested[key]

  const rpe = parseClampedInt(pick('rpe'), 0, 10)
  const satisfaction = parseClampedInt(pick('satisfaction'), 0, 5)
  const soreness = parseClampedInt(pick('soreness'), 0, 10)

  const notesRaw = pick('notes')
  const notes = typeof notesRaw === 'string' && notesRaw.trim().length > 0 ? notesRaw.trim() : null

  // Nada informado (pulou tudo) → não grava linha vazia.
  if (rpe === null && satisfaction === null && soreness === null && notes === null) return null

  const answers: Record<string, number> = {}
  if (rpe !== null) answers.rpe = rpe
  if (satisfaction !== null) answers.satisfaction = satisfaction
  if (soreness !== null) answers.soreness = soreness

  return {
    user_id: userId,
    kind: 'post',
    workout_id: workoutId,
    soreness,
    notes,
    answers,
  }
}
