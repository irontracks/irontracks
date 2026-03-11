/**
 * Shared utility: weekly credit reset window for São Paulo timezone.
 * Resets every Monday at 03:00 BRT (America/Sao_Paulo).
 *
 * Bug-safe: uses millisecond arithmetic to find the previous Monday
 * so we never do day-of-month subtraction that can yield day ≤ 0
 * at the start of a month (e.g. day 2 − 3 = -1).
 */

const TZ = 'America/Sao_Paulo'

/** Returns {year, month, day, weekdayIndex} (Mon=1 … Sun=0) in São Paulo time */
function toTzParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const map = parts.reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value
    return acc
  }, {})
  const weekday = String(map.weekday || '').toLowerCase()
  const weekdayIndex =
    weekday === 'mon' ? 1
    : weekday === 'tue' ? 2
    : weekday === 'wed' ? 3
    : weekday === 'thu' ? 4
    : weekday === 'fri' ? 5
    : weekday === 'sat' ? 6
    : 0 // sun
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekdayIndex,
  }
}

/** Converts a SP local date/time to UTC by computing the TZ offset at that instant */
function tzDateToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const tzDate = new Date(utcGuess.toLocaleString('en-US', { timeZone: TZ }))
  const offset = utcGuess.getTime() - tzDate.getTime()
  return new Date(utcGuess.getTime() + offset)
}

/**
 * Returns the start of the current credit week as a UTC Date.
 * The week starts on Monday at 03:00 BRT (América/São_Paulo).
 *
 * Uses ms arithmetic to step back N days from "now" to find the
 * right Monday — avoids day-of-month underflow at month boundaries.
 */
export function getWeeklyResetStart(now: Date = new Date()): Date {
  const parts = toTzParts(now)

  // daysSinceMonday: Mon=0, Tue=1, …, Sun=6
  const daysSinceMonday = parts.weekdayIndex === 0 ? 6 : parts.weekdayIndex - 1

  // Step back to Monday (midnight UTC — we only need the calendar date)
  const mondayApprox = new Date(now.getTime() - daysSinceMonday * 86_400_000)
  const mondayParts = toTzParts(mondayApprox)

  // Build the reset timestamp: Monday 03:00 BRT of that week
  const weekStart = tzDateToUtc(
    mondayParts.year, mondayParts.month, mondayParts.day,
    3, 0, 0,
  )

  // Edge-case: if we're on Monday but before 03:00 BRT, step back 7 days
  if (now.getTime() < weekStart.getTime()) {
    return new Date(weekStart.getTime() - 7 * 86_400_000)
  }

  return weekStart
}
