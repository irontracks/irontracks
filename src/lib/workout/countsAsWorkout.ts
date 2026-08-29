/**
 * @module countsAsWorkout
 *
 * O que conta como "um treino" numa contagem mostrada ao usuário.
 *
 * Nasceu de duas queixas no mesmo dia (24/08/2026), sobre o push "Resumo da
 * semana 📊":
 *
 *  - o dono recebeu **"Você fez 7 treinos"** tendo treinado 5 (seg a sex);
 *  - a Fran recebeu **5** tendo treinado 6 na cabeça dela.
 *
 * As duas causas são diferentes, e só a primeira é bug:
 *
 * **1. Sessão-lixo contava como treino.** O cron somava LINHAS de `workouts`,
 * sem olhar o que havia dentro. As duas linhas a mais do dono eram uma sessão
 * de **62 s com 1 série** (quarta, duplicata do treino que ele já tinha feito
 * de manhã) e outra de **11 min com 1 série** (sábado 00:37). Nenhuma é treino.
 *
 * **2. A semana do app é segunda→domingo.** O "domingo" da Fran foi 16/08 —
 * domingo ANTERIOR, que pertence à semana 10–16 (onde ela contou 6, correto).
 * Nada se perdeu; é a definição da semana, e mudá-la é decisão de produto.
 *
 * ── O corte, medido antes de escolher ────────────────────────────────────
 * 120 dias de produção, sessões concluídas com poucas séries:
 *
 *   0 séries →  7 sessões, todas ≤ 2 min
 *   1 série  →  5 sessões, média 4,2 min, máximo 11 min
 *   2 séries →  ZERO
 *   3 séries →  2 sessões (4 e 50 min)
 *
 * Ou seja: **não existe sessão legítima com 1 ou 2 séries**. O piso de 2 séries
 * concluídas descarta as 12 sessões-lixo sem tocar em nenhum treino real.
 *
 * A exceção é o CARDIO: uma corrida de 40 min é UMA série concluída, e cortá-la
 * seria apagar treino de verdade. Daí a segunda porta — série única, mas sessão
 * longa. Nenhuma das sessões-lixo medidas passa dos 11 min, então 15 min separa
 * os dois mundos com folga.
 */

/** Piso de séries concluídas. Abaixo disso não é treino — é sessão aberta sem querer. */
export const MIN_DONE_SETS = 2
/**
 * Minutos que redimem uma sessão de UMA série. Existe pelo cardio/prancha, em
 * que o exercício inteiro é um único log. O maior lixo medido tem 11 min.
 */
export const MIN_MINUTES_SINGLE_SET = 15

export type WorkoutSessionLike = {
  /** Segundos de duração (o `totalTime` do JSON da sessão). */
  totalTime?: unknown
  /** Mapa `"exIdx-setIdx"` → log da série. */
  logs?: unknown
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null

/** Aceita o JSON já parseado ou o TEXT cru de `workouts.notes`. */
export function parseSessionNotes(notes: unknown): WorkoutSessionLike | null {
  if (typeof notes === 'string') {
    try {
      return asRecord(JSON.parse(notes)) as WorkoutSessionLike | null
    } catch {
      return null
    }
  }
  return asRecord(notes) as WorkoutSessionLike | null
}

/**
 * Séries efetivamente CONCLUÍDAS. Log preenchido sem `done` não conta — é
 * exatamente o caso da sessão duplicada, que trazia 30 logs herdados do
 * template e só 1 marcado.
 */
export function countDoneSets(session: WorkoutSessionLike | null): number {
  const logs = asRecord(session?.logs)
  if (!logs) return 0
  let done = 0
  for (const value of Object.values(logs)) {
    const log = asRecord(value)
    if (log?.done === true) done += 1
  }
  return done
}

/** Decide se a sessão entra numa contagem de treinos mostrada ao usuário. */
export function countsAsWorkout(notes: unknown): boolean {
  const session = parseSessionNotes(notes)
  if (!session) return false
  const done = countDoneSets(session)
  if (done >= MIN_DONE_SETS) return true
  if (done < 1) return false
  const seconds = Number(session.totalTime)
  if (!Number.isFinite(seconds) || seconds <= 0) return false
  return seconds >= MIN_MINUTES_SINGLE_SET * 60
}

/**
 * O mesmo critério, decidido a partir do RESUMO da sessão.
 *
 * O histórico do próprio usuário recebe linha MAGRA (`slimHistoryRow`): sem
 * `notes`, para a rota não servir centenas de KB. Sem esta porta, a tela teria
 * duas opções ruins — contar linha crua (foi o bug: uma sessão de 44 s virava
 * "treino" no resumo que o usuário lê) ou voltar a baixar a sessão inteira só
 * para decidir um booleano.
 *
 * A REGRA é a mesma de `countsAsWorkout`, e é por isso que ela mora aqui: duas
 * cópias divergem no dia em que o piso mudar, e aí o app volta a mostrar dois
 * números para a mesma pergunta.
 */
export function countsAsWorkoutFromSummary(resumo: {
  doneSets: unknown
  totalTimeSeconds: unknown
}): boolean {
  const done = Number(resumo?.doneSets)
  if (!Number.isFinite(done) || done < 1) return false
  if (done >= MIN_DONE_SETS) return true
  const seconds = Number(resumo?.totalTimeSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return false
  return seconds >= MIN_MINUTES_SINGLE_SET * 60
}
