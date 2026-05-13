
import type { UnknownRecord } from '@/types/app'

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

// Regex que casa abreviações e nomes completos dos dias da semana em português.
// Inclui as 3 formas mais comuns: completo ("TERÇA"), abreviado 3-letras ("TER"),
// abreviado com ponto ("TER.").
const WEEKDAY_TOKEN_RE = /^(segunda(?:-feira)?|terc[aá](?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[aá]bado|domingo|seg\.?|ter\.?|qua\.?|qui\.?|sex\.?|s[aá]b\.?|dom\.?)\b/i

const stripLeadingDayPrefix = (value: unknown): string => {
  const s = normalizeDash(value).trim()
  if (!s) return ''
  // Casa "TER · ...", "TER - ...", "TERÇA · ...", "Segunda-feira: ...", etc.
  // Separador obrigatório: ·, -, :, — pra não engolir títulos como "Terapia" ou "Domingo no parque".
  const m = s.match(/^([a-záâãéêíóôõúç.-]+)\s*[·\-—–:]\s*(.+)$/i)
  if (!m) return s
  const head = m[1].trim()
  if (!WEEKDAY_TOKEN_RE.test(head)) return s
  return normalizeSpaces(m[2])
}

/**
 * Remove a marcação de dia da semana do título do treino.
 *
 * Cobre duas formas:
 *   1. Sufixo gerado por `formatProgramWorkoutTitle`: "A - PEITO (TERÇA)"
 *   2. Prefixo salvo manualmente pelo usuário: "TER · PULL - DORSAIS + BÍCEPS"
 *
 * Em contextos de compartilhamento (ex: Stories do Instagram), o usuário pode
 * estar postando num dia diferente do programado e o dia fica confuso visualmente.
 *
 * Ex:
 *   "A - PEITO E TRÍCEPS (TERÇA)"        → "A - PEITO E TRÍCEPS"
 *   "C - COSTAS (DIA 3)"                  → "C - COSTAS"
 *   "TER · PULL - DORSAIS + BÍCEPS"       → "PULL - DORSAIS + BÍCEPS"
 *   "SEGUNDA-FEIRA: PEITO"                → "PEITO"
 *   "Peito"                                → "Peito"
 */
export const stripWeekdayHint = (value: unknown): string => {
  const noTrailing = stripTrailingDayHint(value)
  return stripLeadingDayPrefix(noTrailing)
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
