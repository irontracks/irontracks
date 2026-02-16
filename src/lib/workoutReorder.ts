const safeArray = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : [])
const safeArrayTyped = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export const buildExerciseSortKey = (exercise: unknown, index: number): string => {
  const ex = exercise && typeof exercise === 'object' ? (exercise as Record<string, unknown>) : ({} as Record<string, unknown>)
  const rawId = ex?.id ?? ex?.exercise_id ?? ex?.exerciseId
  const id = String(rawId ?? '').trim()
  if (id) return `id:${id}`
  const name = String(ex?.name ?? '').trim()
  return `idx:${index}:${name}`
}

export const buildExerciseDraft = (exercises: unknown): Array<{ key: string; exercise: unknown }> =>
  safeArray(exercises).map((exercise, index) => ({ key: buildExerciseSortKey(exercise, index), exercise }))

export const draftOrderKeys = (draft: unknown): string[] =>
  safeArray(draft)
    .map((item) => {
      const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : ({} as Record<string, unknown>)
      return String(obj?.key ?? '').trim()
    })
    .filter(Boolean)

export const applyExerciseOrder = (exercises: unknown, draft: unknown): unknown[] => {
  const list = safeArray(exercises)
  const ordered: unknown[] = []
  const used = new Set<string>()
  const byKey = new Map<string, unknown>(list.map((exercise, index) => [buildExerciseSortKey(exercise, index), exercise]))

  for (const item of safeArray(draft)) {
    const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : ({} as Record<string, unknown>)
    const key = String(obj?.key ?? '').trim()
    if (!key || used.has(key)) continue
    const exercise = byKey.get(key)
    if (!exercise) continue
    ordered.push(exercise)
    used.add(key)
  }

  for (let index = 0; index < list.length; index += 1) {
    const exercise = list[index]
    const key = buildExerciseSortKey(exercise, index)
    if (used.has(key)) continue
    ordered.push(exercise)
  }

  return ordered
}

export const moveDraftItem = <T,>(draft: T[], fromIndex: unknown, toIndex: unknown): T[] => {
  const list = safeArrayTyped<T>(draft)
  const from = Number(fromIndex)
  const to = Number(toIndex)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return list
  if (from < 0 || from >= list.length) return list
  if (to < 0 || to >= list.length) return list
  if (from === to) return list
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
