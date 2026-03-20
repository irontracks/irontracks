/**
 * @module nutrition-date
 * Timezone-aware date utilities for the IronTracks Nutrition module.
 *
 * The app is targeted at Brazilian users (São Paulo, BRT = UTC-3).
 * All nutrition "day" boundaries must use America/Sao_Paulo so that
 * midnight in Brazil correctly resets the daily log — even when the
 * Next.js server is running on Vercel (UTC).
 */

const TZ = 'America/Sao_Paulo'

/**
 * Returns today's date as `YYYY-MM-DD` in the America/Sao_Paulo timezone.
 * Safe to call from both server-side (Next.js RSC / Server Actions) and
 * client-side code.
 */
export function todayInSaoPaulo(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
    // Fallback: extremely unlikely but defensive
    return new Date().toISOString().slice(0, 10)
  }
}

/**
 * Validates that a string is a valid ISO date `YYYY-MM-DD`, then returns it.
 * Falls back to todayInSaoPaulo() if the value is missing or malformed.
 */
export function resolveDate(dateKey: string | null | undefined): string {
  const s = typeof dateKey === 'string' ? dateKey.trim() : ''
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return todayInSaoPaulo()
}
