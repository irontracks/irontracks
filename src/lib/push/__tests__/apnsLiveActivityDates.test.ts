import { describe, it, expect } from 'vitest'
import {
  dateToAppleRefSeconds,
  normalizeContentStateDates,
  APPLE_REF_EPOCH_SECONDS,
} from '@/lib/push/apnsLiveActivity'

// O iOS decodifica `Date` no content-state de push como segundos desde 2001
// (Swift default `.deferredToDate`). Enviar ISO/segundos-1970 faz o update ser
// descartado em silêncio → "card travado". Este guard trava o formato correto.
describe('dateToAppleRefSeconds', () => {
  it('converte ISO 8601 → segundos desde 2001 (não 1970, não ISO)', () => {
    // 2001-01-01T00:00:00Z é o próprio reference date → 0
    expect(dateToAppleRefSeconds('2001-01-01T00:00:00.000Z')).toBe(0)
  })

  it('a diferença 1970→2001 bate com a constante', () => {
    // epoch 1970 (0s) em ref-seconds = -offset
    expect(dateToAppleRefSeconds('1970-01-01T00:00:00.000Z')).toBe(-APPLE_REF_EPOCH_SECONDS)
  })

  it('resultado é um NÚMERO plausível (não string, não ~1.7e9 de 1970)', () => {
    const v = dateToAppleRefSeconds('2026-07-14T13:00:00.000Z')
    expect(typeof v).toBe('number')
    // seconds-since-2001 de 2026 ~ 8.0e8; seconds-since-1970 seria ~1.78e9
    expect(v!).toBeGreaterThan(7e8)
    expect(v!).toBeLessThan(9e8)
  })

  it('aceita ms epoch e segundos epoch', () => {
    const ms = Date.UTC(2001, 0, 1) // 2001-01-01 em ms
    expect(dateToAppleRefSeconds(ms)).toBe(0)
    expect(dateToAppleRefSeconds(ms / 1000)).toBe(0) // mesmo valor em segundos
  })

  it('inválido → null', () => {
    expect(dateToAppleRefSeconds(null)).toBeNull()
    expect(dateToAppleRefSeconds('não é data')).toBeNull()
  })
})

describe('normalizeContentStateDates', () => {
  it('converte endDate do content-state e preserva os outros campos', () => {
    const out = normalizeContentStateDates({
      endDate: '2001-01-01T00:00:00.000Z',
      targetSeconds: 0,
      isFinished: true,
    })
    expect(out.endDate).toBe(0)
    expect(out.targetSeconds).toBe(0)
    expect(out.isFinished).toBe(true)
  })

  it('content-state sem endDate (ex.: LA de treino) passa intacto', () => {
    const state = { currentExerciseName: 'Supino', totalVolumeKg: 1000 }
    expect(normalizeContentStateDates(state)).toEqual(state)
  })
})
