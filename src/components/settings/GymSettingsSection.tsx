'use client'

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useGeoLocation } from '@/hooks/useGeoLocation'
import { haversineDistance } from '@/utils/geoUtils'
import { logError } from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

const GymQRCode = lazy(() => import('@/components/GymQRCode'))

interface Gym {
  id: string
  name: string
  latitude: number
  longitude: number
  radius_meters: number
  is_primary: boolean
}

interface LocationSettings {
  gps_enabled: boolean
  auto_checkin: boolean
  share_gym_presence: boolean
  show_on_gym_leaderboard: boolean
}

interface GymSettingsSectionProps {
  userId: string
  supabase: SupabaseClient
}

interface GymSuggestion {
  name: string
  display: string
  lat: number
  lon: number
  /** Distância até o usuário (km), quando o GPS está disponível. */
  distanceKm?: number | null
}

export default function GymSettingsSection({ userId, supabase }: GymSettingsSectionProps) {
  const { getCurrentPosition, position, status: geoStatus, error: geoError } = useGeoLocation()
  // Preserve the legacy `loading` boolean semantics for the downstream UI —
  // the hook now exposes a richer `status` state machine, but this section
  // only cares about "is the GPS busy acquiring".
  const geoLoading = geoStatus === 'requesting-permission' || geoStatus === 'acquiring'
  const [gyms, setGyms] = useState<Gym[]>([])
  const [qrGym, setQrGym] = useState<{ id: string; name: string } | null>(null)
  const [settings, setSettings] = useState<LocationSettings>({
    gps_enabled: false,
    auto_checkin: false,
    share_gym_presence: false,
    show_on_gym_leaderboard: false,
  })
  const [loading, setLoading] = useState(true)
  const [addingGym, setAddingGym] = useState(false)
  const [newGymName, setNewGymName] = useState('')
  const [saving, setSaving] = useState(false)
  // Mensagem de erro das ações (add/remove/toggle/principal). Antes as escritas
  // eram otimistas e engoliam falhas — a UI dizia "salvo" mesmo com erro.
  const [actionError, setActionError] = useState<string | null>(null)

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<GymSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<GymSuggestion | null>(null)
  const [searchingGyms, setSearchingGyms] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load gyms & settings
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [{ data: gymsData }, { data: settingsData }] = await Promise.allSettled([
        supabase.from('user_gyms').select('*').eq('user_id', userId).order('is_primary', { ascending: false }).limit(20),
        supabase.from('user_location_settings').select('*').eq('user_id', userId).maybeSingle(),
      ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : { data: null })) as [
        { data: Gym[] | null },
        { data: LocationSettings | null },
      ]
      if (cancelled) return
      if (gymsData) setGyms(gymsData)
      if (settingsData) setSettings(settingsData)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [userId, supabase])

  // Search gyms via Nominatim (OpenStreetMap) — debounced
  const searchGyms = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    setSearchingGyms(true)
    try {
      // Chama a rota do servidor: usa Google Places (acha quase qualquer academia)
      // quando a chave está configurada; senão cai no OpenStreetMap. A chave fica
      // NO SERVIDOR — nunca exposta aqui. Manda a localização pra enviesar por
      // proximidade; a ordenação/rótulo de distância continua sendo feita aqui.
      const params = new URLSearchParams({ q: query.trim() })
      if (position) {
        params.set('lat', String(position.latitude))
        params.set('lng', String(position.longitude))
      }

      const res = await fetch(`/api/gyms/search?${params.toString()}`, { credentials: 'include' })
      const json = await res.json().catch(() => null)
      const raw: unknown[] = json && Array.isArray(json.results) ? json.results : []

      let results: GymSuggestion[] = raw
        .map((item) => {
          const r = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
          const lat = Number(r.lat)
          const lon = Number(r.lon)
          const distanceKm = position && Number.isFinite(lat) && Number.isFinite(lon)
            ? haversineDistance({ latitude: position.latitude, longitude: position.longitude }, { latitude: lat, longitude: lon }) / 1000
            : null
          return {
            name: String(r.name || '').trim(),
            display: String(r.display || '').slice(0, 120),
            lat,
            lon,
            distanceKm,
          }
        })
        .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))

      // Com GPS: prioriza o que está PERTO (a filial certa vem primeiro) e
      // descarta resultados absurdamente longe (outra cidade/país).
      if (position) {
        results = results
          .filter((r) => r.distanceKm == null || r.distanceKm <= 150)
          .sort((a, b) => (a.distanceKm ?? Number.MAX_SAFE_INTEGER) - (b.distanceKm ?? Number.MAX_SAFE_INTEGER))
      }
      results = results.slice(0, 6)

      setSuggestions(results)
      setShowSuggestions(results.length > 0)
    } catch {
      setSuggestions([])
      setShowSuggestions(false)
    }
    setSearchingGyms(false)
  }, [position])

  // Handle input change with debounce
  const handleNameChange = useCallback((value: string) => {
    setNewGymName(value)
    setSelectedSuggestion(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      searchGyms(value)
    }, 600) // respeita a política do Nominatim (~1 req/s)
  }, [searchGyms])

  // Abre o formulário de adicionar E já pega o GPS, pra a busca por nome poder
  // enviesar pela sua localização (senão a 1ª busca sai sem posição = global).
  const handleOpenAddGym = useCallback(() => {
    setAddingGym(true)
    void getCurrentPosition().catch(() => { })
  }, [getCurrentPosition])

  // Select a suggestion
  const selectSuggestion = useCallback((suggestion: GymSuggestion) => {
    setNewGymName(suggestion.name)
    setSelectedSuggestion(suggestion)
    setShowSuggestions(false)
    setSuggestions([])
  }, [])

  // Toggle setting
  const toggleSetting = useCallback(async (key: keyof LocationSettings) => {
    const newVal = !settings[key]
    setActionError(null)
    setSettings(prev => ({ ...prev, [key]: newVal }))
    const { error } = await supabase.from('user_location_settings').upsert(
      { user_id: userId, [key]: newVal, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    if (error) {
      // Reverte o otimismo e avisa — antes ficava "ligado" na tela sem gravar.
      logError('component:GymSettingsSection.toggleSetting', error)
      setSettings(prev => ({ ...prev, [key]: !newVal }))
      setActionError('Não foi possível salvar a preferência. Tente novamente.')
    }
  }, [settings, supabase, userId])

  // Add gym — use selected suggestion coords or current GPS position
  const addGym = useCallback(async () => {
    if (!newGymName.trim()) return
    setActionError(null)
    setSaving(true)

    let lat: number
    let lon: number

    if (selectedSuggestion) {
      // Use coordinates from the autocomplete suggestion
      lat = selectedSuggestion.lat
      lon = selectedSuggestion.lon
    } else {
      // Fallback: use current GPS position
      const pos = await getCurrentPosition()
      if (!pos) {
        setSaving(false)
        return
      }
      lat = pos.latitude
      lon = pos.longitude
    }

    const { data, error } = await supabase.from('user_gyms').insert({
      user_id: userId,
      name: newGymName.trim(),
      latitude: lat,
      longitude: lon,
      radius_meters: 100,
      is_primary: gyms.length === 0,
    }).select().single()

    if (!error && data) {
      setGyms(prev => [...prev, data as Gym])
      setNewGymName('')
      setAddingGym(false)
      setSelectedSuggestion(null)
    } else if (error) {
      logError('component:GymSettingsSection.addGym', error)
      setActionError('Não foi possível adicionar a academia. Tente novamente.')
    }
    setSaving(false)
  }, [newGymName, selectedSuggestion, getCurrentPosition, supabase, userId, gyms.length])

  // Delete gym
  const deleteGym = useCallback(async (gymId: string) => {
    setActionError(null)
    // Guarda o estado atual pra reverter se a exclusão falhar no banco.
    const prevGyms = gyms
    setGyms(prev => prev.filter(g => g.id !== gymId))
    const { error } = await supabase.from('user_gyms').delete().eq('id', gymId).eq('user_id', userId)
    if (error) {
      logError('component:GymSettingsSection.deleteGym', error)
      setGyms(prevGyms)
      setActionError('Não foi possível remover a academia. Tente novamente.')
    }
  }, [gyms, supabase, userId])

  // Set primary
  const setPrimary = useCallback(async (gymId: string) => {
    setActionError(null)
    const prevGyms = gyms
    setGyms(prev => prev.map(g => ({ ...g, is_primary: g.id === gymId })))
    const clear = await supabase.from('user_gyms').update({ is_primary: false }).eq('user_id', userId)
    const set = clear.error
      ? clear
      : await supabase.from('user_gyms').update({ is_primary: true }).eq('id', gymId).eq('user_id', userId)
    if (set.error) {
      logError('component:GymSettingsSection.setPrimary', set.error)
      setGyms(prevGyms)
      setActionError('Não foi possível definir a academia principal. Tente novamente.')
    }
  }, [gyms, supabase, userId])

  if (loading) return <div className="animate-pulse h-20 rounded-xl bg-white/5" />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-lg">📍</span>
        <h3 className="text-base font-bold text-white">Localização & GPS</h3>
      </div>

      {actionError && (
        <div className="rounded-xl px-3 py-2 text-xs font-semibold text-red-300" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {actionError}
        </div>
      )}

      {/* Toggles */}
      <div className="space-y-3">
        {([
          { key: 'gps_enabled' as const, label: 'GPS ativado', desc: 'Detectar academia automaticamente' },
          { key: 'auto_checkin' as const, label: 'Check-in automático', desc: 'Registrar presença ao abrir o app na academia' },
          { key: 'share_gym_presence' as const, label: 'Compartilhar presença', desc: 'Amigos veem que você está treinando' },
          { key: 'show_on_gym_leaderboard' as const, label: 'Leaderboard da academia', desc: 'Aparecer no ranking da sua academia' },
        ]).map(({ key, label, desc }) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div>
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs text-white/40">{desc}</p>
            </div>
            <button
              onClick={() => toggleSetting(key)}
              aria-label={label}
              className={`relative h-6 w-11 rounded-full transition-colors ${settings[key] ? 'bg-amber-500' : 'bg-white/10'}`}
              role="switch"
              aria-checked={settings[key]}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings[key] ? 'translate-x-5' : ''}`}
              />
            </button>
          </div>
        ))}
      </div>

      {/* Gyms List */}
      {settings.gps_enabled && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white/70">Minhas Academias</p>
            <button
              onClick={handleOpenAddGym}
              className="rounded-lg px-3 py-1 text-xs font-medium transition-colors"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
            >
              + Adicionar
            </button>
          </div>

          {gyms.map(gym => (
            <div
              key={gym.id}
              className="flex items-center justify-between rounded-xl p-3"
              style={{
                background: gym.is_primary ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${gym.is_primary ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <div className="flex items-center gap-2">
                <span>{gym.is_primary ? '⭐' : '📍'}</span>
                <div>
                  <p className="text-sm font-medium text-white">{gym.name}</p>
                  <p className="text-xs text-white/30">Raio: {gym.radius_meters}m</p>
                </div>
              </div>
              <div className="flex gap-1">
                {!gym.is_primary && (
                  <button
                    onClick={() => setPrimary(gym.id)}
                    className="rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center text-sm text-white/40 hover:text-amber-400 transition-colors"
                    title="Definir como principal"
                    aria-label={`Definir ${gym.name} como academia principal`}
                  >
                    ⭐
                  </button>
                )}
                <button
                  onClick={() => setQrGym({ id: gym.id, name: gym.name })}
                  className="rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center text-sm text-white/40 hover:text-yellow-400 transition-colors"
                  title="QR Code de check-in"
                  aria-label={`QR Code de check-in de ${gym.name}`}
                >
                  📲
                </button>
                <button
                  onClick={() => deleteGym(gym.id)}
                  className="rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center text-sm text-white/40 hover:text-red-400 transition-colors"
                  title="Remover"
                  aria-label={`Remover ${gym.name}`}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}

          {qrGym && (
            <Suspense fallback={null}>
              <GymQRCode gymId={qrGym.id} gymName={qrGym.name} onClose={() => setQrGym(null)} />
            </Suspense>
          )}

          {gyms.length === 0 && !addingGym && (
            <p className="text-center text-xs text-white/30 py-4">Nenhuma academia salva</p>
          )}

          {/* Add Gym Form with Autocomplete */}
          {addingGym && (
            <div
              className="rounded-xl p-3 space-y-2"
              style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}
            >
              <div className="relative">
                <input
                  type="text"
                  value={newGymName}
                  aria-label="Nome da academia"
                  onChange={e => handleNameChange(e.target.value)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Buscar academia..."
                  className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-amber-500/50"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  maxLength={100}
                />
                {searchingGyms && (
                  <div className="absolute right-3 top-2.5">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  </div>
                )}

                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div
                    className="absolute z-10 left-0 right-0 top-full mt-1 rounded-xl overflow-hidden shadow-lg"
                    style={{ background: '#1a1a1a', border: '1px solid rgba(245,158,11,0.3)' }}
                  >
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s) }}
                        className="w-full text-left px-3 py-2.5 hover:bg-amber-500/10 transition-colors border-b border-white/5 last:border-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-white truncate">{s.name}</p>
                          {typeof s.distanceKm === 'number' && (
                            <span className="text-[11px] font-bold text-amber-400 whitespace-nowrap">
                              {s.distanceKm < 1 ? `${Math.round(s.distanceKm * 1000)} m` : `${s.distanceKm.toFixed(1)} km`}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/30 truncate">{s.display}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedSuggestion && (
                <p className="text-xs text-amber-400/70">
                  📍 {selectedSuggestion.display.slice(0, 80)}...
                </p>
              )}

              {geoError && <p className="text-xs text-red-400">{geoError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={addGym}
                  disabled={saving || geoLoading || !newGymName.trim()}
                  className="flex-1 rounded-lg py-2 text-sm font-bold text-black disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                >
                  {saving || geoLoading
                    ? 'Salvando...'
                    : selectedSuggestion
                      ? '✓ Salvar academia'
                      : '📍 Salvar localização atual'}
                </button>
                <button
                  onClick={() => { setAddingGym(false); setNewGymName(''); setSelectedSuggestion(null); setSuggestions([]) }}
                  className="rounded-lg px-3 py-2 text-sm text-white/50 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
