/**
 * matchGym — casa a academia favorita do geofence com uma linha de `user_gyms`.
 *
 * O app tem DOIS cadastros de academia que nunca conversaram:
 *  - o geofence nativo (iOS), cujo favorito mora em `user_settings.preferences`
 *    (`favoriteGymName` + `favoriteGymLat/Lng`);
 *  - as academias do Perfil, em `user_gyms`, que é o que `gym_checkins` referencia
 *    por FK e o que o Mapa de Treinos lê.
 *
 * Resultado medido em 03/08/2026: o geofence estava ATIVO e `gym_checkins` tinha
 * zero linhas em toda a produção — chegar na academia nunca virou check-in. Este
 * módulo é a ponte mínima: dado o favorito, acha a linha correspondente (ou diz
 * que precisa criar uma) para o check-in ter um `gym_id` válido.
 *
 * Função PURA de propósito — a decisão de "qual academia é esta" é testável sem
 * banco; o insert fica na rota.
 */

import { haversineDistance } from '@/utils/geoUtils'

/**
 * Raio para considerar que duas coordenadas são a MESMA academia.
 *
 * Maior que o raio do geofence (120 m) porque as duas origens de coordenada são
 * diferentes: o favorito é capturado por GPS de dentro do prédio, e a academia do
 * Perfil costuma vir do endereço do Google Places (fachada). 200 m cobre esse
 * desencontro sem juntar dois ginásios do mesmo quarteirão.
 */
export const SAME_GYM_RADIUS_METERS = 200

export interface GymRow {
  id: string
  name?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface FavoriteGymPoint {
  name: string
  lat: number
  lng: number
}

const normalizeName = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

const coordOf = (row: GymRow): { latitude: number; longitude: number } | null => {
  const lat = Number(row?.latitude)
  const lng = Number(row?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { latitude: lat, longitude: lng }
}

/**
 * Escolhe a linha de `user_gyms` que corresponde ao favorito do geofence.
 *
 * Proximidade ganha do nome: o nome do favorito é digitado à mão e vive errado
 * ("Minha academia" era o fallback de quem não digitou nada), enquanto a distância
 * é medida. O nome só desempata quando nenhuma coordenada está perto — assim uma
 * academia salva sem coordenada útil ainda casa.
 *
 * Devolve `null` quando nada corresponde: o chamador cria a linha.
 */
export function matchFavoriteGym(rows: GymRow[], favorite: FavoriteGymPoint): GymRow | null {
  const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r.id === 'string' && r.id) : []
  if (!list.length) return null
  if (!Number.isFinite(favorite?.lat) || !Number.isFinite(favorite?.lng)) return null

  const point = { latitude: favorite.lat, longitude: favorite.lng }

  let best: { row: GymRow; distance: number } | null = null
  for (const row of list) {
    const coords = coordOf(row)
    if (!coords) continue
    const distance = haversineDistance(point, coords)
    if (distance > SAME_GYM_RADIUS_METERS) continue
    if (!best || distance < best.distance) best = { row, distance }
  }
  if (best) return best.row

  const wanted = normalizeName(favorite.name)
  if (!wanted) return null
  return list.find((r) => normalizeName(r.name) === wanted) ?? null
}
