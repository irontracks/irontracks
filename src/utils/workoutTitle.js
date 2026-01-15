const normalizeSpaces = (value) => String(value || '').replace(/\s+/g, ' ').trim()

const normalizeDash = (value) => {
  const s = normalizeSpaces(value)
  if (!s) return ''
  return s.replace(/[–—−]/g, '-')
}

const extractLeadingLetter = (raw) => {
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

export const normalizeWorkoutTitle = (value) => {
  const raw = String(value || '')
  if (!raw.trim()) return ''

  const { letter, rest } = extractLeadingLetter(raw)
  if (!letter) return normalizeSpaces(normalizeDash(raw))

  if (!rest) return letter
  return `${letter} - ${rest}`
}

export const workoutTitleKey = (value) => {
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

