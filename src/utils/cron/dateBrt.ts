/**
 * @module utils/cron/dateBrt
 *
 * Helpers for working with "today" (and recent days) from cron jobs that
 * decide whether a user trained today.
 *
 * Why this exists
 * ───────────────
 * Vercel crons run in UTC. `workouts.date` is stored as a UTC timestamp.
 * The user's "hoje" is São Paulo (BRT, UTC-3). When the streak-at-risk
 * cron fires at `0 0 * * *` (00:00 UTC = 21:00 BRT), `new Date().toISOString()`
 * is already the *next* UTC day. Comparing that key against a date prefix
 * pulled from a UTC timestamp produces false positives — the cron sends
 * "you didn't train today" to users who literally trained that afternoon.
 *
 * The fix is to ALWAYS bucket workout dates and "today" by the São Paulo
 * calendar day, never by the UTC calendar day.
 */

const SP_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Returns YYYY-MM-DD for the given moment as observed in São Paulo.
 * `en-CA` was picked specifically because it formats as ISO YYYY-MM-DD.
 */
export function brtDateKey(d: Date | string | number = new Date()): string {
  const date =
    typeof d === 'object' && d instanceof Date
      ? d
      : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return SP_FMT.format(date)
}

/**
 * Returns the BRT date key offset by `daysAgo` days from now (positive = past).
 * brtDateKeyDaysAgo(0) === brtDateKey() — today in BRT.
 * brtDateKeyDaysAgo(1) — yesterday in BRT.
 */
export function brtDateKeyDaysAgo(daysAgo: number): string {
  const ms = Date.now() - daysAgo * 24 * 60 * 60 * 1000
  return brtDateKey(new Date(ms))
}
