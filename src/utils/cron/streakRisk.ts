/**
 * @module utils/cron/streakRisk
 *
 * Decide se o push "Sua sequência está em risco 🔥" deve disparar.
 *
 * Sintoma corrigido (jul/2026)
 * ────────────────────────────
 * Quem treina 5x/semana recebia o alerta EXATAMENTE no dia de descanso
 * planejado. Causa: o único critério era "não treinou hoje + ≥3 dias de
 * CALENDÁRIO consecutivos" — regra que só faz sentido para quem treina
 * 7/7. Todo praticante com folga programada era cobrado por descansar.
 *
 * Regra atual, em ordem de prioridade:
 *   1. Meta declarada (`preferences.trainingFrequencyPerWeek`, 1–7);
 *   2. Cadência inferida das 4 semanas anteriores (metade da base nunca
 *      preencheu a meta no perfil);
 *   3. Só então o critério antigo de dias consecutivos.
 * Com meta (declarada ou inferida), o alerta só sai quando a semana ainda
 * pode ser salva E hoje é indispensável para isso.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Mínimo de dias consecutivos para alertar quando não há meta semanal. */
export const MIN_CONSECUTIVE_STREAK = 3

/** Soma (ou subtrai) dias de uma chave YYYY-MM-DD, sem depender do fuso local. */
export function addDaysToKey(key: string, delta: number): string {
  const [y, m, d] = String(key).split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(Date.UTC(y, m - 1, d) + delta * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Índice do dia da semana com DOMINGO = 0 — a semana do app.
 *
 * Era segunda=0, "mesma convenção da meta semanal". A meta semanal virou
 * domingo→sábado em 24/08/2026 e esta função não acompanhou: o cálculo de
 * "dias restantes" ficava deslocado em um dia, e é ele que decide se o app
 * cobra o treino de hoje ("só alerta quando hoje é indispensável").
 */
export function weekdayIndexSundayFirst(key: string): number {
  const [y, m, d] = String(key).split('-').map(Number)
  if (!y || !m || !d) return -1
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** As 7 chaves da semana (domingo → sábado) que contém `key`. */
export function weekKeysFor(key: string): string[] {
  const idx = weekdayIndexSundayFirst(key)
  if (idx < 0) return []
  const domingo = addDaysToKey(key, -idx)
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(domingo, i))
}

/** Semanas completas anteriores usadas para inferir a cadência real. */
export const INFERENCE_WEEKS = 4

/**
 * Estima a frequência semanal a partir do histórico, para quem NÃO declarou
 * `trainingFrequencyPerWeek` no perfil (metade da base em jul/2026, o dono
 * incluído). Sem isso, esses usuários continuariam caindo na regra de dias
 * consecutivos — ou seja, seguiriam sendo cobrados no dia de descanso.
 *
 * Usa as 4 semanas completas ANTES da semana corrente (a semana em curso
 * está pela metade e enviesaria para baixo) e arredonda PARA BAIXO: em caso
 * de dúvida, alertar de menos é melhor que alertar de mais.
 */
export function inferWeeklyTarget(trainedDates: Set<string>, todayKey: string): number | null {
  const week = weekKeysFor(todayKey)
  if (!week.length) return null
  const lastMonday = week[0]
  let trained = 0
  for (let i = 1; i <= INFERENCE_WEEKS * 7; i += 1) {
    if (trainedDates.has(addDaysToKey(lastMonday, -i))) trained += 1
  }
  // Histórico raso não sustenta inferência.
  if (trained < INFERENCE_WEEKS) return null
  return Math.max(1, Math.min(7, Math.floor(trained / INFERENCE_WEEKS)))
}

export type StreakRiskInput = {
  /** Dias (BRT, YYYY-MM-DD) em que o usuário treinou. */
  trainedDates: Set<string>
  /** Hoje em BRT (YYYY-MM-DD). */
  todayKey: string
  /** `preferences.trainingFrequencyPerWeek` — null/0 quando não declarada. */
  weeklyTarget: number | null | undefined
}

export function shouldNotifyStreakAtRisk({ trainedDates, todayKey, weeklyTarget }: StreakRiskInput): boolean {
  if (!todayKey) return false
  // Já treinou hoje: não há risco algum.
  if (trainedDates.has(todayKey)) return false

  const declared = Math.max(0, Math.min(7, Number(weeklyTarget) || 0))
  // Meta declarada manda; sem ela, a cadência real do histórico.
  const target = declared > 0 ? declared : (inferWeeklyTarget(trainedDates, todayKey) ?? 0)

  if (target > 0) {
    const week = weekKeysFor(todayKey)
    if (!week.length) return false
    const done = week.filter((k) => trainedDates.has(k)).length
    // Meta já batida nesta semana → o descanso é merecido, silêncio.
    if (done >= target) return false

    const missing = target - done
    // Dias restantes na semana, hoje incluído.
    const remaining = 7 - weekdayIndexSundayFirst(todayKey)
    // Só alerta quando hoje é indispensável para ainda bater a meta.
    // `missing > remaining` = semana já perdida; cobrar não ajuda ninguém.
    return missing === remaining
  }

  // Sem meta declarada e sem histórico suficiente para inferir:
  // comportamento original — dias consecutivos.
  let streak = 0
  let daysAgo = 1
  while (streak < 365) {
    const key = addDaysToKey(todayKey, -daysAgo)
    if (!key || !trainedDates.has(key)) break
    streak += 1
    daysAgo += 1
  }
  return streak >= MIN_CONSECUTIVE_STREAK
}
