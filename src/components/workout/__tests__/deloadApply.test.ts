/**
 * COBERTURA REAL da aplicação do deload.
 *
 * Estes casos importam e executam o núcleo (`buildDeloadPatches`,
 * `clampDeloadWeight`), em vez de conferir por regex se uma linha existe no
 * arquivo. Antes, o único ponto do deload que escreve algo — a aplicação — não
 * tinha nenhum teste de comportamento, e foi exatamente ali que se instalaram os
 * dois bugs mais graves da auditoria de 2026-07-29.
 */
import { describe, it, expect } from 'vitest'
import { buildDeloadPatches, clampDeloadWeight, type DeloadSetInput } from '../helpers/deloadHelpers'

const META = { reductionPct: 0.22, reason: 'regressão', historyCount: 6 }

/** 4 séries de 100 kg, nenhuma concluída, peso vindo do motor. */
const setsFromEngine = (): DeloadSetInput[] =>
  [0, 1, 2, 3].map((i) => ({
    key: `0-${i}`,
    log: { weight: '100', weightSource: 'auto' },
    plannedWeight: 100,
    suggestion: null,
    cfg: null,
  }))

const apply = (sets: DeloadSetInput[], over: Partial<Parameters<typeof buildDeloadPatches>[0]> = {}) =>
  buildDeloadPatches({
    sets,
    ratio: 0.78,
    minWeight: 0,
    baseWeight: 100,
    appliedAt: '2026-07-29T10:00:00.000Z',
    meta: META,
    ...over,
  })

describe('buildDeloadPatches — o peso é marcado como do usuário', () => {
  it("todo patch carrega weightSource 'user' (senão o autoload reescreve por cima)", () => {
    const plan = apply(setsFromEngine())
    expect(plan.patches).toHaveLength(4)
    for (const { patch } of plan.patches) expect(patch.weightSource).toBe('user')
  })

  it('grava o metadado de deload com o peso original e o reduzido', () => {
    const plan = apply(setsFromEngine())
    expect(plan.patches[0].patch.deload).toMatchObject({
      appliedAt: '2026-07-29T10:00:00.000Z',
      originalWeight: 100,
      suggestedWeight: 78,
      reductionPct: 0.22,
      historyCount: 6,
    })
  })
})

describe('buildDeloadPatches — série concluída é preservada', () => {
  it('não gera patch para série já concluída e contabiliza o skip', () => {
    const sets = setsFromEngine()
    sets[0].log = { weight: '100', done: true }
    sets[1].log = { weight: '100', done: 'true' } // vem como string do JSON
    const plan = apply(sets)
    expect(plan.skippedDone).toBe(2)
    expect(plan.patches.map((p) => p.key)).toEqual(['0-2', '0-3'])
  })

  it('com todas concluídas, não aplica nada', () => {
    const sets = setsFromEngine().map((s) => ({ ...s, log: { weight: '100', done: true } }))
    const plan = apply(sets)
    expect(plan.patches).toHaveLength(0)
    expect(plan.appliedWeights).toHaveLength(0)
    expect(plan.skippedDone).toBe(4)
  })
})

describe('buildDeloadPatches — cortes não se compõem', () => {
  it('corte do DIA não compõe: referência é o peso da última sessão', () => {
    // motor entregou 79 kg (100 da última sessão, já cortado por prontidão × reconhecimento)
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '79', weightSource: 'auto' }, plannedWeight: 100, suggestion: { weight: 100 }, cfg: null },
    ]
    const plan = apply(sets)
    // 100 × 0,78 = 78 — e NÃO 79 × 0,78 = 61,5 (que seria o corte composto)
    expect(plan.patches[0].patch.weight).toBe('78')
    expect(plan.patches[0].patch.deload).toMatchObject({ originalWeight: 100 })
  })

  it('quando a carga CAIU de verdade, reduz sobre a carga atual — e nunca aumenta', () => {
    // Caso real (Crucifixo invertido, 29/07): template diz 70, mas a carga real caiu
    // para 50 e a última sessão foi 50. Com o template como referência, "reduzir 22%"
    // daria 54,5 — o deload AUMENTARIA a carga. A referência tem de ser o histórico.
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '50', weightSource: 'auto' }, plannedWeight: 70, suggestion: { weight: 50 }, cfg: null },
    ]
    const plan = apply(sets)
    expect(Number(plan.patches[0].patch.weight)).toBeLessThan(50)
    expect(plan.patches[0].patch.weight).toBe('39')
  })

  it('nunca devolve peso acima da referência, nem com piso alto', () => {
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '50', weightSource: 'user' }, plannedWeight: 70, suggestion: { weight: 50 }, cfg: null },
    ]
    // piso de 1RM absurdo (acima da própria carga) não pode virar aumento
    const plan = apply(sets, { minWeight: 200 })
    expect(Number(plan.patches[0].patch.weight)).toBeLessThanOrEqual(50)
  })

  it('peso que o USUÁRIO assumiu manda, mesmo sendo menor que o planejado', () => {
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '80', weightSource: 'user' }, plannedWeight: 100, suggestion: null, cfg: null },
    ]
    const plan = apply(sets)
    expect(plan.patches[0].patch.weight).toBe('62.5') // 80 × 0,78 = 62,4 → passo de 0,5
  })

  it('sem planejado nem caixa, cai no peso base do modal', () => {
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: {}, plannedWeight: null, suggestion: null, cfg: null },
    ]
    const plan = apply(sets)
    expect(plan.patches[0].patch.weight).toBe('78')
  })

  it('série sem referência nenhuma é ignorada (não gera patch com peso zero)', () => {
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: {}, plannedWeight: null, suggestion: null, cfg: null },
    ]
    const plan = apply(sets, { baseWeight: 0 })
    expect(plan.patches).toHaveLength(0)
  })
})

describe('buildDeloadPatches — piso e arredondamento', () => {
  it('nunca desce abaixo do piso de 1RM', () => {
    const plan = apply(setsFromEngine(), { ratio: 0.3, minWeight: 60 })
    expect(plan.patches[0].patch.weight).toBe('60')
  })

  it('arredonda em passos de 0,5 kg, ao mais próximo', () => {
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '87', weightSource: 'user' }, plannedWeight: 87, suggestion: null, cfg: null },
    ]
    const plan = apply(sets, { ratio: 0.85 }) // 73,95 → 74
    // Documenta uma divergência real entre os dois sistemas: o deload usa
    // `roundToStep` (Math.round, ao mais próximo), enquanto o motor de carga usa
    // `roundToIncrement(..., 'down')` (para baixo, conservador). Na prática o
    // deload pode reduzir um pouco MENOS que o pedido; o motor nunca sugere mais
    // do que a conta deu. Não é bug — mas se algum dia unificarem, este caso avisa.
    expect(plan.patches[0].patch.weight).toBe('74')
  })
})

describe('buildDeloadPatches — reps e RPE do usuário são preservados', () => {
  it('não sobrescreve reps/RPE já preenchidos', () => {
    const sets: DeloadSetInput[] = [
      {
        key: '0-0',
        log: { weight: '100', reps: '8', rpe: '9', weightSource: 'user' },
        plannedWeight: 100,
        suggestion: { reps: 12, rpe: 6 },
        cfg: null,
      },
    ]
    const plan = apply(sets)
    expect(plan.patches[0].patch.reps).toBe('8')
    expect(plan.patches[0].patch.rpe).toBe('9')
  })

  it('preenche reps/RPE a partir da sugestão quando estão vazios', () => {
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '100' }, plannedWeight: 100, suggestion: { reps: 12, rpe: 6 }, cfg: null },
    ]
    const plan = apply(sets)
    expect(plan.patches[0].patch.reps).toBe('12')
    expect(plan.patches[0].patch.rpe).toBe('6')
  })
})

describe('clampDeloadWeight — o campo livre não vira aumento de carga', () => {
  it('peso acima da base é limitado à redução mínima de 5%', () => {
    const r = clampDeloadWeight(120, 100, 0)
    expect(r?.weight).toBe(95)
    expect(r?.reductionPct).toBeCloseTo(0.05, 5)
  })

  it('peso muito baixo é limitado à redução máxima de 40%', () => {
    const r = clampDeloadWeight(10, 100, 0)
    expect(r?.weight).toBe(60)
    expect(r?.reductionPct).toBeCloseTo(0.4, 5)
  })

  it('respeita o piso de 1RM acima do limite de 40%', () => {
    const r = clampDeloadWeight(10, 100, 75)
    expect(r?.weight).toBe(75)
  })

  it('valor dentro da faixa passa como está (arredondado)', () => {
    const r = clampDeloadWeight(83.2, 100, 0)
    expect(r?.weight).toBe(83)
    expect(r?.reductionPct).toBeCloseTo(0.17, 5)
  })

  it('base inválida devolve null em vez de dividir por zero', () => {
    expect(clampDeloadWeight(80, 0, 0)).toBeNull()
    expect(clampDeloadWeight(Number.NaN, 100, 0)).toBeNull()
  })
})
