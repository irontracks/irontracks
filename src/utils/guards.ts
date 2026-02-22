export const safeRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

export const safeArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export const safeString = (v: unknown): string => String(v ?? '').trim()
