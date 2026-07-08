'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useGeoLocation } from './useGeoLocation'
import { isWithinRadius, findNearestGym } from '@/utils/geoUtils'
import { logWarn } from '@/lib/logger'

interface Gym {
  id: string
  name: string
  latitude: number
  longitude: number
  radius_meters: number
  is_primary: boolean
}

interface GymCheckinState {
  /** Detected gym (null if not near any) */
  detectedGym: Gym | null
  /** Distance to detected gym in meters */
  distanceToGym: number | null
  /** Whether check-in was already performed this session */
  checkedIn: boolean
  /** Loading state */
  loading: boolean
  /** Perform check-in for the detected gym */
  doCheckin: (workoutId?: string) => Promise<boolean>
  /** Dismiss the auto-detect toast */
  dismiss: () => void
  /** Whether the toast should be shown */
  showToast: boolean
  /** Refresh gym detection (re-read GPS) */
  refresh: () => Promise<void>
}

/**
 * Auto-detect gym e gestão de check-ins.
 * Só roda se o usuário tem gps_enabled + auto_checkin nos settings.
 *
 * Persistência da flag de "já mostrei o toast"
 * ────────────────────────────────────────────
 * Antes ficava em useRef (memória apenas), o que fazia o toast voltar
 * a aparecer após F5 / pull-to-refresh — gerando double-tap fácil.
 * Agora a flag é persistida em localStorage no formato:
 *   `irontracks.gymCheckedIn.v1.{gymId}.{YYYY-MM-DD}`
 * Reset diário (chave do dia BRT atual) faz com que voltando no
 * gym amanhã o toast aparece de novo, mas no MESMO dia ele fica suprimido.
 */
const HAS_CHECKED_PREFIX = 'irontracks.gymCheckedIn.v1'

const todayKeyBrt = (): string => {
  // YYYY-MM-DD em fuso São Paulo. Mesma estratégia usada nos crons.
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

const buildCheckinKey = (gymId: string): string =>
  `${HAS_CHECKED_PREFIX}.${gymId}.${todayKeyBrt()}`

const wasAlreadyChecked = (gymId: string): boolean => {
  if (typeof window === 'undefined') return false
  try { return window.localStorage.getItem(buildCheckinKey(gymId)) === '1' } catch { return false }
}

const markChecked = (gymId: string): void => {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(buildCheckinKey(gymId), '1') } catch (e) { logWarn('useGymCheckin', 'localStorage setItem failed', e) }
}

export function useGymCheckin(
  userId: string | undefined,
  supabase: ReturnType<typeof import('@/utils/supabase/client').createClient> | null,
  locationEnabled: boolean,
): GymCheckinState {
  const { position, getCurrentPosition } = useGeoLocation()
  const [gyms, setGyms] = useState<Gym[]>([])
  const [detectedGym, setDetectedGym] = useState<Gym | null>(null)
  const [distanceToGym, setDistanceToGym] = useState<number | null>(null)
  const [checkedIn, setCheckedIn] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showToast, setShowToast] = useState(false)
  // Mantido pra evitar re-deteccao na mesma sessão depois de detectar
  // uma vez (não substitui o localStorage, complementa).
  const hasDetectedRef = useRef(false)

  // Load user gyms
  useEffect(() => {
    if (!userId || !supabase || !locationEnabled) return
    let cancelled = false
    const load = async () => {
      const { data } = await supabase
        .from('user_gyms')
        .select('id, name, latitude, longitude, radius_meters, is_primary')
        .eq('user_id', userId)
        .limit(20)
      if (!cancelled && data) setGyms(data as Gym[])
    }
    load()
    return () => { cancelled = true }
  }, [userId, supabase, locationEnabled])

  // Detect gym when position changes
  useEffect(() => {
    if (!position || gyms.length === 0 || hasDetectedRef.current) return

    const nearest = findNearestGym(position, gyms)
    if (nearest && isWithinRadius(position, nearest.gym, nearest.gym.radius_meters)) {
      setDetectedGym(nearest.gym)
      setDistanceToGym(Math.round(nearest.distance))
      hasDetectedRef.current = true
      // Suprime o toast se o usuário já fez check-in nesse gym hoje.
      // Sobrevive a F5 / pull-to-refresh / app sendo morto e relançado.
      if (wasAlreadyChecked(nearest.gym.id)) {
        setCheckedIn(true)
      } else {
        setShowToast(true)
      }
    }
  }, [position, gyms])

  // Auto-detect on mount
  useEffect(() => {
    if (!locationEnabled || gyms.length === 0 || hasDetectedRef.current) return
    getCurrentPosition()
  }, [locationEnabled, gyms.length, getCurrentPosition])

  const doCheckin = useCallback(async (workoutId?: string): Promise<boolean> => {
    if (!userId || !detectedGym || !position) return false
    setLoading(true)
    try {
      // Chama o endpoint em vez de inserir direto na tabela. O server
      // aplica rate limit, anti-duplicata (5 min) e validação de
      // accuracy do GPS — coisa que não dava pra confiar fazendo
      // .from('gym_checkins').insert() do client.
      const res = await fetch('/api/gps/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gym_id: detectedGym.id,
          workout_id: workoutId || undefined,
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: typeof position.accuracyMeters === 'number'
            ? position.accuracyMeters
            : undefined,
        }),
      })

      const json = await res.json().catch(() => null) as
        | { ok: true; checkin?: unknown; duplicate?: boolean }
        | { ok: false; error: string; message?: string }
        | null

      if (!json) return false

      // duplicate=true também conta como sucesso na UI — o usuário
      // tentou de novo dentro de 5 min, o server foi idempotente, e
      // o toast some normalmente.
      if (!res.ok || !json.ok) {
        // gps_inaccurate vira warning visível ao caller via return
        // false; o componente decide o feedback (toast / alert).
        if ((json as { error?: string }).error === 'gps_inaccurate') {
          logWarn('useGymCheckin', 'gps inaccurate', json)
        }
        return false
      }

      markChecked(detectedGym.id)
      setCheckedIn(true)
      setShowToast(false)
      return true
    } catch (e) {
      logWarn('useGymCheckin', 'doCheckin failed', e)
      return false
    } finally {
      setLoading(false)
    }
  }, [userId, detectedGym, position])

  const dismiss = useCallback(() => {
    setShowToast(false)
  }, [])

  const refresh = useCallback(async () => {
    hasDetectedRef.current = false
    setDetectedGym(null)
    setDistanceToGym(null)
    setShowToast(false)
    setCheckedIn(false)
    await getCurrentPosition()
  }, [getCurrentPosition])

  return { detectedGym, distanceToGym, checkedIn, loading, doCheckin, dismiss, showToast, refresh }
}
