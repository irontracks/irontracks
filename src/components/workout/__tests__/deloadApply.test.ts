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

  it('nunca devolve peso acima da referência', () => {
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '50', weightSource: 'user' }, plannedWeight: 70, suggestion: { weight: 50 }, cfg: null },
    ]
    const plan = apply(sets)
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
  /**
   * O piso mudou em 07/09/2026. Era `0,5 × 1RM estimado por Epley`, que a 12+
   * reps fica ACIMA do alvo de −30 % e cancelava a descarga em silêncio (6 de 19
   * aplicações da história do app reduziram zero). Hoje é a redução MÁXIMA que o
   * slider já anuncia — 40 % —, medida sobre a referência DESTA série.
   *
   * O caso abaixo cobre a diferença: pedir 70 % de redução para em 40 %, não num
   * número vindo de outro lugar.
   */
  it('o piso é a redução máxima anunciada (40 %), relativa à referência da série', () => {
    const plan = apply(setsFromEngine(), { ratio: 0.3 })
    expect(plan.patches[0].patch.weight).toBe('60')
  })

  it('o piso acompanha a referência da série, não uma média do exercício', () => {
    // Série leve (35 kg) num exercício cuja média é 100. Com o piso antigo — que
    // vinha do 1RM do exercício — o alvo caía abaixo dele e a série NÃO reduzia:
    // é o caso real do Pullover do dono, gravado como "35 → 35" com 30 % declarado.
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '35', weightSource: 'user' }, plannedWeight: 50, suggestion: { weight: 35 }, cfg: null },
    ]
    const plan = apply(sets, { ratio: 0.7 })
    expect(plan.patches[0].patch.weight).toBe('24.5')
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

/**
 * O BURACO que deixou passar a auditoria de 07/09/2026.
 *
 * Havia 106 casos de teste de deload e nenhum comparava o que o app DECLARA com
 * o que ele APLICA. Resultado em produção: 8 de 19 aplicações gravaram uma
 * porcentagem que não aconteceu — três delas anunciando 25–30 % numa série que
 * não mudou de peso.
 */
describe('buildDeloadPatches — o app não declara redução que não aconteceu', () => {
  it('grava a redução MEDIDA na série, não a intenção do modal', () => {
    // O modal pediu 22 % (META), mas esta série parte de 35 kg e a máquina só
    // tem 25 — a queda real é outra. É a MEDIDA que vai para o log.
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '35', weightSource: 'user' }, plannedWeight: 35, suggestion: null, cfg: null },
    ]
    const plan = apply(sets, { ratio: 0.78, knownWeights: [10, 15, 20, 25, 30, 35] })
    expect(plan.patches[0].patch.weight).toBe('25')
    const deload = plan.patches[0].patch.deload as Record<string, unknown>
    // 1 − 25/35 = 0,2857 — e NÃO os 0,22 que o modal pediu.
    expect(deload.reductionPct).toBeCloseTo(0.286, 3)
    expect(deload.requestedPct).toBe(0.22)
  })

  it('a redução declarada bate com o peso gravado, série a série', () => {
    const plan = apply(setsFromEngine())
    for (const { patch } of plan.patches) {
      const d = patch.deload as Record<string, number>
      const medida = 1 - Number(patch.weight) / d.originalWeight
      expect(d.reductionPct).toBeCloseTo(medida, 3)
    }
  })

  it('não grava marca de descarga em série que não mudou de peso', () => {
    // Máquina com um degrau só acima do alvo: não há carga menor alcançável.
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '5', weightSource: 'user' }, plannedWeight: 5, suggestion: null, cfg: null },
    ]
    const plan = apply(sets, { ratio: 0.99 })
    // 5 × 0,99 = 4,95 → arredonda para 5 → nada mudou.
    expect(plan.patches).toHaveLength(0)
    expect(plan.unchanged).toBe(1)
    expect(plan.appliedWeights).toHaveLength(0)
  })

  it('quando o pino cai abaixo do alvo, a redução declarada acompanha', () => {
    // A máquina não tem 70: o degrau existente abaixo do alvo é 63, então a
    // descarga sai MAIOR que a pedida. O log tem de dizer 37 %, não 30 %.
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '100', weightSource: 'user' }, plannedWeight: 100, suggestion: null, cfg: null },
    ]
    const plan = apply(sets, { ratio: 0.7, knownWeights: [49, 56, 63, 77, 84, 91, 100] })
    expect(plan.patches[0].patch.weight).toBe('63')
    expect((plan.patches[0].patch.deload as Record<string, unknown>).reductionPct).toBeCloseTo(0.37, 3)
  })

  it('effectiveReduction é a média das reduções reais', () => {
    const plan = apply(setsFromEngine())
    expect(plan.effectiveReduction).toBeCloseTo(0.22, 3)
  })
})

describe('buildDeloadPatches — reaplicar é idempotente', () => {
  /**
   * O Crucifixo invertido do dono ficou gravado como "de 53,5" quando a carga
   * real dele é 70 kg: a segunda aplicação partiu do peso já reduzido, não mudou
   * nada e ainda sobrescreveu o `originalWeight` da primeira. Aplicar duas vezes
   * tem de dar o mesmo resultado que aplicar uma.
   */
  it('parte do originalWeight gravado, não do peso já reduzido', () => {
    const primeira = apply(setsFromEngine())
    expect(primeira.patches[0].patch.weight).toBe('78')

    const segunda = apply(
      primeira.patches.map((p) => ({
        key: p.key,
        log: p.patch as Record<string, unknown>,
        plannedWeight: 100,
        suggestion: null,
        cfg: null,
      })),
    )
    expect(segunda.patches[0].patch.weight).toBe('78')
    expect(segunda.patches[0].patch.deload).toMatchObject({ originalWeight: 100 })
  })

  it('mudar a porcentagem depois de já ter aplicado recalcula sobre a carga cheia', () => {
    const primeira = apply(setsFromEngine())
    const segunda = apply(
      primeira.patches.map((p) => ({
        key: p.key,
        log: p.patch as Record<string, unknown>,
        plannedWeight: 100,
        suggestion: null,
        cfg: null,
      })),
      { ratio: 0.9 },
    )
    // 100 × 0,9 = 90 — e não 78 × 0,9 = 70, que seria o corte composto.
    expect(segunda.patches[0].patch.weight).toBe('90')
  })
})

describe('buildDeloadPatches — usa a grade real da máquina', () => {
  /**
   * O deload arredondava a 0,5 kg e propunha 60,5 / 51,5 / 37,5 kg. Nenhum desses
   * números é furo de pino: os 7 exercícios do treino de 07/09/2026 precisaram de
   * correção manual. O motor de carga já resolvia isso com `machineGrid`.
   */
  it('escolhe o degrau que a máquina TEM, sempre para baixo', () => {
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '84', weightSource: 'user' }, plannedWeight: 84, suggestion: null, cfg: null },
    ]
    const plan = apply(sets, { ratio: 0.7, knownWeights: [36, 43, 50, 57, 63, 70, 77, 84] })
    // 84 × 0,7 = 58,8 → o pino existente logo abaixo é 57. Nunca 58,5.
    expect(plan.patches[0].patch.weight).toBe('57')
  })

  it('o piso vale ACIMA da grade: degrau distante demais não fura os 40 %', () => {
    // Máquina de passo LARGO (30 em 30). Pedindo 35 % sobre 100, o alvo é 65 e o
    // degrau existente abaixo dele é 40 — dentro da tolerância do grid, logo o
    // snap ACEITARIA. Mas 40 é uma redução de 60 %, o dobro do que o app
    // anunciou. O piso vence a grade: volta ao passo cego, em 65.
    //
    // A primeira versão deste caso usava [5,10,15,20,100] e passava verde com a
    // guarda REMOVIDA — a tolerância do próprio grid já barrava aquele salto, e
    // o caminho real nunca era exercitado. Pego pelo `npm run mutar`.
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '100', weightSource: 'user' }, plannedWeight: 100, suggestion: null, cfg: null },
    ]
    const plan = apply(sets, { ratio: 0.65, knownWeights: [10, 40, 70, 100] })
    expect(plan.patches[0].patch.weight).toBe('65')
  })

  it('sem grade confiável, mantém o arredondamento de 0,5 kg', () => {
    const sets: DeloadSetInput[] = [
      { key: '0-0', log: { weight: '84', weightSource: 'user' }, plannedWeight: 84, suggestion: null, cfg: null },
    ]
    const plan = apply(sets, { ratio: 0.7, knownWeights: [84, 84] })
    // 84 × 0,7 = 58,8 → passo de 0,5 ao mais próximo = 59.
    expect(plan.patches[0].patch.weight).toBe('59')
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
