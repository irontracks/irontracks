/** Remove diacr\u00edticos (NFD + faixa de combina\u00e7\u00f5es). Primitivo compartilhado. */
export function stripDiacritics(input: string): string {
  return String(input ?? '').normalize('NFD').replace(/[\u0300-\u036f]+/g, '')
}

export function normalizeExerciseName(input: string) {
  const raw = String(input || '').trim().toLowerCase()
  if (!raw) return ''
  const cleaned = stripDiacritics(raw).replace(/[^a-z0-9]+/g, ' ').trim()
  return cleaned.replace(/\s+/g, ' ')
}
