'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { RefreshCw, Loader2, X, Check, Dumbbell } from 'lucide-react'
import { useWorkoutContext } from './WorkoutContext'

/* ──────────────────────────────────────────────────────────
 * AIExerciseSwap
 *
 * Button + modal to swap an exercise for an AI-suggested
 * alternative during an active workout.
 *
 * FIX: Uses programmatic draft → save to swap the exercise
 * name directly, instead of opening the edit modal on top.
 * ────────────────────────────────────────────────────────── */

interface Alternative {
  name: string
  reason: string
  similarity: number
  muscleGroups: string[]
  equipment: string
}

interface AIExerciseSwapProps {
  exerciseName: string
  exerciseIndex: number
}

export default function AIExerciseSwap({
  exerciseName,
  exerciseIndex,
}: AIExerciseSwapProps) {
  const ctx = useWorkoutContext()
  const { exercises, setEditExerciseDraft, setEditExerciseIdx, setEditExerciseOpen, saveEditExercise } = ctx
  const [alternatives, setAlternatives] = useState<Alternative[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [applied, setApplied] = useState('')
  const fetchedRef = useRef(false)
  // Ref to track pending programmatic save
  const pendingSaveRef = useRef(false)

  const fetchAlternatives = useCallback(async () => {
    if (fetchedRef.current && alternatives.length > 0) {
      setOpen(true)
      return
    }
    setLoading(true)
    setError('')
    setOpen(true)

    try {
      const res = await fetch('/api/ai/exercise-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseName }),
      })

      const data = await res.json()
      if (data?.ok && Array.isArray(data.alternatives) && data.alternatives.length > 0) {
        setAlternatives(data.alternatives)
        fetchedRef.current = true
      } else {
        setError(data?.error || 'Sem alternativas disponíveis')
      }
    } catch {
      setError('Erro ao buscar alternativas')
    } finally {
      setLoading(false)
    }
  }, [exerciseName, alternatives.length])

  const handleSelect = useCallback((alt: Alternative) => {
    setApplied(alt.name)

    // Programmatically swap by setting the edit draft with the new name,
    // then triggering save — this updates the exercise array directly
    // without opening the edit modal UI.
    try {
      const ex = exercises[exerciseIndex]
      if (!ex) return

      const setsHeader = Math.max(0, parseInt(String(ex?.sets ?? '0'), 10) || 0)
      const sdArrRaw = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray((ex as Record<string, unknown>)?.set_details) ? (ex as Record<string, unknown>).set_details as unknown[] : []
      const setsCount = Math.max(setsHeader, Array.isArray(sdArrRaw) ? sdArrRaw.length : 0) || 1
      const restTime = String(ex?.restTime ?? ex?.rest_time ?? '60')
      const method = String(ex?.method || 'Normal')

      // Set the draft with the NEW exercise name
      setEditExerciseDraft({ name: alt.name, sets: String(setsCount), restTime, method })
      setEditExerciseIdx(exerciseIndex)

      // Don't open the edit UI — we immediately save
      // Use a ref + effect to call saveEditExercise after state settles
      pendingSaveRef.current = true
    } catch { /* silent */ }

    // Close the swap modal after a brief feedback delay
    setTimeout(() => {
      setOpen(false)
      setApplied('')
    }, 600)
  }, [exercises, exerciseIndex, setEditExerciseDraft, setEditExerciseIdx])

  // Effect to trigger save after draft state has settled
  useEffect(() => {
    if (!pendingSaveRef.current) return
    pendingSaveRef.current = false
    // Small delay to ensure React state for editExerciseDraft is committed
    const timer = setTimeout(() => {
      try { saveEditExercise() } catch { /* silent */ }
    }, 50)
    return () => clearTimeout(timer)
  }, [applied, saveEditExercise])

  const closeModal = useCallback(() => {
    setOpen(false)
    setApplied('')
  }, [])

  const similarityColor = (s: number) =>
    s >= 80 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : s >= 50 ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
    : 'text-orange-400 bg-orange-500/10 border-orange-500/30'

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          fetchAlternatives()
        }}
        className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-violet-400 hover:bg-neutral-800 transition-colors active:scale-95 flex-shrink-0"
        title="Trocar exercício (AI)"
        aria-label="Sugerir exercícios alternativos"
      >
        <RefreshCw size={14} />
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeModal}
          onTouchEnd={(e) => {
            // Ensure touch on backdrop closes modal on mobile
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div
            className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <div className="flex items-center gap-2 min-w-0">
                <RefreshCw size={16} className="text-violet-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-black text-white text-sm truncate">Trocar exercício</h3>
                  <p className="text-[10px] text-neutral-500 truncate">{exerciseName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-neutral-500 hover:text-white p-2 -mr-2 rounded-xl active:bg-neutral-800 transition-colors"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-2 overflow-y-auto max-h-[60vh]">
              {loading && (
                <div className="flex items-center justify-center py-8 gap-2 text-violet-400">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm font-bold">Analisando alternativas…</span>
                </div>
              )}

              {error && !loading && (
                <div className="text-center py-8">
                  <p className="text-red-400 text-sm">{error}</p>
                  <button
                    type="button"
                    onClick={() => { fetchedRef.current = false; fetchAlternatives() }}
                    className="mt-3 px-4 py-2 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-bold"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {!loading && !error && alternatives.map((alt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleSelect(alt)
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all active:scale-[0.98] ${
                    applied === alt.name
                      ? 'bg-emerald-500/20 border-emerald-500/40'
                      : 'bg-neutral-800/50 border-neutral-700/50 hover:border-violet-500/30 hover:bg-neutral-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Dumbbell size={14} className="text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm truncate">{alt.name}</span>
                        {applied === alt.name && <Check size={14} className="text-emerald-400 shrink-0" />}
                        <span className={`shrink-0 px-1.5 py-0.5 rounded-md border text-[9px] font-black ${similarityColor(alt.similarity)}`}>
                          {alt.similarity}%
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400 mt-0.5">{alt.reason}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {alt.muscleGroups.map((mg, j) => (
                          <span
                            key={j}
                            className="px-1.5 py-0.5 rounded-md bg-neutral-700/50 text-[9px] text-neutral-400 font-mono"
                          >
                            {mg}
                          </span>
                        ))}
                        <span className="px-1.5 py-0.5 rounded-md bg-neutral-700/50 text-[9px] text-neutral-500 font-mono">
                          {alt.equipment}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Footer close button for extra safety */}
            <div className="p-4 pt-0">
              <button
                type="button"
                onClick={closeModal}
                className="w-full py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-400 text-sm font-bold hover:text-white transition-colors active:scale-[0.98]"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
