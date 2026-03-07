export type ErrorClassification = {
  severity: 'fatal' | 'error' | 'warn'
  category: 'chunk' | 'network' | 'timeout' | 'rate_limit' | 'auth' | 'unknown'
}

export const hashString = (v: string) => {
  let h = 0
  for (let i = 0; i < v.length; i += 1) {
    h = (h << 5) - h + v.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(16)
}

export const classifyError = (message: string, source: string): ErrorClassification => {
  const lower = String(message || '').toLowerCase()
  let category: ErrorClassification['category'] = 'unknown'
  if (
    lower.includes('chunkloaderror') ||
    lower.includes('loading chunk') ||
    lower.includes('failed to fetch dynamically imported module') ||
    lower.includes('importing a module script failed')
  ) {
    category = 'chunk'
  } else if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    (lower.includes('fetch') && lower.includes('error'))
  ) {
    category = 'network'
  } else if (lower.includes('timeout')) {
    category = 'timeout'
  } else if (
    lower.includes('rate limit') ||
    lower.includes('rate_limited') ||
    lower.includes('too many requests')
  ) {
    category = 'rate_limit'
  } else if (
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('permission')
  ) {
    category = 'auth'
  }

  let severity: ErrorClassification['severity'] = 'error'
  if (source.includes('errorboundary') || category === 'chunk') {
    severity = 'fatal'
  } else if (category === 'network' || category === 'timeout' || category === 'rate_limit') {
    severity = 'warn'
  }

  return { severity, category }
}
