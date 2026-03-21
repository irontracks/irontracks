import { describe, it, expect } from 'vitest'
import {
  haversineDistance,
  isWithinRadius,
  totalTrackDistance,
  avgPaceMinKm,
  speedKmh,
  formatPace,
  formatDistance,
  findNearestGym,
} from '../geoUtils'

describe('geoUtils', () => {
  // Known distance: Statue of Liberty → Empire State Building ≈ 8.26km
  const statueLibertyLL = { latitude: 40.6892, longitude: -74.0445 }
  const empireStateLL = { latitude: 40.7484, longitude: -73.9857 }

  // Known distance: two points ~100m apart
  const pointA = { latitude: -23.5505, longitude: -46.6333 } // São Paulo
  const pointB = { latitude: -23.5514, longitude: -46.6333 } // ~100m south

  describe('haversineDistance', () => {
    it('calculates distance between NYC landmarks (~8.2km)', () => {
      const dist = haversineDistance(statueLibertyLL, empireStateLL)
      expect(dist).toBeGreaterThan(8000)
      expect(dist).toBeLessThan(8500)
    })

    it('returns 0 for same point', () => {
      expect(haversineDistance(pointA, pointA)).toBe(0)
    })

    it('calculates short distances (~100m)', () => {
      const dist = haversineDistance(pointA, pointB)
      expect(dist).toBeGreaterThan(90)
      expect(dist).toBeLessThan(110)
    })
  })

  describe('isWithinRadius', () => {
    it('returns true when point is within radius', () => {
      expect(isWithinRadius(pointB, pointA, 200)).toBe(true)
    })

    it('returns false when point is outside radius', () => {
      expect(isWithinRadius(empireStateLL, statueLibertyLL, 1000)).toBe(false)
    })

    it('edge case: exactly at radius boundary', () => {
      const dist = haversineDistance(pointA, pointB)
      expect(isWithinRadius(pointB, pointA, dist)).toBe(true)
    })
  })

  describe('totalTrackDistance', () => {
    it('calculates total distance from track points', () => {
      const points = [
        { ...pointA, timestamp: 0 },
        { ...pointB, timestamp: 60000 },
        { ...empireStateLL, timestamp: 120000 },
      ]
      const dist = totalTrackDistance(points)
      expect(dist).toBeGreaterThan(0)
    })

    it('returns 0 for empty or single-point track', () => {
      expect(totalTrackDistance([])).toBe(0)
      expect(totalTrackDistance([{ ...pointA, timestamp: 0 }])).toBe(0)
    })
  })

  describe('avgPaceMinKm', () => {
    it('calculates pace for 5km in 25 minutes → 5:00/km', () => {
      const pace = avgPaceMinKm(5000, 25 * 60)
      expect(pace).toBeCloseTo(5.0, 1)
    })

    it('returns null for zero distance', () => {
      expect(avgPaceMinKm(0, 300)).toBeNull()
    })
  })

  describe('speedKmh', () => {
    it('calculates speed for 10km in 1 hour → 10 km/h', () => {
      expect(speedKmh(10000, 3600)).toBeCloseTo(10.0, 1)
    })

    it('returns 0 for zero duration', () => {
      expect(speedKmh(1000, 0)).toBe(0)
    })
  })

  describe('formatPace', () => {
    it('formats 5.0 min/km as "5:00"', () => {
      expect(formatPace(5.0)).toBe('5:00')
    })

    it('formats 4.5 min/km as "4:30"', () => {
      expect(formatPace(4.5)).toBe('4:30')
    })

    it('returns --:-- for null', () => {
      expect(formatPace(null)).toBe('--:--')
    })
  })

  describe('formatDistance', () => {
    it('formats meters below 1000', () => {
      expect(formatDistance(500)).toBe('500m')
    })

    it('formats kilometers', () => {
      expect(formatDistance(5000)).toBe('5.00km')
      expect(formatDistance(10500)).toBe('10.50km')
    })
  })

  describe('findNearestGym', () => {
    const gyms = [
      { id: '1', name: 'Gym A', latitude: pointA.latitude, longitude: pointA.longitude, radius_meters: 100 },
      { id: '2', name: 'Gym B', latitude: empireStateLL.latitude, longitude: empireStateLL.longitude, radius_meters: 100 },
    ]

    it('finds nearest gym', () => {
      const result = findNearestGym(pointB, gyms)
      expect(result?.gym.name).toBe('Gym A')
      expect(result?.distance).toBeLessThan(200)
    })

    it('returns null for empty gym list', () => {
      expect(findNearestGym(pointA, [])).toBeNull()
    })
  })
})
