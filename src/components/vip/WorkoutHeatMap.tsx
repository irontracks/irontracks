'use client'

// Alias obrigatório: `Map` do lucide sombrearia o `new Map()` nativo usado abaixo.
import { Map as MapIcon, MapPin } from 'lucide-react'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'

interface CheckinPoint {
  latitude: number
  longitude: number
  checked_in_at: string
  gym_name?: string
}

/**
 * Por que o card busca as academias além dos check-ins
 * ────────────────────────────────────────────────────
 * O vazio tem DUAS causas muito diferentes e a mensagem única escondia a que
 * importa. Medido em produção (03/08/2026): 10 dos 11 usuários com settings de
 * localização estavam com GPS e check-in automático LIGADOS, e `user_gyms` tinha
 * ZERO linhas na base inteira — logo `gym_checkins` também tinha zero. O fluxo de
 * cadastro funciona (testado ponta a ponta: permissão iOS → busca → insert); o que
 * faltava era o passo seguinte ficar visível.
 *
 * "Nenhum check-in neste período" lê como "você não treinou". Sem academia salva o
 * check-in é IMPOSSÍVEL, e o card precisa dizer isso e levar ao cadastro.
 */
type EmptyReason = 'no-gym' | 'no-checkin' | 'error'

interface WorkoutHeatMapProps {
  userId: string
  period?: 'month' | 'year'
}

/**
 * VIP-only heat map showing workout locations.
 * Uses simple colored dots on a dark canvas — no external map library needed for the basic version.
 */
export default function WorkoutHeatMap({ userId, period = 'month' }: WorkoutHeatMapProps) {
  const router = useRouter()
  const [checkins, setCheckins] = useState<CheckinPoint[]>([])
  const [gymCount, setGymCount] = useState<number | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState(period)

  /**
   * A janela e o divisor da frequência saem da MESMA constante.
   *
   * Antes eram dois números soltos e incompatíveis: a janela do mês pegava 30
   * dias e dividia por 4 semanas (são 4,29 — 7% a mais na frequência), e a do
   * ano pegava 365 e dividia por 52. Trocar de "mês" para "ano" mudava a
   * frequência exibida sobre a MESMA base de dados, e o usuário não tinha como
   * entender por quê.
   */
  const diasDaJanela = selectedPeriod === 'year' ? 365 : 30
  const semanasDaJanela = diasDaJanela / 7

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)

    const load = async () => {
      const [checkinRes, gymRes] = await Promise.allSettled([
        fetch('/api/gps/checkin?limit=100').then(r => r.json()),
        fetch('/api/gps/gyms').then(r => r.json()),
      ])
      if (cancelled) return

      // Falha de rede não pode virar "sem check-in" — antes o `.catch` vazio
      // engolia o erro e o card acusava vazio como se fosse dado.
      if (checkinRes.status !== 'fulfilled' || !checkinRes.value?.ok) {
        setLoadError(true)
        setLoading(false)
        return
      }

      const now = Date.now()
      const cutoff = now - diasDaJanela * 24 * 60 * 60 * 1000

      const raw: Record<string, unknown>[] = Array.isArray(checkinRes.value.checkins) ? checkinRes.value.checkins : []
      const filtered = raw
        .filter((c) => c.latitude && c.longitude && new Date(c.checked_in_at as string).getTime() > cutoff)
        .map((c) => ({
          latitude: c.latitude as number,
          longitude: c.longitude as number,
          checked_in_at: c.checked_in_at as string,
          gym_name: (c.user_gyms as Record<string, unknown>)?.name as string || undefined,
        }))
      setCheckins(filtered)

      // Academias falhando não derruba o card: sem a contagem, o vazio cai no
      // texto genérico em vez de acusar "cadastre sua academia" sem saber.
      setGymCount(
        gymRes.status === 'fulfilled' && gymRes.value?.ok && Array.isArray(gymRes.value.gyms)
          ? gymRes.value.gyms.length
          : null,
      )
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [userId, selectedPeriod, diasDaJanela])

  const emptyReason: EmptyReason = loadError ? 'error' : gymCount === 0 ? 'no-gym' : 'no-checkin'

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
          <MapIcon size={18} className="text-yellow-500" aria-hidden="true" />
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
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          {emptyReason === 'no-gym' ? (
            <>
              <p className="text-sm font-semibold text-white/80">Cadastre sua academia para começar</p>
              <p className="max-w-[280px] text-xs leading-relaxed text-white/55">
                O check-in é automático: assim que você chega na academia salva, o app registra a presença e ela aparece aqui.
              </p>
              <button
                type="button"
                onClick={() => router.push('/dashboard/profile')}
                className="mt-1 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black text-black transition-transform active:scale-95"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
              >
                <MapPin size={13} aria-hidden="true" /> Cadastrar academia
              </button>
            </>
          ) : emptyReason === 'error' ? (
            <p className="text-sm text-white/55">Não foi possível carregar seus check-ins agora.</p>
          ) : (
            <>
              <p className="text-sm text-white/55">Nenhum check-in neste período</p>
              <p className="max-w-[280px] text-xs leading-relaxed text-white/55">
                Abra o app na sua academia para registrar a presença.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl p-2 text-center" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <p className="text-xs text-white/55">Check-ins</p>
              <p className="text-lg font-bold text-amber-400">{totalCheckins}</p>
            </div>
            <div className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs text-white/55">Locais</p>
              <p className="text-lg font-bold text-white">{uniqueLocations}</p>
            </div>
            <div className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs text-white/55">Frequência</p>
              <p className="text-lg font-bold text-white">
                {(totalCheckins / semanasDaJanela).toFixed(1)}
                <span className="text-xs text-white/55 ml-0.5">/sem</span>
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
                  <p className="text-xs text-white/55">{cluster.count} check-in{cluster.count > 1 ? 's' : ''}</p>
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
