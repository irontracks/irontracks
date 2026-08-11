'use client'

import React, { useEffect, useState } from 'react'
import { Square } from 'lucide-react'

/**
 * Card do exercício ENQUANTO o cronômetro roda (cardio e prancha).
 *
 * Antes essas duas telas mostravam só a frase "Cardio em andamento" + Parar: o
 * tempo — que é o CONTEÚDO do exercício — ficava num anel de 13px na barra
 * inferior, sem meta e sem progresso (reclamação do dono, jul/2026). Aqui o
 * número é o protagonista.
 *
 * Componente único para os dois modos de propósito: são a mesma mecânica e já
 * divergiam em silêncio por serem copiados.
 */

const fmt = (totalSec: number) => {
  const s = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r < 10 ? '0' : ''}${r}`
}

export function RunningTimerCard({
  setIdx,
  label,
  startedAtMs,
  targetSeconds,
  onStop,
}: {
  setIdx: number
  /** "Cardio" | "Prancha" — usado no rótulo da série. */
  label: string
  startedAtMs: number
  /** Meta em segundos (0 = sem meta: conta pra cima). */
  targetSeconds: number
  onStop: () => void
}) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsedSec = startedAtMs > 0 ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000)) : 0
  const hasTarget = targetSeconds > 0
  const remainingSec = hasTarget ? targetSeconds - elapsedSec : 0
  const overtime = hasTarget && remainingSec < 0
  const progress = hasTarget ? Math.min(1, elapsedSec / targetSeconds) : 0

  return (
    <div className="rounded-xl border px-3 py-3 bg-neutral-900/50 border-yellow-500/30 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">
            Série {setIdx + 1} • {label} em andamento
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span
              className={`font-mono font-black tabular-nums leading-none text-3xl ${overtime ? 'text-red-400' : 'text-yellow-500'}`}
            >
              {hasTarget ? (overtime ? `+${fmt(-remainingSec)}` : fmt(remainingSec)) : fmt(elapsedSec)}
            </span>
            <span className="text-[11px] font-bold text-neutral-400 truncate">
              {hasTarget ? (overtime ? 'além da meta' : `restantes de ${fmt(targetSeconds)}`) : 'em andamento'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-500/90 text-white text-xs font-black active:scale-95 transition-transform"
        >
          <Square size={14} />
          Parar
        </button>
      </div>

      {hasTarget ? (
        <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${overtime ? 'bg-red-500' : 'bg-yellow-500'}`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}
