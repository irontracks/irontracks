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
  // Consumo por POSIÇÃO, não por chave: dois exercícios podem ter a MESMA chave
  // (mesmo id — ex.: após "Duplicar", que faz spread raso e copia o id). Casar por
  // Map/Set de chave colapsava os duplicados e DROPAVA um exercício (perda de dado
  // + logs fantasma). Cada item do draft consome a PRIMEIRA posição ainda não usada
  // cuja chave bate, então todas as ocorrências (referências distintas) sobrevivem.
  const used = new Array<boolean>(list.length).fill(false)

  for (const item of safeArray(draft)) {
    const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : ({} as Record<string, unknown>)
    const key = String(obj?.key ?? '').trim()
    if (!key) continue
    const matchIdx = list.findIndex((exercise, index) => !used[index] && buildExerciseSortKey(exercise, index) === key)
    if (matchIdx === -1) continue
    used[matchIdx] = true
    ordered.push(list[matchIdx])
  }

  // Exercícios que o draft não referenciou (ex.: draft parcial) vão pro fim, em ordem.
  for (let index = 0; index < list.length; index += 1) {
    if (!used[index]) ordered.push(list[index])
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
