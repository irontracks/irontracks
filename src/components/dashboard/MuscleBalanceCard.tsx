'use client'

import React, { useState, useCallback } from 'react'
import { Scale, Loader2, TrendingDown, TrendingUp, Minus, AlertTriangle } from 'lucide-react'

/* ──────────────────────────────────────────────────────────
 * MuscleBalanceCard
 *
 * Feature 9: Análise de Desbalanço Muscular
 * Shows volume/frequency comparison across muscle groups.
 * ────────────────────────────────────────────────────────── */

interface MuscleGroupData {
  name: string
  sessions: number
  totalSets: number
  totalVolume: number
  status: 'balanced' | 'deficit' | 'overtrained'
}

interface MuscleBalanceCardProps {
  muscleData: MuscleGroupData[]
}

export default function MuscleBalanceCard({ muscleData }: MuscleBalanceCardProps) {
  const [expanded, setExpanded] = useState(false)

  if (!muscleData || muscleData.length === 0) return null

  const avgSets = muscleData.reduce((s, m) => s + m.totalSets, 0) / muscleData.length
  const deficits = muscleData.filter(m => m.status === 'deficit')
  const overtrained = muscleData.filter(m => m.status === 'overtrained')

  const statusIcon = (status: string) =>
    status === 'deficit' ? <TrendingDown size={12} className="text-red-400" />
    : status === 'overtrained' ? <TrendingUp size={12} className="text-yellow-400" />
    : <Minus size={12} className="text-emerald-400" />

  const statusColor = (status: string) =>
    status === 'deficit' ? 'border-red-500/20 bg-red-500/5'
    : status === 'overtrained' ? 'border-yellow-500/20 bg-yellow-500/5'
    : 'border-emerald-500/20 bg-emerald-500/5'

  const barWidth = (sets: number) => {
    const max = Math.max(...muscleData.map(m => m.totalSets), 1)
    return Math.max(5, (sets / max) * 100)
  }

  return (
    <div className="rounded-2xl bg-neutral-900/80 border border-neutral-800/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <Scale size={18} className="text-blue-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-white text-sm">Balanço Muscular</h3>
          <p className="text-[10px] text-neutral-500 mt-0.5">
            {deficits.length > 0
              ? `${deficits.length} grupo${deficits.length > 1 ? 's' : ''} em déficit`
              : overtrained.length > 0
                ? `${overtrained.length} grupo${overtrained.length > 1 ? 's' : ''} em excesso`
                : 'Todos os grupos equilibrados ✅'
            }
          </p>
        </div>
        {deficits.length > 0 && (
          <AlertTriangle size={14} className="text-red-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-1.5">
          {muscleData.map((m, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${statusColor(m.status)}`}
            >
              {statusIcon(m.status)}
              <span className="text-xs font-bold text-white w-24 truncate">{m.name}</span>
              <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    m.status === 'deficit' ? 'bg-red-500/60' : m.status === 'overtrained' ? 'bg-yellow-500/60' : 'bg-emerald-500/60'
                  }`}
                  style={{ width: `${barWidth(m.totalSets)}%` }}
                />
              </div>
              <span className="text-[10px] text-neutral-400 font-mono w-12 text-right">{m.totalSets}s</span>
            </div>
          ))}
          <p className="text-[9px] text-neutral-600 text-center mt-2">
            Média: {Math.round(avgSets)} séries/grupo • Últimas 4 semanas
          </p>
        </div>
      )}
    </div>
  )
}
