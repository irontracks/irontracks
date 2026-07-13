import { describe, it, expect } from 'vitest'
import {
  projectRoutePoints,
  formatKm,
  formatClock,
  formatPaceMinKm,
  activityLabel,
  cardioToContent,
} from '../cardioStory'

const BOX = { x: 0, y: 0, w: 600, h: 400 }

describe('projectRoutePoints', () => {
  it('retorna [] com menos de 2 pontos válidos', () => {
    expect(projectRoutePoints([], BOX)).toEqual([])
    expect(projectRoutePoints([{ lat: -25, lng: -49 }], BOX)).toEqual([])
  })

  it('retorna [] quando todos os pontos são iguais', () => {
    const same = [
      { lat: -25.4, lng: -49.2 },
      { lat: -25.4, lng: -49.2 },
    ]
    expect(projectRoutePoints(same, BOX)).toEqual([])
  })

  it('ignora pontos com lat/lng inválidos', () => {
    const r = projectRoutePoints(
      [
        { lat: -25.0, lng: -49.0 },
        { lat: Number.NaN, lng: -49.1 },
        { lat: -25.1, lng: -49.1 },
      ],
      BOX,
    )
    expect(r).toHaveLength(2)
  })

  it('mantém tudo dentro do box (com padding)', () => {
    const route = [
      { lat: -25.0, lng: -49.0 },
      { lat: -25.05, lng: -49.03 },
      { lat: -25.1, lng: -49.1 },
      { lat: -25.02, lng: -49.08 },
    ]
    const pts = projectRoutePoints(route, BOX, 26)
    expect(pts.length).toBe(4)
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(BOX.x + 26 - 0.001)
      expect(p.x).toBeLessThanOrEqual(BOX.x + BOX.w - 26 + 0.001)
      expect(p.y).toBeGreaterThanOrEqual(BOX.y + 26 - 0.001)
      expect(p.y).toBeLessThanOrEqual(BOX.y + BOX.h - 26 + 0.001)
    }
  })

  it('norte pra cima: latitude MAIOR → y MENOR', () => {
    const pts = projectRoutePoints(
      [
        { lat: -25.0, lng: -49.0 }, // mais ao norte (lat maior)
        { lat: -25.2, lng: -49.0 }, // mais ao sul
      ],
      BOX,
    )
    expect(pts[0].y).toBeLessThan(pts[1].y)
  })

  it('linha horizontal (mesma lat) → y aproximadamente constante', () => {
    const pts = projectRoutePoints(
      [
        { lat: -25.0, lng: -49.2 }, // oeste (lng menor) → esquerda
        { lat: -25.0, lng: -49.0 }, // leste (lng maior) → direita
      ],
      BOX,
    )
    expect(Math.abs(pts[0].y - pts[1].y)).toBeLessThan(0.001)
    expect(pts[1].x).toBeGreaterThan(pts[0].x)
  })
})

describe('formatação', () => {
  it('formatKm', () => {
    expect(formatKm(8420)).toBe('8,42 km')
    expect(formatKm(0)).toBe('0,00 km')
    expect(formatKm(1000)).toBe('1,00 km')
  })
  it('formatClock', () => {
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(3661)).toBe('1:01:01')
    expect(formatClock(0)).toBe('0:00')
  })
  it('formatPaceMinKm', () => {
    expect(formatPaceMinKm(5.5)).toBe('5:30')
    expect(formatPaceMinKm(null)).toBe('—')
    expect(formatPaceMinKm(0)).toBe('—')
  })
  it('activityLabel', () => {
    expect(activityLabel('running')).toBe('Corrida')
    expect(activityLabel('walking')).toBe('Caminhada')
    expect(activityLabel('cycling')).toBe('Pedal')
    expect(activityLabel('swimming')).toBe('Cardio')
    expect(activityLabel(null)).toBe('Cardio')
  })
})

describe('cardioToContent', () => {
  it('mapeia latitude/longitude → lat/lng e filtra inválidos', () => {
    const c = cardioToContent({
      activityType: 'running',
      distanceMeters: 5000,
      durationSeconds: 1500,
      paceMinKm: 5,
      caloriesEstimated: 320,
      route: [
        { latitude: -25.0, longitude: -49.0 },
        { latitude: 'x' as unknown as number, longitude: -49.1 },
        { lat: -25.1, lng: -49.1 },
      ],
      date: new Date('2026-07-13T10:00:00'),
    })
    expect(c.route).toHaveLength(2)
    expect(c.route[0]).toEqual({ lat: -25.0, lng: -49.0 })
    expect(c.distanceMeters).toBe(5000)
    expect(c.activityType).toBe('running')
  })
})
