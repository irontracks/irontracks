/**
 * Estabilidade da referência de `session` servida no WorkoutContext.
 *
 * O `value` do WorkoutProvider é lido por ~50 consumidores (WorkoutHeader/Footer,
 * modais, set-renderers…). O objeto `session` é recriado a CADA tecla — o registro
 * de séries (`session.logs`) muda por keystroke e faz `setActiveSession({...prev,
 * logs})`. Como `logs` já é servido num provider separado (WorkoutLogsProvider),
 * ele NÃO deve invalidar a identidade do `value` — senão todos os consumidores
 * re-renderizam a cada dígito (o cascade que o split de context tenta evitar).
 *
 * Esta função decide quando trocar a referência de `session` servida: retorna true
 * só quando um campo != 'logs' muda. Comparação rasa — os campos não-logs mantêm a
 * mesma referência entre teclas (o spread `{...prev, logs}` preserva `id`, `ui`,
 * `timerTargetTime`, `workout`, etc.). Assim o footer/header/FAB continuam recebendo
 * `ui`/`timerTargetTime` frescos, e só o churn de `logs` deixa de propagar.
 */
export function sessionContextChanged(prev: unknown, next: unknown): boolean {
  if (prev === next) return false
  if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object') return true
  const a = prev as Record<string, unknown>
  const b = next as Record<string, unknown>
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if (k === 'logs') continue
    if (a[k] !== b[k]) return true
  }
  return false
}
