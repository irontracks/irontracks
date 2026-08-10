/**
 * Monta os 30 dias do heatmap Treino × Nutrição.
 *
 * Função pura, separada da rota, porque o miolo dela é uma armadilha de fuso:
 * `workouts.date` é timestamp UTC e o usuário treina em São Paulo. A versão
 * anterior fazia `new Date(ts).toISOString().slice(0, 10)` — o dia UTC —, então
 * QUALQUER treino depois das 21h BRT caía na célula do dia seguinte, e o próprio
 * "hoje" da grade virava amanhã depois desse horário. O erro é invisível na
 * revisão de código e óbvio para quem treina à noite: o quadrado acende no dia
 * errado. Mesma regra do resto do app: o dia é sempre o calendário de BRT.
 *
 * `daily_nutrition_logs.date` já é um dia-calendário ('YYYY-MM-DD'), não um
 * instante — esse é cortado, nunca reinterpretado como timestamp.
 */
import { brtDateKey } from '@/utils/cron/dateBrt'

export interface CorrelationDay {
  date: string
  weekday: number
  had_workout: boolean
  had_nutrition: boolean
  nutrition_calories: number
}

export interface CorrelationStats {
  workoutDays: number
  nutritionDays: number
  bothDays: number
  workoutWithoutNutrition: number
  correlationPct: number
}

export const CORRELATION_WINDOW_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/** Dia da semana do dia-calendário, sem deixar o fuso do servidor opinar. */
const weekdayOf = (dayKey: string): number => {
  const d = new Date(`${dayKey}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? 0 : d.getUTCDay()
}

export function buildCorrelationDays(
  workoutTimestamps: readonly string[],
  nutritionRows: readonly { date?: string | null; calories?: unknown }[],
  nowMs: number,
): { days: CorrelationDay[]; stats: CorrelationStats } {
  const treinouEm = new Set<string>()
  for (const ts of workoutTimestamps) {
    const key = brtDateKey(String(ts || ''))
    if (key) treinouEm.add(key)
  }

  const comeuEm = new Map<string, number>()
  for (const row of nutritionRows) {
    const key = String(row?.date ?? '').slice(0, 10)
    if (!key) continue
    comeuEm.set(key, Number(row?.calories) || 0)
  }

  const days: CorrelationDay[] = []
  for (let i = CORRELATION_WINDOW_DAYS - 1; i >= 0; i--) {
    const key = brtDateKey(new Date(nowMs - i * DAY_MS))
    days.push({
      date: key,
      weekday: weekdayOf(key),
      had_workout: treinouEm.has(key),
      had_nutrition: comeuEm.has(key),
      nutrition_calories: comeuEm.get(key) || 0,
    })
  }

  const workoutDays = days.filter((d) => d.had_workout).length
  const nutritionDays = days.filter((d) => d.had_nutrition).length
  const bothDays = days.filter((d) => d.had_workout && d.had_nutrition).length

  return {
    days,
    stats: {
      workoutDays,
      nutritionDays,
      bothDays,
      workoutWithoutNutrition: days.filter((d) => d.had_workout && !d.had_nutrition).length,
      correlationPct: workoutDays > 0 ? Math.round((bothDays / workoutDays) * 100) : 0,
    },
  }
}
