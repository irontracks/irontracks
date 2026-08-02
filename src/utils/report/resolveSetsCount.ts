// Quantas séries a tabela do relatório deve iterar para um exercício.
//
// Bug corrigido: exercícios UNILATERAIS (e legados) às vezes não têm `sets`
// preenchido — a config fica em `setDetails` e os valores nos logs `L_/R_`.
// Iterar só por `exercise.sets` zerava a tabela (ex.: "Flexora em pé" vazio).
// Aqui pegamos o MAIOR entre: sets do header, tamanho de setDetails e o maior
// índice de série realmente logado para este exercício.
export function resolveReportSetsCount(
  exercise: unknown,
  exIdx: number,
  sessionLogs: unknown,
): number {
  const obj = exercise && typeof exercise === 'object' ? (exercise as Record<string, unknown>) : {}
  const bySets = Math.max(0, Math.floor(Number(obj.sets) || 0))
  const details = Array.isArray(obj.setDetails)
    ? obj.setDetails.length
    : Array.isArray(obj.set_details)
      ? (obj.set_details as unknown[]).length
      : 0

  let byLogs = 0
  if (sessionLogs && typeof sessionLogs === 'object') {
    const prefix = `${exIdx}-`
    for (const k of Object.keys(sessionLogs as Record<string, unknown>)) {
      if (!k.startsWith(prefix)) continue
      const sIdx = Number(k.slice(prefix.length))
      if (Number.isInteger(sIdx) && sIdx >= 0 && sIdx + 1 > byLogs) byLogs = sIdx + 1
    }
  }

  return Math.max(bySets, details, byLogs)
}
