import { describe, it, expect, beforeEach } from 'vitest'
import { readReportCache, writeReportCache } from '../utils'

/**
 * Guard: o cache de histórico é ESCOPADO POR USUÁRIO.
 *
 * INCIDENTE QUE ORIGINOU ESTE TESTE (reproduzido no simulador em 2026-07-23)
 * A chave era global. Logar numa conta SEM histórico gravava um cache vazio;
 * ao trocar para a conta cheia, o app lia esse mesmo cache — e, por estar
 * "fresco", pulava o fetch de rede (`if (cached?.data && !cached.stale) return`).
 * Sintoma: zero sugestões de carga e zero watermark, sem nenhum erro em lugar
 * nenhum. Levou horas para ser diagnosticado justamente por ser silencioso.
 *
 * INVARIANTE: o histórico de um usuário NUNCA pode vazar para outro.
 */
const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002'

const historyOf = (exercise: string) => ({
  version: 1,
  exercises: { [exercise]: { name: exercise, items: [{ ts: 1, avgWeight: 50, avgReps: 10, totalVolume: 500, topWeight: 50, setsCount: 1 }] } },
})

beforeEach(() => {
  window.localStorage.clear()
})

describe('Cache de histórico — escopo por usuário', () => {
  it('devolve o histórico do próprio usuário', () => {
    writeReportCache(historyOf('supino'), USER_A)
    const got = readReportCache(USER_A)
    expect(got?.data?.exercises?.supino).toBeTruthy()
  })

  it('NÃO vaza o histórico de um usuário para outro', () => {
    writeReportCache(historyOf('supino'), USER_A)
    // Era exatamente aqui que o bug acontecia: B recebia o cache de A.
    expect(readReportCache(USER_B)).toBeNull()
  })

  it('cada usuário mantém o seu, sem sobrescrever o do outro', () => {
    writeReportCache(historyOf('supino'), USER_A)
    writeReportCache(historyOf('agachamento'), USER_B)
    expect(readReportCache(USER_A)?.data?.exercises?.supino).toBeTruthy()
    expect(readReportCache(USER_B)?.data?.exercises?.agachamento).toBeTruthy()
    // Nenhum enxerga o exercício do outro.
    expect(readReportCache(USER_A)?.data?.exercises?.agachamento).toBeFalsy()
  })

  it('sem usuário conhecido não lê nem grava (melhor buscar da rede)', () => {
    writeReportCache(historyOf('supino'), '')
    expect(readReportCache('')).toBeNull()
    // E não deve ter sujado o storage.
    expect(window.localStorage.length).toBe(0)
  })
})
