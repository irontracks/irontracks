/**
 * Geo utility functions for distance, bearing, and proximity calculations.
 * Uses the Haversine formula for accuracy at short distances.
 */

export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface GeoTrackPoint extends GeoPoint {
  timestamp: number
  altitude?: number
  speed?: number
}

const EARTH_RADIUS_METERS = 6_371_000

/** Degrees → radians */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Haversine distance between two points, in meters.
 * Accurate for short distances (gym detection, city-level).
 */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLng * sinLng
  // Clamp defensivo: erro de float pode fazer √h passar de 1 (pontos ~antipodais),
  // e Math.asin(>1) = NaN. Nunca acontece entre fixes de cardio (metros), mas
  // evita um NaN vazar pra distância/pace se a função for usada com pontos longe.
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Check if a point is within a radius (meters) of a center point.
 */
export function isWithinRadius(point: GeoPoint, center: GeoPoint, radiusMeters: number): boolean {
  return haversineDistance(point, center) <= radiusMeters
}

/**
 * Calculate total distance from an array of track points, in meters.
 */
export function totalTrackDistance(points: GeoTrackPoint[]): number {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(points[i - 1], points[i])
  }
  return total
}

/**
 * Calculate average pace (min/km) from distance (meters) and duration (seconds).
 * Returns null if distance is zero.
 */
export function avgPaceMinKm(distanceMeters: number, durationSeconds: number): number | null {
  if (distanceMeters <= 0) return null
  const km = distanceMeters / 1000
  const minutes = durationSeconds / 60
  return minutes / km
}

/**
 * Calculate speed in km/h from distance (meters) and duration (seconds).
 * Returns 0 if duration is zero.
 */
export function speedKmh(distanceMeters: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0
  return (distanceMeters / 1000) / (durationSeconds / 3600)
}

/**
 * Format pace (min/km) as "M:SS" string.
 */
export function formatPace(paceMinKm: number | null): string {
  if (paceMinKm === null || !Number.isFinite(paceMinKm) || paceMinKm <= 0) return '--:--'
  // Pace acima de 60 min/km (< 1 km/h) não é ritmo real de corrida/caminhada — é o
  // artefato de distância ~0 (parado esperando o GPS). Mostra "--:--" em vez de
  // valores absurdos tipo "1885:36/km".
  if (paceMinKm > 60) return '--:--'
  let mins = Math.floor(paceMinKm)
  let secs = Math.round((paceMinKm - mins) * 60)
  // Carry: 59,94 s arredonda pra 60 → mostrava "4:60" (formato impossível).
  // Sobe pro minuto seguinte: "5:00".
  if (secs === 60) { secs = 0; mins += 1 }
  return `${mins}:${String(secs).padStart(2, '0')}`
}

/**
 * Format distance in meters to a human-readable string.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(2)}km`
}

/**
 * Find the nearest gym from a list, returning gym and distance.
 */
export function findNearestGym<T extends GeoPoint & { id: string; name: string; radius_meters: number }>(
  position: GeoPoint,
  gyms: T[],
): { gym: T; distance: number } | null {
  if (gyms.length === 0) return null
  let nearest: { gym: T; distance: number } | null = null
  for (const gym of gyms) {
    const dist = haversineDistance(position, gym)
    if (!nearest || dist < nearest.distance) {
      nearest = { gym, distance: dist }
    }
  }
  return nearest
}
