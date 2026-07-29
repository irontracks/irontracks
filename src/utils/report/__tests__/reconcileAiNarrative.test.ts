/**
 * Reconciliação da narrativa da IA contra as métricas oficiais.
 *
 * Caso real que originou o guard (29/07/2026): card "26.300 kg / 29 séries",
 * texto da IA "Volume total de 18.232 kg movimentado em 26 séries de trabalho".
 */
import { describe, it, expect } from 'vitest'
import {
  reconcileAiNarrative,
  findDeclaredVolumeKg,
  findDeclaredSets,
  parsePtBrNumber,
} from '@/utils/report/reconcileAiNarrative'

const METRICS = { totalVolumeKg: 26300, totalSetsDone: 29 }

describe('parsePtBrNumber', () => {
  it('lê separador de milhar pt-BR', () => {
    expect(parsePtBrNumber('18.232')).toBe(18232)
    expect(parsePtBrNumber('26.300')).toBe(26300)
    expect(parsePtBrNumber('1.234.567')).toBe(1234567)
  })
  it('lê decimal com vírgula', () => {
    expect(parsePtBrNumber('7,5')).toBe(7.5)
  })
})

describe('extração de totais declarados', () => {
  it('acha o volume total citado', () => {
    expect(findDeclaredVolumeKg('Volume total de 18.232 kg movimentado em 26 séries.')).toBe(18232)
  })

  it('ignora peso de exercício (não é volume total)', () => {
    expect(findDeclaredVolumeKg('Puxada na frente com 73 kg em todas as séries.')).toBeNull()
    expect(findDeclaredVolumeKg('Top exercício: Panturrilha em pé • 7.260 kg')).toBeNull()
  })

  it('acha o total de séries nas duas formas usadas pelo modelo', () => {
    expect(findDeclaredSets('Volume total de 18.232 kg movimentado em 26 séries de trabalho.')).toBe(26)
    expect(findDeclaredSets('Falha muscular atingida em 19 das 26 séries.')).toBe(26)
  })

  it('ignora séries de um exercício específico', () => {
    expect(findDeclaredSets('Supino executado em 4 séries até a falha.')).toBeNull()
  })
})

describe('reconcileAiNarrative', () => {
  it('descarta o bullet com o volume alucinado (caso real 18.232 vs 26.300)', () => {
    const ai = {
      summary: [
        'Volume total de 18.232 kg movimentado em 26 séries de trabalho.',
        'Cardio em zona 2 realizado conforme o objetivo.',
      ],
      highlights: [],
      warnings: [],
    }
    const { ai: out, divergences } = reconcileAiNarrative(ai, METRICS)
    expect(out.summary).toEqual(['Cardio em zona 2 realizado conforme o objetivo.'])
    expect(divergences).toHaveLength(1)
    expect(divergences[0]).toMatchObject({ kind: 'volume', declared: 18232, official: 26300 })
  })

  it('descarta contagem de séries divergente', () => {
    const ai = { summary: ['Falha muscular atingida em 19 das 26 séries.'], highlights: [], warnings: [] }
    const { ai: out, divergences } = reconcileAiNarrative(ai, METRICS)
    expect(out.summary).toEqual([])
    expect(divergences[0]).toMatchObject({ kind: 'sets', declared: 26, official: 29 })
  })

  it('mantém o bullet quando o número bate', () => {
    const ai = {
      summary: ['Volume total de 26.300 kg movimentado em 29 séries de trabalho.'],
      highlights: [],
      warnings: [],
    }
    const { ai: out, divergences } = reconcileAiNarrative(ai, METRICS)
    expect(out.summary).toHaveLength(1)
    expect(divergences).toEqual([])
  })

  it('tolera arredondamento pequeno do texto', () => {
    const ai = { summary: ['Volume total de 26.290 kg na sessão.'], highlights: [], warnings: [] }
    const { ai: out } = reconcileAiNarrative(ai, METRICS)
    expect(out.summary).toHaveLength(1)
  })

  it('NÃO descarta bullets que citam carga de exercício', () => {
    const ai = {
      summary: ['Puxada na frente com 73 kg e Remada na máquina com 90 kg, ambas até a falha.'],
      highlights: ['Drop-set no Crucifixo invertido com 13 + 10 repetições.'],
      warnings: [],
    }
    const { ai: out, divergences } = reconcileAiNarrative(ai, METRICS)
    expect(out.summary).toHaveLength(1)
    expect(out.highlights).toHaveLength(1)
    expect(divergences).toEqual([])
  })

  it('varre highlights e warnings, não só o summary', () => {
    const ai = {
      summary: [],
      highlights: ['Volume total de 99.999 kg atingido.'],
      warnings: ['Apenas 10 das 12 séries concluídas.'],
    }
    const { ai: out, divergences } = reconcileAiNarrative(ai, METRICS)
    expect(out.highlights).toEqual([])
    expect(out.warnings).toEqual([])
    expect(divergences).toHaveLength(2)
  })

  it('sem métricas oficiais, não mexe em nada (fail-open consciente)', () => {
    const ai = { summary: ['Volume total de 18.232 kg.'], highlights: [], warnings: [] }
    const { ai: out, divergences } = reconcileAiNarrative(ai, null)
    expect(out.summary).toHaveLength(1)
    expect(divergences).toEqual([])
  })
})
