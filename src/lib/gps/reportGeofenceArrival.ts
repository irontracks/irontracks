/**
 * reportGeofenceArrival — transforma "cheguei na academia" em check-in gravado.
 *
 * O geofence do iOS avisa a chegada por dois caminhos, e os DOIS passam por aqui:
 *  1. evento `gymGeofenceEntered`, quando o app está rodando;
 *  2. toque na notificação local, quando o app estava fechado — o plugin de push do
 *     Capacitor entrega notificação local também, com `type: 'gym_geofence'`.
 *
 * Antes nenhum dos dois gravava nada: a seção se chama "Auto Check-in" e nunca
 * houve check-in. Em 03/08/2026 o geofence estava ativo e `gym_checkins` tinha zero
 * linhas em toda a produção.
 *
 * A janela de 5 min quem aplica é o servidor — chamar duas vezes (evento + toque)
 * é esperado e devolve `duplicate: true`, não um segundo registro.
 */

import { logWarnRemote } from '@/lib/logger'

export interface GeofenceArrival {
  name: string
  lat: number
  lng: number
}

export interface GeofenceArrivalResult {
  ok: boolean
  duplicate?: boolean
  createdGym?: boolean
}

/**
 * Envia o check-in de chegada. Nunca lança: é chamado de listeners, e uma exceção
 * aqui derrubaria o handler inteiro. Falha vira warning pesquisável no Sentry —
 * este caminho já morreu em silêncio uma vez e ninguém percebeu por meses.
 */
export async function reportGeofenceArrival(arrival: GeofenceArrival | null): Promise<GeofenceArrivalResult> {
  const name = String(arrival?.name ?? '').trim()
  const lat = Number(arrival?.lat)
  const lng = Number(arrival?.lng)
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    logWarnRemote('gps.geofence.arrival-incomplete', 'chegada sem academia favorita utilizável', { hasName: !!name })
    return { ok: false }
  }

  try {
    const res = await fetch('/api/gps/geofence-checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: name.slice(0, 60), latitude: lat, longitude: lng }),
    })
    const json = (await res.json().catch(() => null)) as GeofenceArrivalResult | null
    if (!res.ok || !json?.ok) {
      logWarnRemote('gps.geofence.checkin-failed', 'check-in de chegada recusado pelo servidor', {
        status: res.status,
      })
      return { ok: false }
    }
    return json
  } catch {
    logWarnRemote('gps.geofence.checkin-error', 'falha de rede ao gravar check-in de chegada', {})
    return { ok: false }
  }
}
