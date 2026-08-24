import { describe, it, expect } from 'vitest'
import {
  FRACAO_KCAL,
  MIN_DIAS_PARA_SUGERIR,
  diasSugeridos,
  mediana,
  padraoDoUsuario,
  pareceIncompleto,
} from '../incompleteDay'
import type { NutritionHistoryDay } from '../history'

/**
 * Os números vêm da conta REAL do dono (68 dias registrados, 19/03 a
 * 24/08/2026), auditados antes de o critério virar código. A fixture mantém a
 * mediana medida lá: **4 refeições e ~2.340 kcal por dia**.
 *
 * Fixture inventada não serviria: os dois casos que derrubam a heurística
 * ingênua (08/07 e 21/03) são exatamente os que ninguém imagina ao escrever o
 * teste de cabeça.
 */
const dia = (date: string, calories: number, meals: number): NutritionHistoryDay =>
  ({ date, calories, protein: 0, carbs: 0, fat: 0, meals })

/** 12 dias no padrão dele — o bastante para a mediana ser confiável. */
const NORMAIS: NutritionHistoryDay[] = [
  dia('2026-08-24', 3075, 5), dia('2026-08-21', 2495, 4), dia('2026-08-20', 2689, 4),
  dia('2026-08-19', 2778, 4), dia('2026-08-18', 2953, 4), dia('2026-08-17', 2692, 5),
  dia('2026-08-16', 2340, 4), dia('2026-08-13', 2210, 4), dia('2026-08-12', 2400, 4),
  dia('2026-08-11', 2180, 3), dia('2026-08-10', 2500, 4), dia('2026-08-09', 2050, 4),
]

// ── Os quatro dias reais que definem o critério ──────────────────────────────
/** 1 refeição, 580 kcal (25% da mediana). O caso do print do dono. */
const INCOMPLETO_CLASSICO = dia('2026-08-22', 580, 1)
/** 2 refeições, 360 kcal (15%). Incompleto sem dúvida, e passa de 1 refeição. */
const INCOMPLETO_2_REFEICOES = dia('2026-03-23', 360, 2)
/** ⚠️ 1 refeição e 3.482 kcal (149%): lançou o dia inteiro de uma vez. */
const DIA_CHEIO_LANCADO_DE_UMA_VEZ = dia('2026-07-08', 3482, 1)
/** ⚠️ 5 refeições e 1.026 kcal (44%): registrou tudo e comeu pouco. */
const COMEU_POUCO_MAS_REGISTROU = dia('2026-03-21', 1026, 5)

describe('mediana', () => {
  it('ímpar pega o do meio, par tira a média dos dois centrais', () => {
    expect(mediana([1, 5, 3])).toBe(3)
    expect(mediana([1, 2, 3, 4])).toBe(2.5)
    expect(mediana([])).toBe(0)
  })

  it('não é afetada por um extremo — a razão de não usar média', () => {
    // Com média, o dia de 3.482 kcal levantaria a régua e mascararia os dias
    // fracos ao redor (mesma lição de `weightOutlier`).
    const base = [2000, 2100, 2200, 2300, 2400]
    expect(mediana(base)).toBe(2200)
    expect(mediana([...base, 9000])).toBe(2250)
    const comExtremo = [...base, 9000].reduce((a, b) => a + b, 0) / 6
    expect(Math.round(comExtremo)).toBe(3333) // a média dispara
  })
})

describe('padrão do usuário', () => {
  it('reproduz a mediana medida na base real', () => {
    const p = padraoDoUsuario(NORMAIS)
    expect(p.confiavel).toBe(true)
    expect(p.medianaRefeicoes).toBe(4)
    expect(p.medianaKcal).toBeGreaterThan(2300)
    expect(p.medianaKcal).toBeLessThan(2600)
  })

  it('fica CALADO com poucos dias — não há padrão para inferir', () => {
    // O dia incompleto CONTA para o total, então a fatia tem que deixar espaço
    // para ele: com `MIN - 1` normais mais um suspeito a lista chega no mínimo
    // e a sugestão sai — foi o que a primeira versão deste caso não viu.
    const poucos = NORMAIS.slice(0, MIN_DIAS_PARA_SUGERIR - 2)
    const lista = [...poucos, INCOMPLETO_CLASSICO]
    expect(lista).toHaveLength(MIN_DIAS_PARA_SUGERIR - 1)
    expect(padraoDoUsuario(lista).confiavel).toBe(false)
    expect(diasSugeridos(lista, new Set())).toEqual([])
  })

  it('exatamente no mínimo, já sugere', () => {
    const lista = [...NORMAIS.slice(0, MIN_DIAS_PARA_SUGERIR - 1), INCOMPLETO_CLASSICO]
    expect(lista).toHaveLength(MIN_DIAS_PARA_SUGERIR)
    expect(diasSugeridos(lista, new Set())).toEqual([INCOMPLETO_CLASSICO.date])
  })
})

describe('as duas armadilhas que os dados reais revelaram', () => {
  const padrao = padraoDoUsuario([...NORMAIS, DIA_CHEIO_LANCADO_DE_UMA_VEZ, COMEU_POUCO_MAS_REGISTROU])

  it('1 refeição com 3.482 kcal NÃO é incompleto — "poucas refeições" sozinho erraria', () => {
    // Ele lançou o dia inteiro de uma vez. Um critério por contagem excluiria
    // o maior dia da série inteira.
    expect(pareceIncompleto(DIA_CHEIO_LANCADO_DE_UMA_VEZ, padrao)).toBe(false)
  })

  it('5 refeições com 1.026 kcal NÃO é incompleto — "kcal baixa" sozinho erraria', () => {
    // Registrou tudo e comeu pouco: é dado verdadeiro, e em CUT pode ser o plano.
    expect(pareceIncompleto(COMEU_POUCO_MAS_REGISTROU, padrao)).toBe(false)
  })
})

describe('quem é sugerido', () => {
  const todos = [
    ...NORMAIS, INCOMPLETO_CLASSICO, INCOMPLETO_2_REFEICOES,
    DIA_CHEIO_LANCADO_DE_UMA_VEZ, COMEU_POUCO_MAS_REGISTROU,
  ]

  it('pega os dias com poucas refeições E pouca comida, e só eles', () => {
    expect(diasSugeridos(todos, new Set()).sort()).toEqual(['2026-03-23', '2026-08-22'])
  })

  it('não insiste no que o usuário já marcou', () => {
    // Aviso que reaparece depois de resolvido vira papel de parede.
    expect(diasSugeridos(todos, new Set(['2026-08-22']))).toEqual(['2026-03-23'])
    expect(diasSugeridos(todos, new Set(['2026-08-22', '2026-03-23']))).toEqual([])
  })

  it('um dia perto do limiar fica de fora — errar para menos é o certo aqui', () => {
    // 2 refeições e 1.385 kcal = 59% da mediana. Pode ser dia de baixa
    // ingestão real; sugerir um dia legítimo ensina a ignorar o aviso.
    const padrao = padraoDoUsuario(NORMAIS)
    const limiar = padrao.medianaKcal * FRACAO_KCAL
    expect(1385).toBeGreaterThan(limiar)
    expect(pareceIncompleto(dia('2026-07-29', 1385, 2), padrao)).toBe(false)
  })

  it('aguenta lista vazia e campos ausentes sem explodir', () => {
    expect(diasSugeridos(null, new Set())).toEqual([])
    expect(diasSugeridos([], new Set())).toEqual([])
    const padrao = padraoDoUsuario(NORMAIS)
    expect(pareceIncompleto({ date: 'x' } as NutritionHistoryDay, padrao)).toBe(true)
  })
})
