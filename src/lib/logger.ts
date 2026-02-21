/**
 * Logger centralizado — suprime logs em produção para não vazar dados sensíveis.
 * Use logInfo/logWarn/logError em vez de console.log direto.
 */

const IS_PROD = process.env.NODE_ENV === 'production'

export function logInfo(context: string, message: string, extra?: unknown) {
  if (IS_PROD) return
  const ts = new Date().toISOString()
  console.log(`[INFO ${ts}] ${context}: ${message}`, extra ?? '')
}

export function logWarn(context: string, message: string, extra?: unknown) {
  if (IS_PROD) return
  const ts = new Date().toISOString()
  console.warn(`[WARN ${ts}] ${context}: ${message}`, extra ?? '')
}

export function logError(context: string, error: unknown, extra?: unknown) {
  // Erros sempre logados — essenciais para debugging em prod
  const ts = new Date().toISOString()
  const msg = (error instanceof Error) ? error.message : String(error)
  console.error(`[ERROR ${ts}] ${context}: ${msg}`, extra ?? error)
}

export function logDebug(context: string, message: string, extra?: unknown) {
  if (IS_PROD) return
  const ts = new Date().toISOString()
  console.log(`[DEBUG ${ts}] ${context}: ${message}`, extra ?? '')
}
