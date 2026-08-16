/**
 * Guard do PORTÃO de restauração. Testa o efeito real sobre o `localStorage`,
 * não só a matemática da idade — a classificação pura já tem guard próprio em
 * `staleSession.test.ts`, e o que quebrava aqui era a FIAÇÃO entre os dois
 * armazenamentos, não a conta.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readRestorableSession, activeSessionStorageKey } from '../restoreSessionGate'

const H = 60 * 60 * 1000
const NOW = 1_760_000_000_000
const UID = 'user-abc'
const KEY = activeSessionStorageKey(UID)

const gravaSessao = (savedAt: number, startedAt: number) => {
  localStorage.setItem(KEY, JSON.stringify({
    startedAt,
    _savedAt: savedAt,
    workout: { id: 'w1', name: 'Treino A' },
    logs: { '0-0': { weight: 80, reps: 10, completed: true } },
  }))
}

describe('readRestorableSession', () => {
  beforeEach(() => { localStorage.clear() })

  it('sessão recente volta inteira, com o veredito fresco', () => {
    gravaSessao(NOW - 10 * 60 * 1000, NOW - 40 * 60 * 1000)
    const r = readRestorableSession(UID, NOW)
    expect(r.verdict).toBe('fresh')
    expect(r.session?.workout).toEqual({ id: 'w1', name: 'Treino A' })
    expect(localStorage.getItem(KEY)).not.toBeNull()
  })

  it('sessão parada há 6h volta marcada como stale, SEM perder os registros', () => {
    gravaSessao(NOW - 6 * H, NOW - 7 * H)
    const r = readRestorableSession(UID, NOW)
    expect(r.verdict).toBe('stale')
    // O que o usuário já registrou continua ali — o aviso não pode custar dado.
    expect(r.session?.logs).toEqual({ '0-0': { weight: 80, reps: 10, completed: true } })
    expect(r.ageMs).toBe(6 * H)
    expect(localStorage.getItem(KEY)).not.toBeNull()
  })

  it('sessão de 2 dias é descartada E a chave sai do disco', () => {
    // Apagar aqui é o ponto: se a chave ficasse, o próximo hook a ler
    // encontraria a sessão de novo e os dois discordariam.
    gravaSessao(NOW - 48 * H, NOW - 48 * H)
    const r = readRestorableSession(UID, NOW)
    expect(r.verdict).toBe('expired')
    expect(r.session).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('sem nada gravado devolve vazio sem estourar', () => {
    const r = readRestorableSession(UID, NOW)
    expect(r.session).toBeNull()
  })

  it('JSON corrompido não derruba o app nem retoma lixo', () => {
    localStorage.setItem(KEY, '{isso não é json')
    const r = readRestorableSession(UID, NOW)
    expect(r.session).toBeNull()
  })

  it('snapshot sem workout não é sessão, seja qual for a idade', () => {
    localStorage.setItem(KEY, JSON.stringify({ startedAt: NOW - 60_000, _savedAt: NOW - 60_000 }))
    expect(readRestorableSession(UID, NOW).session).toBeNull()
  })

  it('a sessão de OUTRO usuário não é lida', () => {
    gravaSessao(NOW - 60_000, NOW - 60_000)
    expect(readRestorableSession('outro-user', NOW).session).toBeNull()
  })

  it('sem userId não lê nada (evita servir sessão alheia no mesmo aparelho)', () => {
    gravaSessao(NOW - 60_000, NOW - 60_000)
    expect(readRestorableSession('', NOW).session).toBeNull()
    expect(readRestorableSession('   ', NOW).session).toBeNull()
  })

  it('cai para _idbSavedAt quando o _savedAt não existe', () => {
    localStorage.setItem(KEY, JSON.stringify({
      startedAt: NOW - 50 * H,
      _idbSavedAt: NOW - 30 * H,
      workout: { id: 'w1' },
    }))
    expect(readRestorableSession(UID, NOW).verdict).toBe('expired')
  })

  it('treino LONGO com atividade recente sobrevive — 5h de sessão, salvo agora', () => {
    // Sem isto, quem treina muito seria interrompido no meio: a idade tem que
    // ser medida pela ÚLTIMA ATIVIDADE, não pela duração da sessão.
    gravaSessao(NOW - 2 * 60 * 1000, NOW - 5 * H)
    expect(readRestorableSession(UID, NOW).verdict).toBe('fresh')
  })
})
