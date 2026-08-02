import { describe, it, expect } from 'vitest'
import { buildWeightTrend } from '@/utils/assessment/weightTrend'

describe('buildWeightTrend', () => {
  it('combina avaliações e check-ins numa série ordenada por data', () => {
    const assessments = [{ weight: '80', date: '2026-01-01' }]
    const checkins = [
      { created_at: '2026-01-10T08:00:00Z', answers: { body_weight_kg: 81 } },
      { created_at: '2026-01-05T08:00:00Z', answers: { body_weight_kg: 80.5 } },
    ]
    const pts = buildWeightTrend(checkins, assessments)
    expect(pts.map((p) => p.weightKg)).toEqual([80, 80.5, 81])
    expect(pts.map((p) => p.source)).toEqual(['assessment', 'checkin', 'checkin'])
  })

  it('lê o peso do check-in tanto de weight_kg quanto de answers.body_weight_kg', () => {
    const pts = buildWeightTrend(
      [
        { created_at: '2026-02-01T08:00:00Z', weight_kg: 90 },
        { created_at: '2026-02-02T08:00:00Z', answers: { body_weight_kg: '91,5' } },
      ],
      [],
    )
    expect(pts.map((p) => p.weightKg)).toEqual([90, 91.5])
  })

  it('no mesmo dia, a avaliação (medida formal) vence o check-in', () => {
    const pts = buildWeightTrend(
      [{ created_at: '2026-03-01T20:00:00Z', answers: { body_weight_kg: 88 } }],
      [{ weight: '87.5', date: '2026-03-01' }],
    )
    expect(pts).toHaveLength(1)
    expect(pts[0]).toMatchObject({ weightKg: 87.5, source: 'assessment' })
  })

  it('descarta peso inválido / fora da faixa (20–300) e datas ruins', () => {
    const pts = buildWeightTrend(
      [
        { created_at: '2026-04-01T08:00:00Z', answers: { body_weight_kg: 5 } },   // < 20
        { created_at: '2026-04-02T08:00:00Z', answers: { body_weight_kg: 400 } }, // > 300
        { created_at: 'lixo', answers: { body_weight_kg: 80 } },                  // data inválida
        { created_at: '2026-04-03T08:00:00Z', answers: {} },                      // sem peso
      ],
      [],
    )
    expect(pts).toHaveLength(0)
  })

  it('sem dados retorna vazio', () => {
    expect(buildWeightTrend([], [])).toEqual([])
    expect(buildWeightTrend(null as unknown as unknown[], undefined as unknown as unknown[])).toEqual([])
  })
})
