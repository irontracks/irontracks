/**
 * Pure helpers used by the Cardio GPS pipeline (useCardioTracking).
 *
 * Extracting these out of the hook lets us unit-test the filter decisions
 * directly, without needing to mock the React effect lifecycle or a full
 * Capacitor geolocation stream. Each helper is a small, deterministic
 * function — give it inputs, get a decision back.
 */

import { haversineDistance, speedKmh } from './geoUtils'
import type { GeoTrackPoint } from './geoUtils'

/** Configuration for the cardio filter pipeline. */
export interface CardioFilterConfig {
  /**
   * Maximum GPS accuracy (in meters) for a point to be recorded.
   * Points with accuracy > this are dropped as unreliable.
   */
  maxAccuracyMeters: number
  /**
   * Minimum movement (in meters) between consecutive recorded points.
   * Sub-threshold moves are GPS drift while standing still.
   */
  minMovementMeters: number
  /**
   * Speed cap in km/h — segments faster than this are treated as GPS spikes
   * and the offending point is dropped.
   */
  maxRealisticSpeedKmh: number
}

/** Decision the pipeline makes for each incoming fix. */
export type CardioFilterDecision =
  /** Fix is good — append to the track. */
  | { type: 'accept' }
  /** Fix is bad / GPS drift / spike — drop, keep old track. */
  | { type: 'reject'; reason: 'accuracy' | 'standing-still' | 'speed-spike' }

/** Minimal shape of an incoming fix used by the filter. */
export interface CardioIncomingFix extends GeoTrackPoint {
  accuracyMeters: number
}

/**
 * Decide whether an incoming GPS fix should be appended to the running track.
 *
 * Rules, in order:
 *   1. Accuracy gate: drop if accuracy > maxAccuracyMeters.
 *   2. Standing-still / drift: drop if movement from last point < minMovementMeters.
 *   3. Speed spike: drop if implied segment speed > maxRealisticSpeedKmh.
 *   4. Otherwise accept.
 *
 * The first point of a track (no previous point) is always accepted once
 * it passes the accuracy gate.
 */
export function decideCardioFilter(
  lastPoint: GeoTrackPoint | null,
  incoming: CardioIncomingFix,
  config: CardioFilterConfig,
): CardioFilterDecision {
  if (incoming.accuracyMeters > config.maxAccuracyMeters) {
    return { type: 'reject', reason: 'accuracy' }
  }

  if (lastPoint === null) {
    return { type: 'accept' }
  }

  const drift = haversineDistance(lastPoint, incoming)
  if (drift < config.minMovementMeters) {
    return { type: 'reject', reason: 'standing-still' }
  }

  const segTime = (incoming.timestamp - lastPoint.timestamp) / 1000
  if (segTime <= 0) {
    // Timestamps iguais ou relógio do device regredindo: não dá pra validar a
    // velocidade e o ponto já passou do limiar de movimento (drift ≥ mínimo),
    // então é um salto suspeito — rejeita em vez de aceitar cego.
    return { type: 'reject', reason: 'speed-spike' }
  }
  const segSpeed = speedKmh(drift, segTime)
  if (segSpeed > config.maxRealisticSpeedKmh) {
    return { type: 'reject', reason: 'speed-spike' }
  }

  return { type: 'accept' }
}

/**
 * Estimate calories burned using MET \u00d7 body weight \u00d7 time.
 *
 * MET tiers by speed:
 *   < 5 km/h  \u2192 walking slow  (MET 2.8)
 *   5\u20136 km/h  \u2192 walking brisk (MET 3.5)
 *   6\u20138 km/h  \u2192 fast walk     (MET 5.0)
 *   8\u201310 km/h \u2192 jogging       (MET 8.0)
 *  10\u201312 km/h \u2192 running       (MET 10.0)
 *  > 12 km/h  \u2192 fast running  (MET 11.5)
 */
export function estimateCardioCalories(
  distanceMeters: number,
  durationSeconds: number,
  bodyWeightKg = 75,
): number {
  if (distanceMeters <= 0 || durationSeconds <= 0) return 0
  const speed = speedKmh(distanceMeters, durationSeconds)
  const met =
    speed < 5 ? 2.8 :
    speed < 6 ? 3.5 :
    speed < 8 ? 5.0 :
    speed < 10 ? 8.0 :
    speed < 12 ? 10.0 : 11.5
  const durationHours = durationSeconds / 3600
  return Math.round(met * bodyWeightKg * durationHours)
}
