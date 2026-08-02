import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard: os prompts de geração de treino por IA precisam instruir que o
 * campo "method" vale pra TODAS as séries — pra a IA NÃO marcar o exercício
 * inteiro como Drop-set quando a intenção é uma série só (ex.: "drop na última").
 * Nesse caso o método fica "Normal" e a técnica vai na nota (o aluno aplica na
 * série). Sem esta regra, um "drop na última" virava drop em todas as séries.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('Prompts de IA — método por-série não vira método do exercício', () => {
  it('student-workout instrui que method vale pra TODAS as séries', () => {
    const src = read('src/app/api/ai/student-workout/route.ts')
    expect(src).toMatch(/vale pra TODAS as séries/i)
    expect(src).toMatch(/só uma série/i)
  })

  it('parse-exercise-voice instrui o mesmo', () => {
    const src = read('src/app/api/ai/parse-exercise-voice/route.ts')
    expect(src).toMatch(/vale pra TODAS as séries/i)
  })
})
