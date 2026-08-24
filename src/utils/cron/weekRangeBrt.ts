/**
 * @module weekRangeBrt
 *
 * A SEMANA do app: **domingo → sábado**, no calendário de São Paulo.
 *
 * ── Por que domingo (decisão do dono, 24/08/2026) ────────────────────────
 * A Fran treinou domingo, segunda, terça, quarta, quinta e sexta — seis
 * treinos — e o resumo disse cinco: o app fechava a semana segunda→domingo
 * (ISO), então o domingo dela caía na semana anterior. A decisão foi alinhar o
 * app ao calendário que as pessoas usam aqui: *"é só contar o domingo como
 * início da semana; quem não treina fim de semana conta de segunda a sexta"*.
 * A agenda (`ScheduleClient`) já começava no domingo — o resto do app é que
 * estava fora de linha.
 *
 * ── Por que BRT ──────────────────────────────────────────────────────────
 * A Vercel roda em UTC. Comparar `workouts.date` com `'2026-08-23'` cru faria a
 * semana virar às 21h de sábado no Brasil, e todo treino de sábado à noite
 * cairia na semana seguinte. Mesma classe já medida no streak (36 de 633
 * sessões em dia divergente) e no heatmap de nutrição.
 *
 * ⚠️ **Transição de dados:** `muscle_weekly_summaries.week_start_date` guarda
 * segundas nas semanas anteriores a 24/08/2026 e domingos daí em diante. Nada
 * foi apagado — é cache recalculável —, e a rota que lê "a semana mais
 * recente" ignora chave no futuro para não pescar uma segunda órfã.
 */
import { brtDateKey } from '@/utils/cron/dateBrt'

/** São Paulo é UTC−3 o ano todo desde 2019 (fim do horário de verão). */
const BRT_OFFSET_HOURS = 3
const DAY_MS = 24 * 60 * 60 * 1000

/** `YYYY-MM-DD` (dia BRT) → instante UTC da meia-noite daquele dia em BRT. */
export function brtDayStartUtc(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map((x) => Number(x))
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, BRT_OFFSET_HOURS, 0, 0, 0))
}

/** Dia da semana (0=domingo) do dia-calendário BRT — nunca lido do UTC. */
function dowOfBrtDay(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map((x) => Number(x))
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay()
}

export type WeekRangeBrt = {
  /** Início (inclusivo) em ISO UTC — domingo 00:00 BRT. */
  startIso: string
  /** Fim (EXCLUSIVO) em ISO UTC — domingo seguinte 00:00 BRT. */
  endIso: string
  /** Dia BRT do domingo que abre a semana, `YYYY-MM-DD`. */
  startDay: string
  /** Dia BRT do sábado que fecha a semana, `YYYY-MM-DD`. */
  endDay: string
}

const rangeFromStartDay = (startDay: string): WeekRangeBrt => {
  const start = brtDayStartUtc(startDay)
  const endMs = start.getTime() + 7 * DAY_MS
  return {
    startIso: start.toISOString(),
    endIso: new Date(endMs).toISOString(),
    startDay,
    endDay: brtDateKey(new Date(endMs - DAY_MS)),
  }
}

/** O domingo que abre a semana do instante dado (dia BRT, `YYYY-MM-DD`). */
export function weekStartDayBrt(now: Date = new Date()): string {
  const todayKey = brtDateKey(now)
  const dow = dowOfBrtDay(todayKey)
  return brtDateKey(new Date(brtDayStartUtc(todayKey).getTime() - dow * DAY_MS))
}

/** A semana (domingo→sábado) que contém o instante dado. */
export function currentWeekRangeBrt(now: Date = new Date()): WeekRangeBrt {
  return rangeFromStartDay(weekStartDayBrt(now))
}

/** A semana (domingo→sábado) ANTERIOR à do instante dado. */
export function previousWeekRangeBrt(now: Date = new Date()): WeekRangeBrt {
  const current = brtDayStartUtc(weekStartDayBrt(now))
  return rangeFromStartDay(brtDateKey(new Date(current.getTime() - 7 * DAY_MS)))
}

/** A semana (domingo→sábado) que contém um dia BRT `YYYY-MM-DD` qualquer. */
export function weekRangeOfDayBrt(dayKey: string): WeekRangeBrt {
  const dow = dowOfBrtDay(dayKey)
  return rangeFromStartDay(brtDateKey(new Date(brtDayStartUtc(dayKey).getTime() - dow * DAY_MS)))
}
