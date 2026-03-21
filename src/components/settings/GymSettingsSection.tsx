'use client'

import { useState, useEffect, useCallback } from 'react'
import { useGeoLocation } from '@/hooks/useGeoLocation'
import type { SupabaseClient } from '@supabase/supabase-js'

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

export default function GymSettingsSection({ userId, supabase }: GymSettingsSectionProps) {
  const { getCurrentPosition, loading: geoLoading, error: geoError } = useGeoLocation()
  const [gyms, setGyms] = useState<Gym[]>([])
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

  // Load gyms & settings
  useEffect(() => {
    const load = async () => {
      const [{ data: gymsData }, { data: settingsData }] = await Promise.allSettled([
        supabase.from('user_gyms').select('*').eq('user_id', userId).order('is_primary', { ascending: false }).limit(20),
        supabase.from('user_location_settings').select('*').eq('user_id', userId).maybeSingle(),
      ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : { data: null })) as [
        { data: Gym[] | null },
        { data: LocationSettings | null },
      ]
      if (gymsData) setGyms(gymsData)
      if (settingsData) setSettings(settingsData)
      setLoading(false)
    }
    load()
  }, [userId, supabase])

  // Toggle setting
  const toggleSetting = useCallback(async (key: keyof LocationSettings) => {
    const newVal = !settings[key]
    setSettings(prev => ({ ...prev, [key]: newVal }))
    await supabase.from('user_location_settings').upsert(
      { user_id: userId, [key]: newVal, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  }, [settings, supabase, userId])

  // Add gym at current location
  const addGymAtCurrentLocation = useCallback(async () => {
    if (!newGymName.trim()) return
    setSaving(true)
    const pos = await getCurrentPosition()
    if (!pos) {
      setSaving(false)
      return
    }
    const { data, error } = await supabase.from('user_gyms').insert({
      user_id: userId,
      name: newGymName.trim(),
      latitude: pos.latitude,
      longitude: pos.longitude,
      radius_meters: 100,
      is_primary: gyms.length === 0,
    }).select().single()

    if (!error && data) {
      setGyms(prev => [...prev, data as Gym])
      setNewGymName('')
      setAddingGym(false)
    }
    setSaving(false)
  }, [newGymName, getCurrentPosition, supabase, userId, gyms.length])

  // Delete gym
  const deleteGym = useCallback(async (gymId: string) => {
    await supabase.from('user_gyms').delete().eq('id', gymId).eq('user_id', userId)
    setGyms(prev => prev.filter(g => g.id !== gymId))
  }, [supabase, userId])

  // Set primary
  const setPrimary = useCallback(async (gymId: string) => {
    await supabase.from('user_gyms').update({ is_primary: false }).eq('user_id', userId)
    await supabase.from('user_gyms').update({ is_primary: true }).eq('id', gymId).eq('user_id', userId)
    setGyms(prev => prev.map(g => ({ ...g, is_primary: g.id === gymId })))
  }, [supabase, userId])

  if (loading) return <div className="animate-pulse h-20 rounded-xl bg-white/5" />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-lg">📍</span>
        <h3 className="text-base font-bold text-white">Localização & GPS</h3>
      </div>

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
              onClick={() => setAddingGym(true)}
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
                    className="rounded-lg px-2 py-1 text-xs text-white/40 hover:text-amber-400 transition-colors"
                    title="Definir como principal"
                  >
                    ⭐
                  </button>
                )}
                <button
                  onClick={() => deleteGym(gym.id)}
                  className="rounded-lg px-2 py-1 text-xs text-white/40 hover:text-red-400 transition-colors"
                  title="Remover"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}

          {gyms.length === 0 && !addingGym && (
            <p className="text-center text-xs text-white/30 py-4">Nenhuma academia salva</p>
          )}

          {/* Add Gym Form */}
          {addingGym && (
            <div
              className="rounded-xl p-3 space-y-2"
              style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}
            >
              <input
                type="text"
                value={newGymName}
                onChange={e => setNewGymName(e.target.value)}
                placeholder="Nome da academia..."
                className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-amber-500/50"
                autoFocus
                maxLength={100}
              />
              {geoError && <p className="text-xs text-red-400">{geoError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={addGymAtCurrentLocation}
                  disabled={saving || geoLoading || !newGymName.trim()}
                  className="flex-1 rounded-lg py-2 text-sm font-bold text-black disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                >
                  {saving || geoLoading ? 'Localizando...' : '📍 Salvar localização atual'}
                </button>
                <button
                  onClick={() => { setAddingGym(false); setNewGymName('') }}
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
