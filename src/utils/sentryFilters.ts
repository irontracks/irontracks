/**
 * @module sentryFilters
 *
 * Pure functions used by sentry.client.config.ts `beforeSend` to filter
 * out expected/non-actionable errors. Extracted for testability.
 */

/** Check if the error name from hint.originalException is a known noise error */
export function isNoiseByName(errName: string | null | undefined): boolean {
  return errName === 'AbortError'
}

/** Check if a Sentry exception value represents a known noise error */
export function isNoiseException(type: string | undefined, value: string | undefined): boolean {
  if (type === 'AbortError') return true
  if (typeof value === 'string' && value.includes('ResizeObserver loop')) return true
  // Instagram in-app WebView (Android) injeta navigation_performance_logger_android
  // que falha ao chamar Java objects já destruídos — não é bug do IronTracks
  if (typeof value === 'string' && value.includes('enableButtonsClickedMetaDataLogging')) return true
  if (typeof value === 'string' && value.includes('Java object is gone')) return true
  return false
}
