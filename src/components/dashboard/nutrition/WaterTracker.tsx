'use client'

import { useState } from 'react'

const WATER_GOAL = 2500 // ml daily goal
const PRESETS = [250, 500, 750] // ml

export default function WaterTracker({
  initialMl,
  onUpdate,
}: {
  initialMl: number
  onUpdate: (ml: number) => void
}) {
  const [current, setCurrent] = useState(initialMl)
  const [busy, setBusy] = useState(false)

  const pct = WATER_GOAL > 0 ? Math.min(100, Math.round((current / WATER_GOAL) * 100)) : 0
  const glasses = Math.round(current / 250)

  const addWater = async (amount: number) => {
    if (busy) return
    setBusy(true)
    const next = Math.min(10000, current + amount)
    setCurrent(next)
    onUpdate(next)
    setBusy(false)
  }

  const removeWater = async () => {
    if (busy || current <= 0) return
    setBusy(true)
    const next = Math.max(0, current - 250)
    setCurrent(next)
    onUpdate(next)
    setBusy(false)
  }

  return (
    <div className="rounded-2xl bg-neutral-900/60 border border-neutral-800/60 p-4 ring-1 ring-neutral-800/50">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 flex items-center gap-1.5">
            <span>💧</span> Água
          </div>
          <div className="mt-1 text-lg font-semibold text-white">
            {current >= 1000 ? `${(current / 1000).toFixed(1)}L` : `${current}ml`}
            <span className="text-neutral-500 text-sm"> / {WATER_GOAL / 1000}L</span>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-bold tabular-nums ${pct >= 100 ? 'text-blue-400' : 'text-neutral-400'}`}>
            {pct}%
          </div>
          <div className="text-[10px] text-neutral-600">{glasses} copos</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 rounded-full bg-neutral-800/70 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: pct >= 100 ? '#3b82f6' : pct >= 50 ? '#60a5fa' : '#93c5fd',
          }}
        />
      </div>

      {/* Quick add buttons */}
      <div className="mt-3 flex items-center gap-2">
        {PRESETS.map((ml) => (
          <button
            key={ml}
            type="button"
            onClick={() => addWater(ml)}
            disabled={busy}
            className="flex-1 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 active:scale-95 transition disabled:opacity-50"
          >
            +{ml}ml
          </button>
        ))}
        <button
          type="button"
          onClick={removeWater}
          disabled={busy || current <= 0}
          className="h-9 w-9 grid place-items-center rounded-xl bg-neutral-800/60 border border-neutral-700/50 text-xs text-neutral-400 hover:bg-neutral-700/60 active:scale-95 transition disabled:opacity-30"
          aria-label="Remover 250ml"
        >
          −
        </button>
      </div>
    </div>
  )
}
