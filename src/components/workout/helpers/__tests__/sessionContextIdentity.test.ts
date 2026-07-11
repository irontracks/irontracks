import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sessionContextChanged } from '../sessionContextIdentity'

/**
 * Trava o invariante de performance do WorkoutContext: uma mudança SÓ em
 * `session.logs` (o que acontece a cada tecla no peso/reps) NÃO deve trocar a
 * referência de `session` servida no `value` — senão os ~50 consumidores
 * re-renderizam por keystroke. Qualquer outro campo (id/ui/timerTargetTime/
 * workout…) deve, sim, trocar a referência.
 */
describe('sessionContextChanged', () => {
  it('mesma referência → false', () => {
    const s = { id: '1', logs: {} }
    expect(sessionContextChanged(s, s)).toBe(false)
  })

  it('só `logs` mudou (nova referência de logs, resto igual) → false', () => {
    const workout = { exercises: [] }
    const ui = { activeExecution: null }
    const prev = { id: '1', timerTargetTime: 100, ui, workout, logs: { '0-0': { weight: '80' } } }
    const next = { id: '1', timerTargetTime: 100, ui, workout, logs: { '0-0': { weight: '81' } } }
    // digitou um dígito no peso: logs trocou, o resto manteve a referência
    expect(sessionContextChanged(prev, next)).toBe(false)
  })

  it('timerTargetTime mudou (início/fim de descanso) → true', () => {
    const base = { id: '1', ui: {}, logs: {} }
    expect(sessionContextChanged({ ...base, timerTargetTime: 100 }, { ...base, timerTargetTime: 200 })).toBe(true)
  })

  it('nova referência de `ui` (execução de série começou) → true', () => {
    const prev = { id: '1', ui: { activeExecution: null }, logs: {} }
    const next = { id: '1', ui: { activeExecution: { startedAtMs: 1 } }, logs: {} }
    expect(sessionContextChanged(prev, next)).toBe(true)
  })

  it('nova referência de `workout` (edição mid-sessão) → true', () => {
    const prev = { id: '1', workout: { exercises: [] }, logs: {} }
    const next = { id: '1', workout: { exercises: [{ name: 'A' }] }, logs: {} }
    expect(sessionContextChanged(prev, next)).toBe(true)
  })

  it('campo não-logs adicionado ou removido → true', () => {
    expect(sessionContextChanged({ id: '1', logs: {} }, { id: '1', status: 'active', logs: {} })).toBe(true)
    expect(sessionContextChanged({ id: '1', status: 'active', logs: {} }, { id: '1', logs: {} })).toBe(true)
  })

  it('logs presente num lado e ausente no outro não conta como mudança (só logs importa)', () => {
    const prev = { id: '1', logs: { '0-0': {} } }
    const next = { id: '1' } // sem a chave logs
    expect(sessionContextChanged(prev, next)).toBe(false)
  })

  it('null/undefined: qualquer transição de/para vazio conta como mudança; ambos null → false', () => {
    expect(sessionContextChanged(null, { id: '1', logs: {} })).toBe(true)
    expect(sessionContextChanged({ id: '1', logs: {} }, null)).toBe(true)
    expect(sessionContextChanged(null, null)).toBe(false)
    expect(sessionContextChanged(undefined, undefined)).toBe(false)
  })
})

// Source-guard: garante que o controller de fato SERVE a referência estabilizada
// (sessionForContext) no `value` e no array de deps — não o `session` cru. Se
// alguém reverter pra `session`, o cascade por tecla volta silenciosamente.
describe('useActiveWorkoutController — fiação do session estável', () => {
  const src = readFileSync('src/components/workout/useActiveWorkoutController.ts', 'utf8')

  it('importa e usa sessionContextChanged pra estabilizar a referência', () => {
    expect(src).toMatch(/import\s*\{\s*sessionContextChanged\s*\}\s*from\s*'\.\/helpers\/sessionContextIdentity'/)
    expect(src).toMatch(/sessionContextChanged\(\s*sessionCtxRef\.current\s*,\s*session\s*\)/)
  })

  it('serve `session: sessionForContext` no value (não o session cru)', () => {
    expect(src).toMatch(/session:\s*sessionForContext/)
  })

  it('usa sessionForContext no array de deps do useMemo do value', () => {
    expect(src).toMatch(/\}\),\s*\[\s*sessionForContext,\s*anyModalOpen,/)
  })
})
