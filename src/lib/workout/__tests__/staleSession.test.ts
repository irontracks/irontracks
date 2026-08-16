import { describe, it, expect } from 'vitest'
import {
  classifyRestoredSession,
  lastActivityMs,
  staleSessionAgeLabel,
  SESSION_STALE_MS,
  SESSION_EXPIRED_MS,
} from '../staleSession'

const H = 60 * 60 * 1000
const NOW = 1_760_000_000_000 // instante fixo — nada aqui pode depender do relógio real

describe('classifyRestoredSession', () => {
  it('sessão de minutos atrás é fresca (o caso de todo dia: recarregou a página)', () => {
    expect(classifyRestoredSession({ savedAtMs: NOW - 5 * 60 * 1000, startedAtMs: NOW - 20 * 60 * 1000, nowMs: NOW }))
      .toBe('fresh')
  })

  it('treino LONGO de verdade continua fresco — 3h de sessão com atividade recente', () => {
    // Powerlifter em dia de agachamento passa das 3h. Se este caso virasse "stale",
    // o app perguntaria "quer descartar?" no meio de um treino real.
    expect(classifyRestoredSession({ savedAtMs: NOW - 10 * 60 * 1000, startedAtMs: NOW - 3 * H, nowMs: NOW }))
      .toBe('fresh')
  })

  it('sem atividade há mais de 4h: pergunta antes de retomar', () => {
    expect(classifyRestoredSession({ savedAtMs: NOW - 5 * H, startedAtMs: NOW - 6 * H, nowMs: NOW }))
      .toBe('stale')
  })

  it('sem atividade há mais de 24h: descarta sem perguntar (alinhado ao IndexedDB)', () => {
    expect(classifyRestoredSession({ savedAtMs: NOW - 30 * H, startedAtMs: NOW - 31 * H, nowMs: NOW }))
      .toBe('expired')
  })

  it('o treino de segunda reaberto na quarta NÃO é retomado em silêncio', () => {
    // O caso concreto que originou o módulo: 48h depois, o app abria dentro do
    // treino antigo e a duração falsa ia para o histórico e para as calorias.
    const doisDias = NOW - 48 * H
    expect(classifyRestoredSession({ savedAtMs: doisDias, startedAtMs: doisDias, nowMs: NOW })).toBe('expired')
  })

  // ── Fronteiras exatas ────────────────────────────────────────────────────
  // Literais, não as constantes: assertar contra a própria constante é
  // tautológico (mudar o valor muda a expectativa junto) — jeito nº 1 de guard
  // falso no CLAUDE.md.
  it('4h em ponto ainda é fresco; um milissegundo depois vira stale', () => {
    expect(classifyRestoredSession({ savedAtMs: NOW - 4 * H, startedAtMs: NOW - 4 * H, nowMs: NOW })).toBe('fresh')
    expect(classifyRestoredSession({ savedAtMs: NOW - 4 * H - 1, startedAtMs: NOW - 4 * H - 1, nowMs: NOW })).toBe('stale')
  })

  it('24h em ponto ainda é stale; um milissegundo depois expira', () => {
    expect(classifyRestoredSession({ savedAtMs: NOW - 24 * H, startedAtMs: NOW - 24 * H, nowMs: NOW })).toBe('stale')
    expect(classifyRestoredSession({ savedAtMs: NOW - 24 * H - 1, startedAtMs: NOW - 24 * H - 1, nowMs: NOW })).toBe('expired')
  })

  it('as constantes valem o que o produto combinou (4h e 24h)', () => {
    expect(SESSION_STALE_MS).toBe(4 * 60 * 60 * 1000)
    expect(SESSION_EXPIRED_MS).toBe(24 * 60 * 60 * 1000)
  })

  // ── Na dúvida, PRESERVA o treino ─────────────────────────────────────────
  it('sem carimbo de tempo nenhum, preserva o treino em vez de descartar', () => {
    expect(classifyRestoredSession({ savedAtMs: 0, startedAtMs: 0, nowMs: NOW })).toBe('fresh')
    expect(classifyRestoredSession({ savedAtMs: null, startedAtMs: undefined, nowMs: NOW })).toBe('fresh')
    expect(classifyRestoredSession({ savedAtMs: 'lixo', startedAtMs: NaN, nowMs: NOW })).toBe('fresh')
  })

  it('savedAt corrompido não condena a sessão: o startedAt recente sustenta ela', () => {
    // Se o código escolhesse o PRIMEIRO carimbo em vez do MAIOR, um savedAt zerado
    // faria um treino começado há 10 min ser tratado como sessão sem atividade.
    expect(classifyRestoredSession({ savedAtMs: 0, startedAtMs: NOW - 10 * 60 * 1000, nowMs: NOW })).toBe('fresh')
    expect(classifyRestoredSession({ savedAtMs: -1, startedAtMs: NOW - 10 * 60 * 1000, nowMs: NOW })).toBe('fresh')
  })

  it('relógio do aparelho andando para trás não descarta treino', () => {
    // Troca de fuso / ajuste de NTP deixa a idade negativa.
    expect(classifyRestoredSession({ savedAtMs: NOW + 5 * H, startedAtMs: NOW + 5 * H, nowMs: NOW })).toBe('fresh')
  })

  it('nowMs inválido não descarta treino', () => {
    expect(classifyRestoredSession({ savedAtMs: NOW - 30 * H, startedAtMs: NOW - 30 * H, nowMs: NaN })).toBe('fresh')
  })
})

describe('lastActivityMs', () => {
  it('usa o MAIOR carimbo, nunca o primeiro que aparece', () => {
    expect(lastActivityMs(100, 500)).toBe(500)
    expect(lastActivityMs(500, 100)).toBe(500)
  })

  it('ignora valores inválidos em vez de propagá-los', () => {
    expect(lastActivityMs(NaN, 500)).toBe(500)
    expect(lastActivityMs('x', 500)).toBe(500)
    expect(lastActivityMs(0, 0)).toBe(0)
  })
})

describe('staleSessionAgeLabel', () => {
  it('fala em horas e dias, no singular certo', () => {
    expect(staleSessionAgeLabel(30 * 60 * 1000)).toBe('há menos de 1 hora')
    expect(staleSessionAgeLabel(1 * H)).toBe('há 1 hora')
    expect(staleSessionAgeLabel(5 * H)).toBe('há 5 horas')
    expect(staleSessionAgeLabel(25 * H)).toBe('há 1 dia')
    expect(staleSessionAgeLabel(50 * H)).toBe('há 2 dias')
  })
})
