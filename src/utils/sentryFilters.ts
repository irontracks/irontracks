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
  return false
}
