const safeArray = (v) => (Array.isArray(v) ? v : [])

export const buildExerciseSortKey = (exercise, index) => {
  const rawId = exercise?.id ?? exercise?.exercise_id ?? exercise?.exerciseId
  const id = String(rawId ?? '').trim()
  if (id) return `id:${id}`
  const name = String(exercise?.name ?? '').trim()
  return `idx:${index}:${name}`
}

export const buildExerciseDraft = (exercises) =>
  safeArray(exercises).map((exercise, index) => ({
    key: buildExerciseSortKey(exercise, index),
    exercise,
  }))

export const draftOrderKeys = (draft) =>
  safeArray(draft)
    .map((item) => String(item?.key ?? '').trim())
    .filter(Boolean)

export const applyExerciseOrder = (exercises, draft) => {
  const list = safeArray(exercises)
  const ordered: any[] = [];
  const used = new Set()
  const byKey = new Map(list.map((exercise, index) => [buildExerciseSortKey(exercise, index), exercise]))

  for (const item of safeArray(draft)) {
    const key = String(item?.key ?? '').trim()
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

export const moveDraftItem = (draft, fromIndex, toIndex) => {
  const list = safeArray(draft)
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
