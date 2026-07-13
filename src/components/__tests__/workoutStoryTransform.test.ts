import { describe, it, expect } from 'vitest'
import {
  CANVAS_W,
  clampWorkoutScale,
  clampWorkoutOffset,
  pinchToWorkoutTransform,
  panToWorkoutOffset,
  WORKOUT_MIN_SCALE,
  WORKOUT_MAX_SCALE,
  type WorkoutGestureStart,
} from '../storyComposerUtils'

const gestureAt = (partial: Partial<WorkoutGestureStart>): WorkoutGestureStart => ({
  startOffsetX: 0,
  startOffsetY: 0,
  startScale: 1,
  startDist: 100,
  startMidX: 0,
  startMidY: 0,
  startX: 0,
  startY: 0,
  ...partial,
})

describe('clampWorkoutScale', () => {
  it('limita ao intervalo [0.4, 3]', () => {
    expect(clampWorkoutScale(0.1)).toBe(WORKOUT_MIN_SCALE)
    expect(clampWorkoutScale(10)).toBe(WORKOUT_MAX_SCALE)
    expect(clampWorkoutScale(1.5)).toBe(1.5)
  })
  it('NaN → 1 (neutro)', () => {
    expect(clampWorkoutScale(Number.NaN)).toBe(1)
  })
})

describe('clampWorkoutOffset', () => {
  it('limita a ±CANVAS_W', () => {
    expect(clampWorkoutOffset(CANVAS_W + 500)).toBe(CANVAS_W)
    expect(clampWorkoutOffset(-CANVAS_W - 500)).toBe(-CANVAS_W)
    expect(clampWorkoutOffset(120)).toBe(120)
  })
})

describe('pinchToWorkoutTransform', () => {
  it('afastar os dedos (2x a distância) → escala 2x', () => {
    const g = gestureAt({ startScale: 1, startDist: 100 })
    const r = pinchToWorkoutTransform(g, 200, 0, 0, 1)
    expect(r.scale).toBeCloseTo(2, 5)
  })
  it('aproximar os dedos (metade) → escala 0.5x', () => {
    const g = gestureAt({ startScale: 1, startDist: 100 })
    const r = pinchToWorkoutTransform(g, 50, 0, 0, 1)
    expect(r.scale).toBeCloseTo(0.5, 5)
  })
  it('respeita o teto de escala (3x)', () => {
    const g = gestureAt({ startScale: 2, startDist: 100 })
    const r = pinchToWorkoutTransform(g, 1000, 0, 0, 1)
    expect(r.scale).toBe(WORKOUT_MAX_SCALE)
  })
  it('move junto pelo ponto médio (com fator tela→canvas)', () => {
    const g = gestureAt({ startOffsetX: 0, startMidX: 0, startDist: 100, startScale: 1 })
    const r = pinchToWorkoutTransform(g, 100, 30, 0, 2) // mid andou 30px na tela, fator 2
    expect(r.offsetX).toBeCloseTo(60, 5)
  })
})

describe('panToWorkoutOffset', () => {
  it('arrastar 1 dedo move o offset (× fator)', () => {
    const g = gestureAt({ startOffsetX: 10, startOffsetY: 20, startX: 0, startY: 0 })
    const r = panToWorkoutOffset(g, 50, 40, 1.5)
    expect(r.offsetX).toBeCloseTo(10 + 50 * 1.5, 5)
    expect(r.offsetY).toBeCloseTo(20 + 40 * 1.5, 5)
  })
  it('offset é limitado a ±CANVAS_W', () => {
    const g = gestureAt({ startOffsetX: CANVAS_W - 10, startX: 0 })
    const r = panToWorkoutOffset(g, 1000, 0, 5)
    expect(r.offsetX).toBe(CANVAS_W)
  })
})
