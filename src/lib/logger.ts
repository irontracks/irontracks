export function logInfo(context: string, message: string, extra?: unknown) {
  const ts = new Date().toISOString()
  console.log(`[INFO ${ts}] ${context}: ${message}`, extra ?? '')
}

export function logError(context: string, error: unknown, extra?: unknown) {
  const ts = new Date().toISOString()
  const msg = (error as Error)?.message ?? String(error)
  console.error(`[ERROR ${ts}] ${context}: ${msg}`, extra ?? error)
}

