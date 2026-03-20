/**
 * Returns the user's timezone from the browser.
 * Falls back to 'America/Sao_Paulo' if unavailable.
 */
export function getUserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz || 'America/Sao_Paulo'
  } catch {
    return 'America/Sao_Paulo'
  }
}

/**
 * Returns today's date string (YYYY-MM-DD) in the user's timezone.
 */
export function getTodayDateKey(tz?: string): string {
  const timezone = tz || getUserTimezone()
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}
