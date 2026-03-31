'use client'
/**
 * MuscleBalanceCard
 *
 * Displays antagonist muscle imbalances based on the last 28 days of training.
 * Shows a ratio bar for each pair (e.g., chest vs back).
 */
import React, { useEffect, useState } from 'react'
import { Scale, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

interface Imbalance {
  muscleA: string
  muscleB: string
  labelA: string
  labelB: string
  setsA: number
  setsB: number
  ratio: number // % of setsA in total
  deviation: number
  balanced: boolean
}

interface MuscleVolume {
  id: string
  sets: number
}

interface AnalysisData {
  totalSessions: number
  muscleVolume: MuscleVolume[]
  imbalances: Imbalance[]
  periodDays: number
}

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Peitoral', lats: 'Dorsais', upper_back: 'Costas sup.',
  biceps: 'Bíceps', triceps: 'Tríceps', quads: 'Quadríceps',
  hamstrings: 'Posteriores', glutes: 'Glúteos', delts_front: 'Ombro frontal',
  delts_side: 'Ombro lateral', delts_rear: 'Ombro posterior',
  abs: 'Abdômen', calves: 'Panturrilhas', forearms: 'Antebraço',
}

export default function MuscleBalanceCard() {
  const [data, setData] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetch('/api/analysis/muscle-balance')
      .then(r => r.json())
      .then(json => { if (json.ok) setData(json) })
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="rounded-2xl p-4 flex justify-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <Loader2 size={18} className="animate-spin text-yellow-500" />
    </div>
  )

  if (!data || data.totalSessions === 0) return null

  const unbalanced = data.imbalances.filter(i => !i.balanced)
  const balanced = data.imbalances.filter(i => i.balanced)

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Scale size={14} className={unbalanced.length > 0 ? 'text-amber-400' : 'text-green-400'} />
          <span className="text-sm font-black text-white">Equilíbrio Muscular</span>
          <span className="text-xs text-white/30">28 dias</span>
        </div>
        <div className="flex items-center gap-2">
          {unbalanced.length > 0 ? (
            <span className="flex items-center gap-1 text-xs font-bold text-amber-400">
              <AlertTriangle size={11} />{unbalanced.length} desequilíbrio{unbalanced.length > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-bold text-green-400">
              <CheckCircle2 size={11} />Equilibrado
            </span>
          )}
          <svg
            className={`w-3.5 h-3.5 text-white/30 transition-transform ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16" fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Antagonist pairs */}
          {data.imbalances.map(im => {
            const total = im.setsA + im.setsB
            if (total === 0) return null
            const pctA = im.ratio
            const pctB = 100 - im.ratio
            return (
              <div key={`${im.muscleA}-${im.muscleB}`} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className={`font-bold ${!im.balanced && im.setsA > im.setsB ? 'text-amber-400' : 'text-white/60'}`}>{im.labelA}</span>
                  <span className={`font-bold ${!im.balanced && im.setsB > im.setsA ? 'text-amber-400' : 'text-white/60'}`}>{im.labelB}</span>
                </div>
                <div className="relative h-5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  {/* Left side (A) */}
                  <div
                    className="absolute left-0 top-0 h-full rounded-full transition-all"
                    style={{
                      width: `${pctA}%`,
                      background: !im.balanced && im.setsA > im.setsB ? '#f59e0b' : '#22c55e',
                    }}
                  />
                  {/* Center marker */}
                  <div className="absolute left-1/2 top-0 h-full w-px" style={{ background: 'rgba(255,255,255,0.2)' }} />
                  <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] font-black">
                    <span style={{ color: pctA > 30 ? '#000' : 'rgba(255,255,255,0.4)' }}>{im.setsA}s</span>
                    <span style={{ color: pctB > 30 ? '#000' : 'rgba(255,255,255,0.4)' }}>{im.setsB}s</span>
                  </div>
                </div>
                {!im.balanced && (
                  <p className="text-[10px] text-amber-400/70">
                    {im.setsA > im.setsB
                      ? `Adicione mais séries de ${im.labelB}`
                      : `Adicione mais séries de ${im.labelA}`}
                  </p>
                )}
              </div>
            )
          })}

          {/* Top muscles summary */}
          {data.muscleVolume.length > 0 && (
            <div className="pt-2 border-t border-white/5">
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Mais treinados (séries)</p>
              <div className="flex flex-wrap gap-1.5">
                {data.muscleVolume.slice(0, 6).map(m => (
                  <span
                    key={m.id}
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'rgba(234,179,8,0.1)', color: '#f59e0b', border: '1px solid rgba(234,179,8,0.2)' }}
                  >
                    {MUSCLE_LABELS[m.id] || m.id} {m.sets}s
                  </span>
                ))}
              </div>
            </div>
          )}

          {balanced.length === data.imbalances.length && (
            <p className="text-xs text-green-400/70 text-center">
              ✓ Todos os pares musculares estão equilibrados neste período!
            </p>
          )}
        </div>
      )}
    </div>
  )
}
