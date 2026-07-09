import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseSearchParams } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
})

interface GymResult { name: string; display: string; lat: number; lon: number }

/**
 * Busca de academias por nome. Usa Google Places (New) quando GOOGLE_PLACES_API_KEY
 * está configurada (acha praticamente qualquer academia perto de você); senão cai
 * pro OpenStreetMap/Nominatim (grátis, mas cobre menos). A chave fica NO SERVIDOR
 * — nunca é exposta no cliente. O app chama sempre esta rota.
 */

async function searchGooglePlaces(key: string, q: string, lat?: number, lng?: number): Promise<GymResult[]> {
  const body: Record<string, unknown> = {
    textQuery: q,
    languageCode: 'pt-BR',
    maxResultCount: 8,
    // Enviesa o texto pra academias.
    includedType: 'gym',
  }
  if (typeof lat === 'number' && typeof lng === 'number') {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 30000 } }
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`places ${res.status}`)
  const data = await res.json()
  const places = Array.isArray(data?.places) ? data.places : []
  return places
    .map((p: Record<string, unknown>) => {
      const loc = p?.location as { latitude?: number; longitude?: number } | undefined
      const dn = p?.displayName as { text?: string } | undefined
      const lat2 = Number(loc?.latitude)
      const lon2 = Number(loc?.longitude)
      if (!Number.isFinite(lat2) || !Number.isFinite(lon2)) return null
      return {
        name: String(dn?.text || '').trim() || 'Academia',
        display: String(p?.formattedAddress || '').slice(0, 120),
        lat: lat2,
        lon: lon2,
      }
    })
    .filter(Boolean) as GymResult[]
}

async function searchNominatim(q: string, lat?: number, lng?: number): Promise<GymResult[]> {
  const params = new URLSearchParams({ format: 'json', q, limit: '12', addressdetails: '1' })
  if (typeof lat === 'number' && typeof lng === 'number') {
    const bias = 0.6
    params.set('viewbox', `${lng - bias},${lat + bias},${lng + bias},${lat - bias}`)
    params.set('bounded', '0')
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { 'Accept-Language': 'pt-BR', 'User-Agent': 'IronTracks/1.0 (contato@irontracks.com.br)' },
  })
  if (!res.ok) throw new Error(`nominatim ${res.status}`)
  const data = await res.json()
  return (Array.isArray(data) ? data : [])
    .filter((item: Record<string, unknown>) => item.lat && item.lon)
    .map((item: Record<string, unknown>) => ({
      name: String(item.name || item.display_name || '').split(',')[0].trim(),
      display: String(item.display_name || '').slice(0, 120),
      lat: parseFloat(String(item.lat)),
      lon: parseFloat(String(item.lon)),
    }))
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`gyms:search:${auth.user.id}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response
    const { q: query, lat, lng } = q!

    const key = String(process.env.GOOGLE_PLACES_API_KEY || '').trim()
    let results: GymResult[] = []
    let source: 'google' | 'osm' = 'osm'

    if (key) {
      try {
        results = await searchGooglePlaces(key, query, lat, lng)
        source = 'google'
      } catch (e) {
        // Falha do Places (cota, chave inválida) → cai pro OSM em vez de quebrar.
        logError('api:gyms:search:google', e)
        results = await searchNominatim(query, lat, lng)
        source = 'osm'
      }
    } else {
      results = await searchNominatim(query, lat, lng)
    }

    return NextResponse.json({ ok: true, source, results })
  } catch (e) {
    logError('api:gyms:search', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
