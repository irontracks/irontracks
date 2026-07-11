import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guard do bug ALTA da auditoria offline: editar um lançamento de refeição ainda
 * PENDENTE re-enfileira via queueNutritionLog, mas o payload precisa incluir `clientId`
 * — sem ele, /api/nutrition/log-entry insere SEM dedup (índice único parcial
 * user_id+client_id) e um reenvio pós-commit DUPLICA a refeição.
 */
describe('NutritionMixer — edição de pendente mantém o clientId (idempotência)', () => {
  const src = readFileSync('src/components/dashboard/nutrition/NutritionMixer.tsx', 'utf8')

  it('o re-enqueue de log pendente passa clientId no payload', () => {
    // Trecho do branch target?.pending → queueNutritionLog(id, { ... clientId: id }, false)
    const m = src.match(/if\s*\(\s*target\?\.pending\s*\)\s*\{[\s\S]{0,400}?queueNutritionLog\(\s*id\s*,\s*\{([\s\S]*?)\}\s*,\s*false\s*\)/)
    expect(m).toBeTruthy()
    expect(m![1]).toMatch(/clientId:\s*id/)
  })
})
