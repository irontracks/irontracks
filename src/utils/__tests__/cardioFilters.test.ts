import { describe, it, expect } from 'vitest'
import {
  decideCardioFilter,
  estimateCardioCalories,
  type CardioFilterConfig,
  type CardioIncomingFix,
} from '../cardioFilters'
import type { GeoTrackPoint } from '../geoUtils'

// Shared defaults matching the hook's production defaults so we test the
// same thresholds the user actually runs.
const CONFIG: CardioFilterConfig = {
  maxAccuracyMeters: 30,
  minMovementMeters: 5,
  maxRealisticSpeedKmh: 45,
}

// Origin point (S\u00e3o Paulo) used as the anchor for most tests.
const ORIGIN: GeoTrackPoint = {
  latitude: -23.5505,
  longitude: -46.6333,
  timestamp: 1_000_000,
}

/** Build an incoming fix offset a given number of meters north of ORIGIN. */
function fixMetersNorth(meters: number, opts: { secondsAfter?: number; accuracy?: number } = {}): CardioIncomingFix {
  // ~111_111 meters per latitude degree at the equator (good enough here).
  const deltaLat = meters / 111_111
  return {
    latitude: ORIGIN.latitude + deltaLat,
    longitude: ORIGIN.longitude,
    timestamp: ORIGIN.timestamp + (opts.secondsAfter ?? 1) * 1000,
    accuracyMeters: opts.accuracy ?? 10,
  }
}

describe('decideCardioFilter', () => {
  describe('accuracy gate', () => {
    it('rejects fix with accuracy worse than threshold', () => {
      const fix = fixMetersNorth(10, { accuracy: 100 })
      expect(decideCardioFilter(ORIGIN, fix, CONFIG)).toEqual({ type: 'reject', reason: 'accuracy' })
    })

    it('rejects first-ever fix if accuracy is too poor', () => {
      // Even with no previous point, a low-confidence fix should be dropped.
      const fix = fixMetersNorth(10, { accuracy: 500 })
      expect(decideCardioFilter(null, fix, CONFIG)).toEqual({ type: 'reject', reason: 'accuracy' })
    })

    it('accepts fix exactly at the accuracy threshold', () => {
      // Boundary: accuracy == maxAccuracyMeters should be allowed.
      const fix = fixMetersNorth(10, { accuracy: CONFIG.maxAccuracyMeters })
      expect(decideCardioFilter(ORIGIN, fix, CONFIG).type).toBe('accept')
    })
  })

  describe('first point of the track', () => {
    it('accepts first point when accuracy is good', () => {
      const fix = fixMetersNorth(0, { accuracy: 5 })
      expect(decideCardioFilter(null, fix, CONFIG)).toEqual({ type: 'accept' })
    })
  })

  describe('standing-still / drift filter', () => {
    it('rejects a fix that moved less than the drift threshold', () => {
      const fix = fixMetersNorth(2, { accuracy: 8 })
      expect(decideCardioFilter(ORIGIN, fix, CONFIG)).toEqual({ type: 'reject', reason: 'standing-still' })
    })

    it('accepts a fix that moved just over the drift threshold', () => {
      const fix = fixMetersNorth(6, { accuracy: 8 })
      expect(decideCardioFilter(ORIGIN, fix, CONFIG).type).toBe('accept')
    })
  })

  describe('speed spike filter', () => {
    it('rejects a segment faster than the realistic cap (car-speed GPS spike)', () => {
      // 200m jump in 1 second \u2192 720 km/h \u2014 obvious GPS spike.
      const fix = fixMetersNorth(200, { secondsAfter: 1, accuracy: 10 })
      expect(decideCardioFilter(ORIGIN, fix, CONFIG)).toEqual({ type: 'reject', reason: 'speed-spike' })
    })

    it('accepts a running-pace segment (12 km/h)', () => {
      // 12 km/h = 3.33 m/s \u2192 ~10m in 3s.
      const fix = fixMetersNorth(10, { secondsAfter: 3, accuracy: 8 })
      expect(decideCardioFilter(ORIGIN, fix, CONFIG).type).toBe('accept')
    })

    it('does not apply speed check when timestamp is identical (division by zero)', () => {
      // Some devices re-emit the same fix; treat the second as standing-still
      // rather than an infinite-speed spike.
      const fix = { ...fixMetersNorth(10, { accuracy: 8 }), timestamp: ORIGIN.timestamp }
      // 10m of movement in 0s \u2014 movement threshold accepts, but segTime<=0
      // means we skip speed check entirely. Expect accept.
      expect(decideCardioFilter(ORIGIN, fix, CONFIG).type).toBe('accept')
    })
  })

  describe('configuration is honoured', () => {
    it('respects a tighter maxAccuracyMeters', () => {
      const strict: CardioFilterConfig = { ...CONFIG, maxAccuracyMeters: 5 }
      const fix = fixMetersNorth(10, { accuracy: 10 })
      expect(decideCardioFilter(ORIGIN, fix, strict).type).toBe('reject')
    })

    it('respects a looser minMovementMeters (e.g. casual walk)', () => {
      const loose: CardioFilterConfig = { ...CONFIG, minMovementMeters: 1 }
      const fix = fixMetersNorth(2, { accuracy: 8 })
      expect(decideCardioFilter(ORIGIN, fix, loose).type).toBe('accept')
    })
  })
})

describe('estimateCardioCalories', () => {
  it('returns 0 for zero distance or duration', () => {
    expect(estimateCardioCalories(0, 60)).toBe(0)
    expect(estimateCardioCalories(100, 0)).toBe(0)
  })

  it('estimates walking calories (4 km/h, 30 min, 75 kg)', () => {
    // MET 2.8 \u2192 2.8 * 75 * 0.5 = 105
    expect(estimateCardioCalories(2000, 30 * 60)).toBe(105)
  })

  it('estimates jogging calories (9 km/h, 30 min, 75 kg)', () => {
    // MET 8.0 \u2192 8.0 * 75 * 0.5 = 300
    expect(estimateCardioCalories(4500, 30 * 60)).toBe(300)
  })

  it('estimates fast running calories (13 km/h, 20 min, 80 kg)', () => {
    // MET 11.5 \u2192 11.5 * 80 * (1200/3600) = 306.67 \u2192 307
    const distance = (13 * 1000 / 3600) * 1200 // m in 20 min at 13km/h
    expect(estimateCardioCalories(distance, 1200, 80)).toBe(307)
  })

  it('defaults body weight to 75 kg when omitted', () => {
    // 6.5 km/h (MET 5 \u2014 fast walk tier) for 1 hour at 75 kg \u2192 5 * 75 * 1 = 375
    expect(estimateCardioCalories(6500, 3600)).toBe(375)
  })
})
