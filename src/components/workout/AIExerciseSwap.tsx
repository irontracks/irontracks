'use client'

import React, { useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, Loader2, X, Check, Dumbbell } from 'lucide-react'
import { useWorkoutContext } from './WorkoutContext'

/* ──────────────────────────────────────────────────────────
 * AIExerciseSwap
 *
 * Button + portal modal to swap an exercise for an
 * AI-suggested alternative during an active workout.
 *
 * Uses swapExerciseName (direct array update) for the swap.
 * Uses createPortal to render modal at document.body level,
 * avoiding event capture issues from parent components.
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
  const { swapExerciseName } = useWorkoutContext()
  const [alternatives, setAlternatives] = useState<Alternative[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [applied, setApplied] = useState('')
  const fetchedRef = useRef(false)

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
    // Direct swap — updates exercises array immediately
    swapExerciseName(exerciseIndex, alt.name)
    setApplied(alt.name)
    // Close after brief feedback
    setTimeout(() => {
      setOpen(false)
      setApplied('')
    }, 800)
  }, [exerciseIndex, swapExerciseName])

  const closeModal = useCallback(() => {
    setOpen(false)
    setApplied('')
  }, [])

  const similarityColor = (s: number) =>
    s >= 80 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : s >= 50 ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
    : 'text-orange-400 bg-orange-500/10 border-orange-500/30'

  // Build modal content
  const modalContent = open ? (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={closeModal}
    >
      <div
        style={{ width: '100%', maxWidth: '28rem', maxHeight: '80vh', background: '#171717', border: '1px solid #262626', borderRadius: '1rem 1rem 0 0', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #262626' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <RefreshCw size={16} style={{ color: '#a78bfa', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontWeight: 900, color: 'white', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>Trocar exercício</h3>
              <p style={{ fontSize: '10px', color: '#737373', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{exerciseName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            style={{ color: '#737373', padding: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1rem', overflowY: 'auto', maxHeight: '55vh' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 0', gap: '0.5rem', color: '#a78bfa' }}>
              <Loader2 size={20} className="animate-spin" />
              <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>Analisando alternativas…</span>
            </div>
          )}

          {error && !loading && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{error}</p>
              <button
                type="button"
                onClick={() => { fetchedRef.current = false; fetchAlternatives() }}
                style={{ marginTop: '0.75rem', padding: '0.5rem 1rem', borderRadius: '0.75rem', background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {alternatives.map((alt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelect(alt)}
                  style={{
                    width: '100%', textAlign: 'left' as const, padding: '0.75rem', borderRadius: '0.75rem',
                    border: applied === alt.name ? '1px solid rgba(52,211,153,0.4)' : '1px solid rgba(64,64,64,0.5)',
                    background: applied === alt.name ? 'rgba(52,211,153,0.15)' : 'rgba(38,38,38,0.5)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                      {applied === alt.name ? <Check size={14} style={{ color: '#34d399' }} /> : <Dumbbell size={14} style={{ color: '#a78bfa' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' as const }}>
                        <span style={{ fontWeight: 700, color: 'white', fontSize: '0.875rem' }}>{alt.name}</span>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded-md border text-[9px] font-black ${similarityColor(alt.similarity)}`}>
                          {alt.similarity}%
                        </span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: '#a3a3a3', marginTop: '0.25rem' }}>{alt.reason}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.25rem', marginTop: '0.375rem' }}>
                        {alt.muscleGroups.map((mg, j) => (
                          <span key={j} style={{ padding: '0.125rem 0.375rem', borderRadius: '0.25rem', background: 'rgba(64,64,64,0.5)', fontSize: '9px', color: '#a3a3a3', fontFamily: 'monospace' }}>{mg}</span>
                        ))}
                        <span style={{ padding: '0.125rem 0.375rem', borderRadius: '0.25rem', background: 'rgba(64,64,64,0.5)', fontSize: '9px', color: '#737373', fontFamily: 'monospace' }}>{alt.equipment}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer close button */}
        <div style={{ padding: '0.75rem 1rem 1rem' }}>
          <button
            type="button"
            onClick={closeModal}
            style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', background: '#262626', border: '1px solid #404040', color: '#a3a3a3', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  ) : null

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

      {/* Portal modal — rendered at document.body to escape ExerciseCard event handling */}
      {modalContent && typeof document !== 'undefined' && createPortal(modalContent, document.body)}
    </>
  )
}
