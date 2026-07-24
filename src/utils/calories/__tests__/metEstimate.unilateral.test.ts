import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { estimateCaloriesMet } from '@/utils/calories/metEstimate'

/**
 * Correção: o volume do modelo MET (calorias) lia só weight/reps "planos", então
 * exercícios UNILATERAIS (L_/R_) entravam com volume 0 e o modo ALTERNADO não
 * dobrava. O loop de volume agora soma L+R e aplica o ×2 do alternado.
 *
 * O kcal final não é bom alvo de teste: com duração fixa o volume só desloca o
 * fator de densidade dentro de faixas, e pode não mudar o total num ponto de
 * operação específico. Então travamos a LEITURA correta com um source-guard
 * (padrão do repo para invariantes de cálculo difíceis de exercitar via output),
 * mais um teste de fumaça de que nada quebrou.
 */
const src = readFileSync(
  join(process.cwd(), 'src/utils/calories/metEstimate.ts'),
  'utf8',
)

describe('estimateCaloriesMet — volume lê unilateral e alternado', () => {
  it('o loop de volume soma os dois lados (L_weight/R_weight)', () => {
    expect(src).toMatch(/L_weight/)
    expect(src).toMatch(/R_weight/)
    expect(src).toMatch(/L_reps/)
    expect(src).toMatch(/R_reps/)
  })

  it('o loop de volume aplica o multiplicador do alternado', () => {
    expect(src).toMatch(/alternating\s*===\s*true\s*\?\s*2\s*:\s*1/)
  })

  it('fumaça: sessão normal segue produzindo kcal > 0', () => {
    const normal = { '0-0': { weight: '80', reps: '10', done: true } }
    expect(estimateCaloriesMet(normal, 30, 80, ['Supino'])).toBeGreaterThan(0)
  })
})
