export function normalizeExerciseName(input: string) {
  const raw = String(input || '').trim().toLowerCase()
  if (!raw) return ''
  const noAccents = raw.normalize('NFD').replace(/[\u0300-\u036f]+/g, '')
  const cleaned = noAccents.replace(/[^a-z0-9]+/g, ' ').trim()
  return cleaned.replace(/\s+/g, ' ')
}
