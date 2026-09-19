import { describe, it, expect } from 'vitest'
import { resolverSerieAlvoDaVoz } from '../serieAlvoDaVoz'

/**
 * A regra derivada da combinação "botão por exercício" + "não conclui
 * automaticamente" — ver o cabeçalho de `serieAlvoDaVoz.ts` e
 * `docs/plans/voz-na-serie.md` seção 9. O caso que mais importa aqui é o
 * ÚLTIMO: ditar duas vezes seguidas não pode escrever na mesma série.
 */

const exercicio = (sets: number) => ({ sets, setDetails: Array.from({ length: sets }, () => ({})) })

describe('resolverSerieAlvoDaVoz — sem série falada', () => {
  it('nenhuma série tem dado: alvo é a primeira (índice 0)', () => {
    expect(resolverSerieAlvoDaVoz([exercicio(4)], {}, 0)).toBe(0)
  })

  it('série 0 já tem reps: alvo pula para a 1', () => {
    const logs = { '0-0': { reps: '12' } }
    expect(resolverSerieAlvoDaVoz([exercicio(4)], logs, 0)).toBe(1)
  })

  it('série concluída SEM reps ainda é pulada (done vence a ausência de reps)', () => {
    const logs = { '0-0': { done: true } }
    expect(resolverSerieAlvoDaVoz([exercicio(4)], logs, 0)).toBe(1)
  })

  it('DITAR DUAS VEZES SEGUIDAS preenche séries DIFERENTES — o caso que a combinação de decisões exige', () => {
    // Simula o fluxo real: primeira fala grava reps na série 0 (sem concluir,
    // por decisão do dono). A segunda chamada precisa mirar na série 1.
    const logsAposPrimeiraFala = { '0-0': { reps: '12', weight: '100', weightSource: 'user' } }
    const alvo2 = resolverSerieAlvoDaVoz([exercicio(4)], logsAposPrimeiraFala, 0)
    expect(alvo2).toBe(1)
    expect(alvo2).not.toBe(0)
  })

  it('unilateral: reps só do lado L já conta como "tem dado"', () => {
    const logs = { '0-0': { L_reps: '10' } }
    expect(resolverSerieAlvoDaVoz([exercicio(3)], logs, 0)).toBe(1)
  })

  it('todas as séries preenchidas: cai na última (palpite, não trava)', () => {
    const logs = {
      '0-0': { reps: '12' }, '0-1': { reps: '12' }, '0-2': { reps: '12' },
    }
    expect(resolverSerieAlvoDaVoz([exercicio(3)], logs, 0)).toBe(2)
  })

  it('exercício sem série: null', () => {
    expect(resolverSerieAlvoDaVoz([exercicio(0)], {}, 0)).toBeNull()
    expect(resolverSerieAlvoDaVoz([], {}, 0)).toBeNull()
  })
})

describe('resolverSerieAlvoDaVoz — "série N" vence o automático', () => {
  it('série falada válida vence, mesmo com série anterior vazia', () => {
    expect(resolverSerieAlvoDaVoz([exercicio(4)], {}, 0, 3)).toBe(2)
  })

  it('permite corrigir uma série já preenchida — o único caminho para isso', () => {
    const logs = { '0-0': { reps: '12' }, '0-1': { reps: '10' } }
    expect(resolverSerieAlvoDaVoz([exercicio(4)], logs, 0, 1)).toBe(0)
  })

  it('série falada fora do range: ignora e cai no automático', () => {
    expect(resolverSerieAlvoDaVoz([exercicio(4)], {}, 0, 99)).toBe(0)
    expect(resolverSerieAlvoDaVoz([exercicio(4)], {}, 0, 0)).toBe(0)
  })
})
