import { describe, it, expect } from 'vitest'
import {
  getIronRankLevel,
  getIronRankProgress,
  IRON_RANK_NAMES,
  IRON_RANK_MAX_LEVEL,
} from '@/utils/gamification/ironRank'

describe('getIronRankLevel', () => {
  it('respeita as fronteiras dos níveis base (1–8)', () => {
    expect(getIronRankLevel(0)).toBe(1)
    expect(getIronRankLevel(4999)).toBe(1)
    expect(getIronRankLevel(5000)).toBe(2)
    expect(getIronRankLevel(999_999)).toBe(7)
    expect(getIronRankLevel(1_000_000)).toBe(8) // Lenda Imortal começa em 1M
  })

  it('atribui os novos níveis de prestígio (9–12)', () => {
    expect(getIronRankLevel(1_750_000)).toBe(9) // Titã Colossal
    expect(getIronRankLevel(3_000_000)).toBe(10) // Divindade de Ferro
    expect(getIronRankLevel(5_500_000)).toBe(11) // Soberano do Olimpo
    expect(getIronRankLevel(8_500_000)).toBe(12) // Deus Absoluto (máximo)
    expect(getIronRankLevel(50_000_000)).toBe(IRON_RANK_MAX_LEVEL)
  })

  it('trata valores inválidos como 0', () => {
    expect(getIronRankLevel(NaN)).toBe(1)
    expect(getIronRankLevel(-100)).toBe(1)
  })
})

describe('getIronRankProgress', () => {
  it('barra progride dentro do nível (caso do dono: ~2.069M = Titã Colossal)', () => {
    const p = getIronRankProgress(2_069_396)
    expect(p.level).toBe(9)
    expect(p.name).toBe('Titã Colossal')
    expect(p.prevVol).toBe(1_750_000)
    expect(p.nextVol).toBe(3_000_000)
    // (2.069M - 1.75M) / (3M - 1.75M) ≈ 25.5% — bem mais vivo que os 12% antigos
    expect(Math.round(p.progress)).toBe(26)
  })

  it('nível máximo aponta pra meta-estica, sem estourar 100%', () => {
    const p = getIronRankProgress(9_000_000)
    expect(p.level).toBe(12)
    expect(p.name).toBe('Deus Absoluto')
    expect(p.nextVol).toBe(15_000_000)
    expect(p.progress).toBeLessThanOrEqual(100)
    expect(p.progress).toBeGreaterThan(0)
  })

  it('volume acima do topo satura em 100%', () => {
    expect(getIronRankProgress(999_000_000).progress).toBe(100)
  })

  it('nome sempre existe para todo nível', () => {
    for (let v = 0; v <= 20_000_000; v += 500_000) {
      const p = getIronRankProgress(v)
      expect(IRON_RANK_NAMES).toContain(p.name)
    }
  })
})
