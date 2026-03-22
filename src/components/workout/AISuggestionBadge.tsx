'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Sparkles, TrendingUp, TrendingDown, Minus, X, Check, Loader2 } from 'lucide-react'

/* ──────────────────────────────────────────────────────────
 * AISuggestionBadge
 *
 * Inline AI load suggestion for active workout ExerciseCard.
 * Fetches from /api/ai/suggest-load (pure math, ~50ms).
 * Shows suggested weight × reps with trend indicator.
 * ────────────────────────────────────────────────────────── */

interface Suggestion {
  suggestedWeight: number
  suggestedReps: number
  confidence: 'high' | 'medium' | 'low'
  reason: string
  trend: 'up' | 'stable' | 'down'
  lastSessions: Array<{ weight: number; reps: number; date: string }>
}

interface AISuggestionBadgeProps {
  exerciseName: string
  setIndex?: number
  currentWeight?: number
  currentReps?: number
  onApply?: (weight: number, reps: number) => void
}

export default function AISuggestionBadge({
  exerciseName,
  setIndex = 0,
  currentWeight,
  currentReps,
  onApply,
}: AISuggestionBadgeProps) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [applied, setApplied] = useState(false)
  const fetchedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchSuggestion = useCallback(async () => {
    if (fetchedRef.current || !exerciseName.trim()) return
    fetchedRef.current = true
    setLoading(true)
    setError('')

    try {
      abortRef.current = new AbortController()
      const res = await fetch('/api/ai/suggest-load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseName,
          setIndex,
          currentWeight: currentWeight || undefined,
          currentReps: currentReps || undefined,
        }),
        signal: abortRef.current.signal,
      })

      const data = await res.json()
      if (data?.ok && data?.suggestion) {
        setSuggestion(data.suggestion)
      } else {
        setError(data?.reason || 'Sem dados')
      }
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== 'AbortError') {
        setError('Erro ao buscar sugestão')
      }
    } finally {
      setLoading(false)
    }
  }, [exerciseName, setIndex, currentWeight, currentReps])

  useEffect(() => {
    return () => {
      try { abortRef.current?.abort() } catch { /* silent */ }
    }
  }, [])

  const handleApply = useCallback(() => {
    if (!suggestion || !onApply) return
    onApply(suggestion.suggestedWeight, suggestion.suggestedReps)
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
  }, [suggestion, onApply])

  const TrendIcon = suggestion?.trend === 'up'
    ? TrendingUp
    : suggestion?.trend === 'down'
      ? TrendingDown
      : Minus

  const trendColor = suggestion?.trend === 'up'
    ? 'text-emerald-400'
    : suggestion?.trend === 'down'
      ? 'text-red-400'
      : 'text-yellow-400'

  const confidenceLabel = suggestion?.confidence === 'high'
    ? '⭐ Alta confiança'
    : suggestion?.confidence === 'medium'
      ? '◐ Média confiança'
      : '○ Pouco histórico'

  // Not yet fetched — show the trigger button
  if (!suggestion && !loading && !error) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); fetchSuggestion() }}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-400 text-[10px] font-bold hover:bg-violet-500/20 transition-colors active:scale-95"
        title="Sugestão de carga AI"
        aria-label="Pedir sugestão de carga"
      >
        <Sparkles size={11} />
        <span>AI</span>
      </button>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-400 text-[10px] font-bold">
        <Loader2 size={11} className="animate-spin" />
        <span>Analisando…</span>
      </div>
    )
  }

  // Error / no data
  if (error || !suggestion) {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-800/50 border border-neutral-700/50 text-neutral-500 text-[10px]">
        <Sparkles size={11} />
        <span>{error || 'Sem dados'}</span>
      </div>
    )
  }

  // Suggestion available — compact or expanded
  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      {/* Compact suggestion bar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-violet-950/50 to-purple-950/40 border border-violet-500/20 hover:border-violet-500/40 transition-all"
      >
        <Sparkles size={13} className="text-violet-400 shrink-0" />
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-violet-300 font-black text-sm">
              {suggestion.suggestedWeight}kg × {suggestion.suggestedReps}
            </span>
            <TrendIcon size={13} className={trendColor} />
            {applied && (
              <span className="text-emerald-400 text-[10px] font-bold flex items-center gap-0.5">
                <Check size={10} /> Aplicado
              </span>
            )}
          </div>
          <p className="text-[10px] text-violet-400/70 truncate">{suggestion.reason}</p>
        </div>
        {onApply && !applied && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleApply() }}
            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 text-[10px] font-black hover:bg-violet-500/30 active:scale-95 transition-all"
          >
            USAR
          </button>
        )}
        <X
          size={12}
          className="shrink-0 text-neutral-500 hover:text-white cursor-pointer"
          onClick={(e) => { e.stopPropagation(); setSuggestion(null); fetchedRef.current = false }}
        />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-1.5 px-3 py-2 rounded-xl bg-neutral-900/80 border border-neutral-800/80 space-y-2">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-neutral-500">{confidenceLabel}</span>
            <span className="text-neutral-600">•</span>
            <span className={trendColor}>
              {suggestion.trend === 'up' ? 'Tendência ↑' : suggestion.trend === 'down' ? 'Tendência ↓' : 'Estável'}
            </span>
          </div>
          <p className="text-xs text-neutral-300">{suggestion.reason}</p>
          {suggestion.lastSessions.length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">Últimas sessões</p>
              <div className="flex gap-1.5 flex-wrap">
                {suggestion.lastSessions.map((s, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700/50 text-[10px] font-mono text-neutral-300"
                  >
                    {s.weight}kg×{s.reps}
                    <span className="ml-1 text-neutral-600">{s.date.slice(5, 10)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
