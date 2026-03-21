'use client'

import { useState, useEffect, useMemo } from 'react'

interface CheckinPoint {
  latitude: number
  longitude: number
  checked_in_at: string
  gym_name?: string
}

interface WorkoutHeatMapProps {
  userId: string
  period?: 'month' | 'year'
}

/**
 * VIP-only heat map showing workout locations.
 * Uses simple colored dots on a dark canvas — no external map library needed for the basic version.
 */
export default function WorkoutHeatMap({ userId, period = 'month' }: WorkoutHeatMapProps) {
  const [checkins, setCheckins] = useState<CheckinPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState(period)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/gps/checkin?limit=100`)
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.checkins) {
          const now = Date.now()
          const cutoff = selectedPeriod === 'year'
            ? now - 365 * 24 * 60 * 60 * 1000
            : now - 30 * 24 * 60 * 60 * 1000

          const filtered = d.checkins
            .filter((c: Record<string, unknown>) => c.latitude && c.longitude && new Date(c.checked_in_at as string).getTime() > cutoff)
            .map((c: Record<string, unknown>) => ({
              latitude: c.latitude as number,
              longitude: c.longitude as number,
              checked_in_at: c.checked_in_at as string,
              gym_name: (c.user_gyms as Record<string, unknown>)?.name as string || undefined,
            }))
          setCheckins(filtered)
        }
      })
      .catch(() => { /* intentional: non-critical VIP feature */ })
      .finally(() => setLoading(false))
  }, [userId, selectedPeriod])

  // Group by location (round to ~100m)
  const clusters = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number; count: number; name?: string }>()
    for (const c of checkins) {
      const key = `${c.latitude.toFixed(3)},${c.longitude.toFixed(3)}`
      const existing = map.get(key)
      if (existing) {
        existing.count++
      } else {
        map.set(key, { lat: c.latitude, lng: c.longitude, count: 1, name: c.gym_name })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [checkins])

  // Stats
  const totalCheckins = checkins.length
  const uniqueLocations = clusters.length
  const topGym = clusters[0]

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: 'linear-gradient(135deg, rgba(15,15,15,0.98) 0%, rgba(20,15,10,0.98) 100%)',
        borderColor: 'rgba(234,179,8,0.2)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🗺️</span>
          <h3 className="text-sm font-bold text-white">Mapa de Treinos</h3>
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000' }}
          >
            VIP
          </span>
        </div>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          {(['month', 'year'] as const).map(p => (
            <button
              key={p}
              onClick={() => setSelectedPeriod(p)}
              className="px-3 py-1 text-xs font-medium transition-colors"
              style={{
                background: selectedPeriod === p ? 'rgba(245,158,11,0.2)' : 'transparent',
                color: selectedPeriod === p ? '#f59e0b' : 'rgba(255,255,255,0.4)',
              }}
            >
              {p === 'month' ? 'Mês' : 'Ano'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
        </div>
      ) : checkins.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-white/30 text-sm">
          Nenhum check-in neste período
        </div>
      ) : (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl p-2 text-center" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <p className="text-xs text-white/40">Check-ins</p>
              <p className="text-lg font-bold text-amber-400">{totalCheckins}</p>
            </div>
            <div className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs text-white/40">Locais</p>
              <p className="text-lg font-bold text-white">{uniqueLocations}</p>
            </div>
            <div className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs text-white/40">Frequência</p>
              <p className="text-lg font-bold text-white">
                {selectedPeriod === 'month'
                  ? `${(totalCheckins / 4).toFixed(1)}`
                  : `${(totalCheckins / 52).toFixed(1)}`}
                <span className="text-xs text-white/30 ml-0.5">/sem</span>
              </p>
            </div>
          </div>

          {/* Location Cards */}
          <div className="space-y-2">
            {clusters.slice(0, 5).map((cluster, i) => (
              <div
                key={`${cluster.lat}-${cluster.lng}`}
                className="flex items-center gap-3 rounded-xl p-3"
                style={{
                  background: i === 0 ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${i === 0 ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)'}`,
                }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                  style={{
                    background: i === 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(255,255,255,0.08)',
                    color: i === 0 ? '#000' : 'rgba(255,255,255,0.5)',
                  }}
                >
                  #{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{cluster.name || 'Local desconhecido'}</p>
                  <p className="text-xs text-white/30">{cluster.count} check-in{cluster.count > 1 ? 's' : ''}</p>
                </div>
                {/* Intensity bar */}
                <div className="w-16 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (cluster.count / (topGym?.count || 1)) * 100)}%`,
                      background: 'linear-gradient(90deg, #f59e0b, #d97706)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
