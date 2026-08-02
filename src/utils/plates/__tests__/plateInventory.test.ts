import { describe, it, expect } from 'vitest'
import {
  pairsAvailable,
  decompose,
  loadableTotals,
  minStepKg,
  isCustomInventory,
  DEFAULT_GYM_INVENTORY,
  type PlateInventory,
} from '../plateInventory'

/** O caso concreto que motivou a feature: 6 anilhas de 20 kg + 2 de 10 kg, barra de 20. */
const HOME_INV: PlateInventory = { counts: { '20': 6, '10': 2 }, barWeightKg: 20 }

describe('pairsAvailable', () => {
  it('conta em PARES, não em unidades', () => {
    const pairs = pairsAvailable(HOME_INV)
    expect(pairs).toEqual([
      { plate: 20, pairs: 3, hasOddLeftover: false },
      { plate: 10, pairs: 1, hasOddLeftover: false },
    ])
  })

  it('sinaliza a unidade ímpar sobrando (5 de 10 kg = 2 pares + 1 morta)', () => {
    const pairs = pairsAvailable({ counts: { '10': 5 }, barWeightKg: 20 })
    expect(pairs).toEqual([{ plate: 10, pairs: 2, hasOddLeftover: true }])
  })

  it('uma anilha solta aparece com 0 pares e leftover (a UI precisa avisar)', () => {
    expect(pairsAvailable({ counts: { '25': 1 }, barWeightKg: 20 })).toEqual([
      { plate: 25, pairs: 0, hasOddLeftover: true },
    ])
  })

  it('descarta entradas inválidas sem lançar', () => {
    const inv = { counts: { abc: 4, '10': -2, '0': 5, '20': 2 }, barWeightKg: 20 } as unknown as PlateInventory
    expect(pairsAvailable(inv)).toEqual([{ plate: 20, pairs: 1, hasOddLeftover: false }])
    expect(pairsAvailable(null)).toEqual([])
  })
})

describe('decompose — o inventário do caso real', () => {
  it('monta 80 kg com 20+10 por lado', () => {
    const d = decompose(80, HOME_INV)
    expect(d.exact).toBe(true)
    expect(d.perSide).toEqual([20, 10])
    expect(d.total).toBe(80)
  })

  it('82,5 kg NÃO é montável — devolve os vizinhos 80 e 100', () => {
    const d = decompose(82.5, HOME_INV)
    expect(d.exact).toBe(false)
    expect(d.below).toBe(80)
    expect(d.above).toBe(100)
    // Viés de segurança: a montagem mostrada é a do vizinho de BAIXO.
    expect(d.total).toBe(80)
    expect(d.perSide).toEqual([20, 10])
  })

  it('usa os 3 pares de 20 no topo (160 kg) e não passa disso', () => {
    expect(decompose(160, HOME_INV)).toMatchObject({ exact: true, perSide: [20, 20, 20, 10] })
    const over = decompose(200, HOME_INV)
    expect(over.exact).toBe(false)
    expect(over.below).toBe(160)
    expect(over.above).toBeNull()
  })
})

describe('decompose — o guloso falharia aqui', () => {
  /**
   * Guard da decisão de algoritmo: guloso pega 25, sobra 5 e encalha.
   * A resposta certa é 20+10. Se alguém trocar a DP por "pega sempre a maior",
   * este teste fica vermelho.
   */
  it('resolve 30 kg/lado com pares {25, 20, 10} usando 20+10', () => {
    const inv: PlateInventory = { counts: { '25': 2, '20': 2, '10': 2 }, barWeightKg: 0 }
    const d = decompose(60, inv)
    expect(d.exact).toBe(true)
    expect(d.perSide).toEqual([20, 10])
  })
})

describe('decompose — bordas', () => {
  it('alvo igual à barra = nenhuma anilha', () => {
    const d = decompose(20, HOME_INV)
    expect(d.exact).toBe(true)
    expect(d.perSide).toEqual([])
    expect(d.total).toBe(20)
  })

  it('alvo abaixo da barra não é montável; o menor total é a barra nua', () => {
    const d = decompose(15, HOME_INV)
    expect(d.exact).toBe(false)
    expect(d.below).toBeNull()
    expect(d.above).toBe(20)
  })

  it('fração impossível de repartir entre os lados cai nos vizinhos', () => {
    // 21,25 na barra de 20 pediria 0,625 kg por lado — não existe anilha assim.
    const inv: PlateInventory = { counts: { '1.25': 4 }, barWeightKg: 20 }
    const d = decompose(21.25, inv)
    expect(d.exact).toBe(false)
    expect(d.below).toBe(20)
    expect(d.above).toBe(22.5)
  })

  it('entrada inválida não lança', () => {
    expect(() => decompose(Number.NaN, HOME_INV)).not.toThrow()
    expect(() => decompose(-10, HOME_INV)).not.toThrow()
    expect(decompose(50, null).perSide).toEqual([])
  })

  it('não acumula ruído de ponto flutuante', () => {
    const inv: PlateInventory = { counts: { '1.25': 12 }, barWeightKg: 20 }
    const d = decompose(27.5, inv)
    expect(d.exact).toBe(true)
    expect(d.total).toBe(27.5)
    expect(d.perSide).toEqual([1.25, 1.25, 1.25])
  })
})

describe('loadableTotals / minStepKg', () => {
  it('o inventário do caso real só monta de 20 em 20', () => {
    expect(loadableTotals(HOME_INV)).toEqual([20, 40, 60, 80, 100, 120, 140, 160])
    expect(minStepKg(HOME_INV)).toBe(20)
  })

  /**
   * 0,5 kg — e não 2,5 — porque o catálogo brasileiro mistura DUAS famílias de anilha
   * leve: a de 2 kg e as de 1,25/2,5. Por lado, 2+2 = 4 contra 1,25+2,5 = 3,75, uma
   * diferença de 0,25 (0,5 no total). O `plateMath.resolveIncrement` devolve 2,5 fixo
   * para barra por ser um default conservador; com inventário real o passo é mais fino.
   */
  it('academia completa desce a 0,5 kg de salto (famílias de anilha se cruzam)', () => {
    expect(minStepKg(DEFAULT_GYM_INVENTORY)).toBe(0.5)
    // O par vizinho que produz o salto de 0,5: 3,75/lado (1,25+2,5) → 4/lado (2+2).
    expect(decompose(27.5, DEFAULT_GYM_INVENTORY)).toMatchObject({ exact: true })
    expect(decompose(28, DEFAULT_GYM_INVENTORY)).toMatchObject({ exact: true, perSide: [2, 2] })
  })

  it('sem nenhum par não há salto', () => {
    expect(minStepKg({ counts: { '20': 1 }, barWeightKg: 20 })).toBeNull()
  })

  it('respeita o limite pedido', () => {
    expect(loadableTotals(DEFAULT_GYM_INVENTORY, 5)).toHaveLength(5)
  })
})

describe('isCustomInventory', () => {
  it('reconhece o default de academia', () => {
    expect(isCustomInventory(DEFAULT_GYM_INVENTORY)).toBe(false)
    expect(isCustomInventory(null)).toBe(false)
  })

  it('detecta mudança de anilha ou de barra', () => {
    expect(isCustomInventory(HOME_INV)).toBe(true)
    expect(isCustomInventory({ ...DEFAULT_GYM_INVENTORY, barWeightKg: 15 })).toBe(true)
  })
})
