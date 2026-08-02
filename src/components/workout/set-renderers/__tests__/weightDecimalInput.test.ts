import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseTrainingNumber } from '@/utils/trainingNumber'

/**
 * Regressão (reportado pelo dono): o peso do check-in do treino não deixava colocar vírgula
 * (95,5) — "só números redondos". Causa: o input de peso do groupMethodSet usava
 * type="number", que num WebView com locale != pt-BR REJEITA a vírgula. O normalSet (série
 * comum) já usava só inputMode="decimal" e funcionava.
 *
 * Fix: remover type="number" dos inputs do groupMethodSet (peso/reps/rpe), deixando só o
 * inputMode — igual ao normalSet. Nenhum input de PESO no treino pode ter type="number".
 */
const groupMethod = readFileSync('src/components/workout/set-renderers/groupMethodSet.tsx', 'utf8')
const normal = readFileSync('src/components/workout/set-renderers/normalSet.tsx', 'utf8')

describe('peso do check-in aceita decimal (vírgula)', () => {
  it('groupMethodSet NÃO usa type="number" em nenhum input (bloqueava a vírgula)', () => {
    // stripa o comentário que MENCIONA type="number" pra não dar falso-positivo.
    const code = groupMethod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    expect(code).not.toMatch(/type="number"/)
  })

  it('o input de peso do groupMethodSet usa inputMode="decimal"', () => {
    const wIdx = groupMethod.indexOf('aria-label={`Peso em kg')
    const before = groupMethod.slice(Math.max(0, wIdx - 200), wIdx)
    expect(before).toMatch(/inputMode="decimal"/)
  })

  it('normalSet (referência) também não tem type="number" no peso', () => {
    expect(normal).not.toMatch(/type="number"/)
  })

  it('o parser de treino aceita vírgula como separador decimal', () => {
    expect(parseTrainingNumber('95,5')).toBe(95.5)
    expect(parseTrainingNumber('95.5')).toBe(95.5)
    expect(parseTrainingNumber('100')).toBe(100)
  })
})
