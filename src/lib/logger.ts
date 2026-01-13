export function logInfo(context: string, message: string, extra?: any) {
  const ts = new Date().toISOString()
  console.log(`[INFO ${ts}] ${context}: ${message}`, extra ?? '')
}

export function logError(context: string, error: any, extra?: any) {
  const ts = new Date().toISOString()
  const msg = error?.message ?? String(error)
  console.error(`[ERROR ${ts}] ${context}: ${msg}`, extra ?? error)
}

