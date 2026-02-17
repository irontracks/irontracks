type UnknownRecord = Record<string, unknown>

const normalizeSpaces = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim()

const normalizeDash = (value: unknown): string => {
  const s = normalizeSpaces(value)
  if (!s) return ''
  return s.replace(/[–—−]/g, '-')
}

const extractLeadingLetter = (raw: unknown): { letter: string; rest: string } => {
  const s = normalizeDash(raw).toLowerCase()
  if (!s) return { letter: '', rest: '' }

  const m1 = s.match(/^treino\s*\(?\s*([a-z])\s*\)?\s*[-:–—]?\s*(.*)$/i)
  if (m1?.[1]) return { letter: String(m1[1]).toUpperCase(), rest: normalizeSpaces(m1[2] || '') }

  const m2 = s.match(/^\(?\s*([a-z])\s*\)?\s*[-:–—]\s*(.*)$/i)
  if (m2?.[1]) return { letter: String(m2[1]).toUpperCase(), rest: normalizeSpaces(m2[2] || '') }

  const m3 = s.match(/^\(?\s*([a-z])\s*\)?\s+(.*)$/i)
  if (m3?.[1] && m3?.[2]) return { letter: String(m3[1]).toUpperCase(), rest: normalizeSpaces(m3[2] || '') }

  return { letter: '', rest: normalizeSpaces(raw) }
}

export const normalizeWorkoutTitle = (value: unknown): string => {
  const raw = String(value || '')
  if (!raw.trim()) return ''

  const { letter, rest } = extractLeadingLetter(raw)
  if (!letter) return normalizeSpaces(normalizeDash(raw))

  if (!rest) return letter
  return `${letter} - ${rest}`
}

export const workoutTitleKey = (value: unknown): string => {
  const raw = String(value || '')
  if (!raw.trim()) return ''

  const { rest } = extractLeadingLetter(raw)
  const normalized = normalizeDash(rest)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized
}

const stripTrailingDayHint = (value: unknown): string => {
  const s = normalizeDash(value)
  if (!s) return ''
  return normalizeSpaces(
    s
      .replace(/\(\s*dia\s*\d+\s*\)/gi, '')
      .replace(/\(\s*(segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)\s*\)/gi, '')
      .trim(),
  )
}

export const formatProgramWorkoutTitle = (draftTitle: unknown, index: unknown, options: unknown): string => {
  const idx = Number(index)
  const safeIndex = Number.isFinite(idx) && idx >= 0 ? Math.floor(idx) : 0
  const letter = String.fromCharCode(65 + Math.min(25, safeIndex))
  const weekday = (() => {
    const days = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO', 'DOMINGO']
    const o: UnknownRecord = options && typeof options === 'object' ? (options as UnknownRecord) : ({} as UnknownRecord)
    const start = String(o?.startDay || 'monday').toLowerCase()
    const map: Record<string, number> = {
      monday: 0,
      tuesday: 1,
      wednesday: 2,
      thursday: 3,
      friday: 4,
      saturday: 5,
      sunday: 6,
    }
    const startIndex = Number.isFinite(map[start]) ? map[start] : 0
    const idx = (startIndex + safeIndex) % 7
    return days[idx] || `DIA ${safeIndex + 1}`
  })()

  const raw = String(draftTitle || '').trim()
  const extracted = extractLeadingLetter(raw)
  const base = stripTrailingDayHint(extracted?.rest || raw) || 'Treino'
  return `${letter} - ${base.toUpperCase()} (${weekday})`
}
