import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * trainingSchedule — A QUE HORAS este usuário treina, e se ele treina em jejum.
 *
 * O gerador de cardápio inventava os horários: mandou "Pós-Treino 18:30" para quem
 * treina às 6 da manhã (relatado pelo dono em 04/08/2026). O app JÁ TINHA a resposta
 * — duas vezes, aliás — e ninguém perguntava:
 *
 *   `workouts.completed_at`        → 12 sessões seguidas terminando entre 07:34 e 08:29
 *   `nutrition_meal_entries`       → o "Pós treino" que ele lança é 09:04, 09:19, 10:04
 *
 * E o jejum não precisa ser declarado: em 11 dos 12 últimos dias de treino ele não
 * registrou UMA refeição antes do treino terminar. Quem treina às 6 h e come às 9 h
 * treinou em jejum — o dado diz isso sozinho.
 *
 * Tudo em horário de São Paulo. O servidor roda em UTC e `completed_at` é timestamp
 * UTC; comparar hora crua erraria por 3 h e poria o café da manhã na madrugada. Ver
 * `utils/cron/dateBrt` para o mesmo problema no cron de streak.
 *
 * ⚠️ NÃO seleciona `workouts.notes`: a sessão inteira mora lá (centenas de KB por
 * linha). Só `completed_at` — mesma regra do `userSnapshot`.
 */

/** Fuso do app. Todos os usuários hoje são BR; se isso mudar, vira campo do perfil. */
const TZ = 'America/Sao_Paulo'

const HOUR_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** `en-CA` porque formata como ISO YYYY-MM-DD — mesmo truque do `dateBrt`. */
const DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Dia-calendário em São Paulo. `''` quando a data é inválida. */
export function spDayKey(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) return ''
  return DAY_FMT.format(date)
}

/** Horas decimais em São Paulo (7h50 → 7.83). `null` quando a data é inválida. */
export function spHoursOf(value: unknown): number | null {
  const date = value instanceof Date ? value : new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) return null
  const [h, m] = HOUR_FMT.format(date).split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h! + m! / 60
}

/** "07:50" a partir de horas decimais. */
export function formatHours(hours: number): string {
  const total = Math.round(hours * 60)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export type TrainingPeriod = 'madrugada' | 'manhã' | 'tarde' | 'noite'

export function periodOf(hours: number): TrainingPeriod {
  if (hours < 5) return 'madrugada'
  if (hours < 12) return 'manhã'
  if (hours < 18) return 'tarde'
  return 'noite'
}

export type TrainingSchedule = {
  /** Hora (decimal, SP) em que o treino TERMINA, pela mediana das sessões. */
  endHour: number
  /** Início estimado — ver `ASSUMED_SESSION_HOURS`. */
  startHour: number
  period: TrainingPeriod
  /** Ele come antes de treinar? Derivado dos lançamentos, não declarado. */
  fasted: boolean
  /** Quantas sessões sustentam a estimativa. */
  sampleSize: number
}

/**
 * Duração assumida da sessão. `workouts` não guarda o início (o `startedAt` vive
 * dentro de `notes`, que esta função se recusa a ler por causa do peso), e uma hora
 * é a duração típica de um treino de musculação. O número só afeta a janela do
 * PRÉ-treino; o pós-treino é ancorado no fim, que é medido.
 */
export const ASSUMED_SESSION_HOURS = 1

/** Abaixo disto não há padrão, só coincidência — melhor não inventar horário. */
export const MIN_SESSIONS = 4

/**
 * Margem antes do fim do treino em que uma refeição conta como "comeu antes".
 * Uma hora cobre a sessão inteira: quem lançou algo nesse intervalo não estava
 * em jejum. Fora dela (café às 5h21 num treino que terminou 8h02, caso real de
 * 24/07) conta como refeição pré-treino de verdade.
 */
const PRE_WORKOUT_WINDOW_HOURS = 3

/**
 * Deriva a rotina. Puro — `sessionEnds` e `mealTimes` são listas de instantes
 * (string/Date), já filtradas por usuário. Devolve `null` quando não há amostra
 * suficiente: sem dado, o prompt não deve afirmar horário nenhum.
 */
export function deriveTrainingSchedule(
  sessionEnds: unknown[],
  mealTimes: unknown[],
): TrainingSchedule | null {
  const sessions = (Array.isArray(sessionEnds) ? sessionEnds : [])
    .map((v) => ({ day: spDayKey(v), hour: spHoursOf(v) }))
    .filter((s): s is { day: string; hour: number } => s.hour !== null && s.day !== '')
  if (sessions.length < MIN_SESSIONS) return null

  const endHour = median(sessions.map((s) => s.hour))
  const startHour = Math.max(0, endHour - ASSUMED_SESSION_HOURS)

  /*
   * Jejum, dia a dia. Comparar as horas de refeição de TODOS os dias contra o fim de
   * CADA treino inverte o resultado: um único café às 5h21 (24/07, dia real em que
   * ele comeu antes) marcaria como "comeu antes" as 12 sessões, e o usuário que
   * treina em jejum receberia um pré-treino. O casamento é por dia-calendário.
   */
  const mealsByDay = new Map<string, number[]>()
  for (const value of Array.isArray(mealTimes) ? mealTimes : []) {
    const day = spDayKey(value)
    const hour = spHoursOf(value)
    if (!day || hour === null) continue
    mealsByDay.set(day, [...(mealsByDay.get(day) ?? []), hour])
  }

  const ateBefore = sessions.filter((s) =>
    (mealsByDay.get(s.day) ?? []).some((meal) => meal < s.hour && meal >= s.hour - PRE_WORKOUT_WINDOW_HOURS),
  ).length
  const fasted = ateBefore / sessions.length < 0.5

  return { endHour, startHour, period: periodOf(endHour), fasted, sampleSize: sessions.length }
}

/**
 * Frase pronta para o prompt do gerador. Vazia quando não há rotina conhecida —
 * silêncio é melhor que um horário inventado com cara de fato.
 */
export function trainingScheduleToPrompt(schedule: TrainingSchedule | null): string {
  if (!schedule) return ''
  const lines = [
    'ROTINA DE TREINO (medida no histórico deste usuário, não presuma outra):',
    `- Treina de ${schedule.period}, começando por volta das ${formatHours(schedule.startHour)} e terminando por volta das ${formatHours(schedule.endHour)}.`,
  ]
  if (schedule.fasted) {
    lines.push(
      '- Ele treina EM JEJUM: não registra refeição antes do treino.',
      `- NÃO crie refeição "Pré-Treino". A PRIMEIRA refeição do dia é o pós-treino, logo depois das ${formatHours(schedule.endHour)}.`,
    )
  } else {
    lines.push(
      `- Coloque o "Pré-Treino" entre ${formatHours(Math.max(0, schedule.startHour - 1.5))} e ${formatHours(schedule.startHour)}.`,
    )
  }
  lines.push(
    `- O "Pós-Treino" vai logo após o fim do treino (entre ${formatHours(schedule.endHour)} e ${formatHours(schedule.endHour + 2)}), NUNCA à tarde ou à noite.`,
    '- Os horários das outras refeições têm que fazer sentido em volta disso.',
  )
  return lines.join('\n')
}

const LOOKBACK_DAYS = 60
const MAX_ROWS = 200

/**
 * Lê a rotina do usuário. Resiliente: qualquer falha vira `null` (o prompt segue sem
 * o bloco de horário) em vez de derrubar a geração do cardápio.
 */
export async function buildTrainingSchedule(
  supabase: SupabaseClient,
  userId: string,
): Promise<TrainingSchedule | null> {
  const uid = String(userId || '').trim()
  if (!uid) return null

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
  try {
    // Em paralelo: o leitor de rotina não pode custar dois round-trips a quem o usa.
    const [sessions, meals] = await Promise.all([
      supabase
        .from('workouts')
        .select('completed_at')
        .eq('user_id', uid)
        .not('completed_at', 'is', null)
        .gte('completed_at', since)
        .order('completed_at', { ascending: false })
        .limit(MAX_ROWS),
      supabase
        .from('nutrition_meal_entries')
        .select('created_at')
        .eq('user_id', uid)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS),
    ])

    const ends = (Array.isArray(sessions.data) ? sessions.data : []).map(
      (r) => (r as Record<string, unknown>)?.completed_at,
    )
    const mealTimes = (Array.isArray(meals.data) ? meals.data : []).map(
      (r) => (r as Record<string, unknown>)?.created_at,
    )
    return deriveTrainingSchedule(ends, mealTimes)
  } catch {
    return null
  }
}
