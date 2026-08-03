import { describe, it, expect } from 'vitest'

import { learnWeightGrid, snapToLearnedGrid } from '../machineGrid'
import { roundToIncrement } from '../plateMath'

/**
 * Grid aprendido da máquina.
 *
 * As fixtures abaixo são pesos REAIS extraídos de `workouts.notes` em produção
 * (03/08/2026), não números inventados: é o que dá valor ao guard. O motor
 * arredondava tudo de 5 em 5 kg e sugeria valores que a máquina não tem — o
 * problema que o dono relatou como "a máquina tem 84 e o sistema pede 85".
 */

/**
 * Mesa flexora — o caso mais limpo. Diferenças alternam 5, 4, 5, 4…, assinatura de
 * um stack em LIBRAS (10 lb = 4,536 kg) registrado com arredondamento.
 */
const MESA_FLEXORA = [18, 23, 27, 32, 36, 41, 45, 50, 54, 59, 63]

/** Crucifixo invertido — stack em libras mais grosso, com degraus pulados. */
const CRUCIFIXO = [14, 18, 23, 29, 36, 50, 57, 63, 65, 70]

/** Cadeira extensora — RUIDOSA: o usuário treina em mais de um aparelho. */
const CADEIRA_EXTENSORA = [
  10, 11, 14, 15, 22, 23, 26, 33, 35, 36, 40, 43, 44, 45, 47, 50,
  54, 55, 57, 60, 65, 66, 70, 75, 77, 80, 84, 85, 90, 104,
]

describe('learnWeightGrid', () => {
  it('aprende o passo real de um stack em libras', () => {
    const grid = learnWeightGrid(MESA_FLEXORA)!
    expect(grid).not.toBeNull()
    // 10 lb = 4,536 kg. Com o arredondamento do usuário, a mediana cai em 4,5.
    expect(grid.step).toBeGreaterThanOrEqual(4)
    expect(grid.step).toBeLessThanOrEqual(5)
    expect(grid.values[0]).toBe(18)
    expect(grid.values[grid.values.length - 1]).toBe(63)
  })

  it('deduplica e ordena, tolerando repetição e desordem do histórico', () => {
    const grid = learnWeightGrid([50, 18, 23, 50, 18, 27, 32])!
    expect(grid.values).toEqual([18, 23, 27, 32, 50])
    expect(grid.samples).toBe(7)
  })

  it('trata 22,5 e 22,50 como o mesmo furo do pino', () => {
    const grid = learnWeightGrid([22.5, 22.5, 27, 31.5, 36])!
    expect(grid.values).toEqual([22.5, 27, 31.5, 36])
  })

  it('não inventa grid sem evidência', () => {
    expect(learnWeightGrid([])).toBeNull()
    expect(learnWeightGrid(null)).toBeNull()
    // Dois pontos definem qualquer passo — não é sequência.
    expect(learnWeightGrid([50, 60])).toBeNull()
    expect(learnWeightGrid([50, 50, 50, 50])).toBeNull()
  })

  it('descarta lixo de digitação sem derrubar o resto', () => {
    const grid = learnWeightGrid([18, 23, 27, 32, 0, -5, NaN, 'abc' as unknown as number])!
    expect(grid.values).toEqual([18, 23, 27, 32])
  })
})

describe('snapToLearnedGrid — o caso relatado pelo dono', () => {
  it('85 sugerido numa máquina que tem 84 → devolve 84', () => {
    // O relato literal: "máquina que tem 84kg e o sistema pede 85".
    const grid = learnWeightGrid(CADEIRA_EXTENSORA)!
    expect(snapToLearnedGrid(85, grid)).toBe(85) // 85 existe no histórico
    expect(snapToLearnedGrid(84.9, grid)).toBe(84)
    expect(snapToLearnedGrid(83, grid)).toBe(80)
  })

  it('na mesa flexora, corrige os valores que o motor inventava de 5 em 5', () => {
    const grid = learnWeightGrid(MESA_FLEXORA)!
    // O motor sugeria estes; a máquina não tem nenhum deles.
    expect(snapToLearnedGrid(20, grid)).toBe(18)
    expect(snapToLearnedGrid(25, grid)).toBe(23)
    expect(snapToLearnedGrid(30, grid)).toBe(27)
    expect(snapToLearnedGrid(35, grid)).toBe(32)
    expect(snapToLearnedGrid(40, grid)).toBe(36)
    // E preserva os que existem por coincidência.
    expect(snapToLearnedGrid(45, grid)).toBe(45)
    expect(snapToLearnedGrid(50, grid)).toBe(50)
  })

  it('nunca sobe o peso — só iguala ou desce', () => {
    // Viés de segurança do motor: jamais empurrar mais carga do que a conta pediu.
    const grid = learnWeightGrid(MESA_FLEXORA)!
    for (const target of [19, 24, 28, 33, 37, 42, 46, 51, 55, 60]) {
      const snapped = snapToLearnedGrid(target, grid)
      if (snapped !== null) expect(snapped).toBeLessThanOrEqual(target)
    }
  })

  it('extrapola acima do topo — progressão não pode travar no teto do histórico', () => {
    const grid = learnWeightGrid(MESA_FLEXORA)! // topo 63, passo ~4,5
    expect(snapToLearnedGrid(68, grid)).toBe(67.5)
    expect(snapToLearnedGrid(63, grid)).toBe(63)
    // Alvo apenas 1 kg acima do topo ainda não dá um degrau cheio → segura no topo.
    expect(snapToLearnedGrid(64, grid)).toBe(63)
  })

  it('DESISTE quando o histórico tem buraco, em vez de inventar uma regressão', () => {
    // Guarda central. Passo aprendido de 5 kg; entre 30 e 50 há um vão de 20 kg
    // (degraus que o usuário nunca usou). Com alvo 45, snapar para 30 seria uma
    // queda de 33% criada por falta de dado, não por decisão do motor — devolve
    // null e deixa o plateMath resolver.
    const grid = learnWeightGrid([20, 25, 30, 50])!
    expect(grid.step).toBe(5)
    expect(snapToLearnedGrid(45, grid)).toBeNull()
    // Já um alvo dentro de um degrau do que existe é snapado normalmente.
    expect(snapToLearnedGrid(33, grid)).toBe(30)
  })

  it('um degrau largo mas REAL é aceito — buraco ≠ passo grande', () => {
    // Leg press anda de 20 em 20: 40 → 20 não é regressão inventada, é o degrau
    // anterior de verdade. A guarda não pode confundir passo grosso com falta de dado.
    const grid = learnWeightGrid([100, 120, 140, 160, 180])!
    expect(grid.step).toBe(20)
    expect(snapToLearnedGrid(135, grid)).toBe(120)
  })

  it('desiste abaixo do menor peso conhecido', () => {
    const grid = learnWeightGrid(MESA_FLEXORA)!
    expect(snapToLearnedGrid(10, grid)).toBeNull()
  })

  it('sem grid, devolve null (o chamador segue com o plateMath)', () => {
    expect(snapToLearnedGrid(85, null)).toBeNull()
    expect(snapToLearnedGrid(85, learnWeightGrid([50, 60]))).toBeNull()
  })

  it('entrada inválida não quebra', () => {
    const grid = learnWeightGrid(MESA_FLEXORA)!
    expect(snapToLearnedGrid(0, grid)).toBeNull()
    expect(snapToLearnedGrid(-10, grid)).toBeNull()
    expect(snapToLearnedGrid(NaN, grid)).toBeNull()
  })
})

describe('ganho real sobre o arredondamento por equipamento', () => {
  it('o grid aprendido acerta onde o passo de 5 kg erra', () => {
    // Mede o que a mudança entrega: quantos alvos o plateMath resolve para um valor
    // inexistente na máquina, e quantos o grid aprendido corrige.
    const grid = learnWeightGrid(MESA_FLEXORA)!
    const existe = new Set(MESA_FLEXORA)

    let erradosAntes = 0
    let corrigidos = 0
    for (let target = 20; target <= 63; target++) {
      const antes = roundToIncrement(target, 5, 'down')
      if (existe.has(antes)) continue
      erradosAntes++
      const depois = snapToLearnedGrid(target, grid)
      if (depois !== null && existe.has(depois)) corrigidos++
    }

    expect(erradosAntes).toBeGreaterThan(0)
    expect(corrigidos).toBe(erradosAntes) // corrige TODOS os casos da faixa
  })

  it('no crucifixo, também resolve para degraus que existem', () => {
    const grid = learnWeightGrid(CRUCIFIXO)!
    const existe = new Set(CRUCIFIXO)
    for (const target of [20, 25, 30, 40, 55, 60]) {
      const snapped = snapToLearnedGrid(target, grid)
      if (snapped !== null) expect(existe.has(snapped)).toBe(true)
    }
  })
})
