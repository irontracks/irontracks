/**
 * Fiação da conferência de carga: o resumo de finalização marca o exercício
 * cuja carga destoa do histórico, e o controller entrega a referência.
 *
 * Sem estes casos, `weightOutlier.test.ts` ficaria verde com a detecção correta
 * e NINGUÉM chamando — o jeito nº 3 de guard falso do CLAUDE.md (as pontas
 * certas, a fiação faltando).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildWorkoutSummary } from '../utils'

const exercicios = [{ name: 'Supino Reto' }, { name: 'Rosca Direta' }]
const logs = {
  '0-0': { weight: 120, reps: 10, completed: true },
  '1-0': { weight: 20, reps: 12, completed: true },
}

describe('resumo de finalização marca carga fora do padrão', () => {
  it('marca o exercício cujo peso destoa, e SÓ ele', () => {
    const r = buildWorkoutSummary(exercicios, logs, { 'supino reto': 20, 'rosca direta': 20 })
    expect(r.text).toMatch(/Supino Reto.*⚠️ conferir: 120 kg \(costuma ser 20 kg\)/)
    expect(r.text).not.toMatch(/Rosca Direta.*conferir/)
  })

  it('sem referência, o resumo sai EXATAMENTE como era antes', () => {
    // Compatibilidade: o parâmetro é opcional e nenhum chamador antigo muda de
    // comportamento por existir uma conferência nova.
    const semRef = buildWorkoutSummary(exercicios, logs)
    const refVazia = buildWorkoutSummary(exercicios, logs, {})
    expect(semRef.text).toBe(refVazia.text)
    expect(semRef.text).not.toMatch(/conferir/)
  })

  it('o volume e a contagem não mudam por causa do aviso', () => {
    const com = buildWorkoutSummary(exercicios, logs, { 'supino reto': 20 })
    const sem = buildWorkoutSummary(exercicios, logs)
    expect(com.volume).toBe(sem.volume)
    expect(com.sets).toBe(sem.sets)
    expect(com.exercises).toBe(sem.exercises)
  })

  it('exercício sem histórico não é acusado nem por engano', () => {
    const r = buildWorkoutSummary(exercicios, logs, { 'rosca direta': 20 })
    expect(r.text).not.toMatch(/Supino Reto.*conferir/)
  })

  it('convive com a marca de "sem carga" na mesma linha', () => {
    const r = buildWorkoutSummary(
      [{ name: 'Supino Reto' }],
      { '0-0': { weight: 120, reps: 10, completed: true }, '0-1': { completed: true } },
      { 'supino reto': 20 },
    )
    expect(r.text).toMatch(/sem carga/)
    expect(r.text).toMatch(/conferir/)
  })
})

describe('o controller entrega a referência ao resumo', () => {
  const src = readFileSync(join(__dirname, '..', 'useActiveWorkoutController.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('chama buildWeightReference com o histórico — import órfão não confere nada', () => {
    expect(src).toMatch(/buildWorkoutSummary\([^)]*buildWeightReference\(reportHistory\)/)
  })

  it('o histórico está nas dependências do efeito que abre a conferência', () => {
    // Sem isto o resumo usaria o histórico do primeiro render e a conferência
    // ficaria muda em quem abriu o app direto no treino.
    const bloco = src.slice(src.indexOf('shouldOpenFinishPrompt'), src.indexOf('Memoiza o contexto'))
    expect(bloco).toMatch(/reportHistory\]/)
  })
})
