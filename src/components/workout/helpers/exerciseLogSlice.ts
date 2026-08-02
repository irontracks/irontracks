// Perf (auditoria UX/perf): o ExerciseCard consumia o mapa INTEIRO de logs via context
// (useWorkoutLogs). React.memo não bloqueia re-render por mudança de context, então CADA
// tecla (novo mapa) re-renderizava TODOS os cards. Estes helpers permitem extrair só o
// slice do próprio exercício e reusar a MESMA referência quando ele não mudou — assim só o
// card editado re-renderiza (o update do controller é spread imutável, preserva as outras
// entradas por referência).

type LogMap = Record<string, Record<string, unknown> | undefined>

/** Extrai as entradas cujo prefixo é `${exIdx}-` (ex.: "3-0", "3-1"). Não casa "30-0" p/ exIdx=3. */
export function pickExerciseLogSlice(logs: LogMap, exIdx: number): LogMap {
  const prefix = `${exIdx}-`
  const out: LogMap = {}
  for (const k in logs) {
    if (k.startsWith(prefix)) out[k] = logs[k]
  }
  return out
}

/** Igualdade rasa por REFERÊNCIA dos valores (mesmas chaves + mesmos objetos de log). */
export function shallowEqualByRef(a: LogMap, b: LogMap): boolean {
  if (a === b) return true
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (a[k] !== b[k]) return false
  }
  return true
}
