import { describe, it, expect } from 'vitest'
import { formatSetSummary } from '../formatSetSummary'

describe('formatSetSummary', () => {
  it('Prancha com duration_seconds novo formato: "60s × 82 kg"', () => {
    const out = formatSetSummary(
      { weight: 82, reps: null, duration_seconds: 60 },
      { name: 'Prancha' },
    )
    expect(out).toBe('60s × 82 kg')
  })

  it('Prancha legado (reps="60", duration_seconds=null): fallback para reps como segundos', () => {
    const out = formatSetSummary(
      { weight: 82, reps: '60', duration_seconds: null },
      { name: 'Prancha' },
    )
    expect(out).toBe('60s × 82 kg')
  })

  it('Prancha sem peso: apenas "60s"', () => {
    const out = formatSetSummary(
      { weight: null, reps: null, duration_seconds: 60 },
      { name: 'Prancha' },
    )
    expect(out).toBe('60s')
  })

  it('Supino (não-prancha): "10 × 80 kg"', () => {
    const out = formatSetSummary(
      { weight: 80, reps: '10', duration_seconds: null },
      { name: 'Supino reto' },
    )
    expect(out).toBe('10 × 80 kg')
  })

  it('Supino sem peso: "10"', () => {
    const out = formatSetSummary(
      { weight: null, reps: '10', duration_seconds: null },
      { name: 'Supino reto' },
    )
    expect(out).toBe('10')
  })

  it('Set vazio retorna string vazia', () => {
    expect(formatSetSummary({ weight: null, reps: null, duration_seconds: null }, { name: 'Supino reto' })).toBe('')
  })
})
