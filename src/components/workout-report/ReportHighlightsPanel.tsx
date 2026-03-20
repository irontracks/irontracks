'use client'

import React from 'react'
import NextImage from 'next/image'

type AnyObj = Record<string, unknown>

interface ReportHighlightsPanelProps {
  prCount: number
  allTimePrCount: number
  detectedPrs: { exerciseName?: string; e1rm: number; isAllTimePr?: boolean }[]
  volumeDeltaAbs: number
  volumeDelta: number
  currentVolume: number
  setCompletionPct: number
  setsCompleted: number
  setsPlanned: number
}

export function ReportHighlightsPanel({
  prCount,
  allTimePrCount,
  detectedPrs,
  volumeDeltaAbs,
  volumeDelta,
  currentVolume,
  setCompletionPct,
  setsCompleted,
  setsPlanned,
}: ReportHighlightsPanelProps) {
  if (!(prCount > 0 || (volumeDeltaAbs !== 0 && currentVolume > 0) || setCompletionPct > 0)) return null

  return (
    <div className="mb-8 p-4 rounded-2xl border border-yellow-500/25 bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-neutral-900/80">
      <div className="text-[10px] font-black uppercase tracking-widest text-yellow-400 mb-3">⚡ Destaques da sessão</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {prCount > 0 && (
          <div className="relative overflow-hidden border border-yellow-500/40 rounded-xl flex flex-col"
            style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.14), rgba(180,83,9,0.10))', boxShadow: '0 0 18px rgba(234,179,8,0.18), inset 0 0 12px rgba(234,179,8,0.06)' }}>
            <div className="absolute inset-0 opacity-30">
              <NextImage src="/report-pr.png" alt="" fill unoptimized className="object-cover object-center" />
            </div>
            <div className="relative z-10 p-3 flex flex-col gap-1">
              <div className="text-2xl font-black text-yellow-400">{prCount}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-yellow-300">
                {prCount === 1 ? 'PR alcançado' : 'PRs alcançados'}
              </div>
              {allTimePrCount > 0 && (
                <div className="text-[10px] text-amber-300 font-black">★ {allTimePrCount} recorde{allTimePrCount > 1 ? 's' : ''} histórico{allTimePrCount > 1 ? 's' : ''}!</div>
              )}
              {detectedPrs[0] && (
                <div className="text-[10px] text-yellow-200 opacity-80 truncate">
                  {detectedPrs[0].isAllTimePr ? '★ ' : ''}{detectedPrs[0].exerciseName}: {detectedPrs[0].e1rm.toFixed(1)} kg 1RM
                </div>
              )}
            </div>
          </div>
        )}
        {volumeDeltaAbs !== 0 && currentVolume > 0 && (
          <div className={`border rounded-xl p-3 flex flex-col gap-1 ${volumeDeltaAbs > 0
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-red-500/10 border-red-500/30'
            }`}>
            <div className={`text-2xl font-black ${volumeDeltaAbs > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {volumeDeltaAbs > 0 ? '+' : ''}{volumeDeltaAbs.toLocaleString('pt-BR')} kg
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Volume vs anterior</div>
            {Math.abs(volumeDelta) > 0 && (
              <div className={`text-[10px] font-mono ${volumeDelta > 0 ? 'text-green-300' : 'text-red-300'}`}>
                {volumeDelta > 0 ? '+' : ''}{volumeDelta.toFixed(1)}%
              </div>
            )}
          </div>
        )}
        {currentVolume > 0 && (
          <div className="bg-neutral-800/60 border border-neutral-700/60 rounded-xl p-3 flex flex-col gap-1">
            <div className="text-2xl font-black text-white">{currentVolume.toLocaleString('pt-BR')} kg</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Volume total</div>
          </div>
        )}
        {setCompletionPct > 0 && (
          <div className={`border rounded-xl p-3 flex flex-col gap-1 ${setCompletionPct >= 90 ? 'bg-green-500/10 border-green-500/30' :
            setCompletionPct >= 70 ? 'bg-yellow-500/10 border-yellow-500/30' :
              'bg-red-500/10 border-red-500/30'
            }`}>
            <div className={`text-2xl font-black ${setCompletionPct >= 90 ? 'text-green-400' :
              setCompletionPct >= 70 ? 'text-yellow-400' : 'text-red-400'
              }`}>{setCompletionPct}%</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Séries completas</div>
            <div className="text-[10px] text-neutral-500 font-mono">{setsCompleted}/{setsPlanned}</div>
          </div>
        )}
      </div>
    </div>
  )
}
