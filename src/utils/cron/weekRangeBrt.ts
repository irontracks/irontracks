/**
 * @module weekRangeBrt
 *
 * Fronteira da SEMANA no calendário de São Paulo, para os crons semanais.
 *
 * A Vercel roda em UTC. Comparar `workouts.date` com `'2026-08-17'` cru é
 * fronteira UTC: a semana começaria **domingo 21:00 BRT**, e todo treino de
 * domingo à noite cairia na semana seguinte. É a mesma classe que já mordeu o
 * heatmap de nutrição (`lib/nutrition/correlationDays.ts`) e o streak
 * (`lib/social/streak.ts`), medida lá em **36 de 633 sessões**.
 *
 * A semana continua **segunda→domingo** (ISO). Isso é decisão de produto, não
 * bug: a Fran contou o domingo ANTERIOR ao intervalo (16/08) como parte da
 * semana dela, e ele pertence à semana 10–16 — onde foi contado.
 */
import { brtDateKey } from '@/utils/cron/dateBrt'

/** São Paulo é UTC−3 o ano todo desde 2019 (fim do horário de verão). */
const BRT_OFFSET_HOURS = 3

/** `YYYY-MM-DD` (dia BRT) → instante UTC da meia-noite daquele dia em BRT. */
export function brtDayStartUtc(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map((x) => Number(x))
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, BRT_OFFSET_HOURS, 0, 0, 0))
}

export type WeekRangeBrt = {
  /** Início (inclusivo) em ISO UTC — segunda 00:00 BRT. */
  startIso: string
  /** Fim (EXCLUSIVO) em ISO UTC — segunda seguinte 00:00 BRT. */
  endIso: string
  /** Dia BRT da segunda-feira, `YYYY-MM-DD`. */
  startDay: string
  /** Dia BRT do domingo, `YYYY-MM-DD`. */
  endDay: string
}

/** A semana ISO (segunda→domingo) ANTERIOR à do instante dado, em dias BRT. */
export function previousWeekRangeBrt(now: Date = new Date()): WeekRangeBrt {
  const todayKey = brtDateKey(now)
  const todayStart = brtDayStartUtc(todayKey)
  // Dia da semana do dia BRT — lido do próprio dia-calendário, nunca do UTC.
  const [y, m, d] = todayKey.split('-').map((x) => Number(x))
  const dow = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay() // 0=dom
  const daysSinceLastMonday = ((dow + 6) % 7) + 7

  const startMs = todayStart.getTime() - daysSinceLastMonday * 24 * 60 * 60 * 1000
  const endMs = startMs + 7 * 24 * 60 * 60 * 1000
  const start = new Date(startMs)
  const end = new Date(endMs)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDay: brtDateKey(start),
    // O último DIA da semana é o domingo — `end` já é a segunda seguinte.
    endDay: brtDateKey(new Date(endMs - 24 * 60 * 60 * 1000)),
  }
}
