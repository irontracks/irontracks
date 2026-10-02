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
  // "Connection closed." nasce dentro do próprio runtime do Next.js
  // (react-server-dom-turbopack, função `close()`) quando um stream de React
  // Server Components é interrompido antes de terminar — troca de página,
  // perda de rede, app perdendo foco no meio do carregamento. Confirmado em
  // 26/09/2026: os dois eventos vistos vieram de um bot de teste (preview) e
  // de alguém saindo da página no meio do carregamento (produção) — nenhum
  // aponta pra bug do app. Decisão do dono, 26/09/2026.
  if (typeof value === 'string' && value.includes('Connection closed.')) return true
  return false
}
