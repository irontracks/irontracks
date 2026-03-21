'use client'

import React, { useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import { Play, Share2, Pencil, Trash2, Loader2, Undo2 } from 'lucide-react'
import type { DashboardWorkout } from '@/types/dashboard'
import { isPeriodizedWorkoutFullyLoaded } from '@/hooks/usePeriodizedWorkouts'

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

type MaybePromise<T> = T | Promise<T>

type PendingActionType = 'open' | 'start' | 'restore' | 'share' | 'duplicate' | 'edit' | 'delete'

interface WorkoutCardProps {
  workout: DashboardWorkout
  idx: number
  density: 'compact' | 'comfortable'
  isPeriodized: boolean
  onQuickView: (w: DashboardWorkout) => void
  onStartSession: (w: DashboardWorkout) => MaybePromise<void | boolean>
  onRestoreWorkout?: (w: DashboardWorkout) => MaybePromise<void>
  onShareWorkout: (w: DashboardWorkout) => MaybePromise<void>
  onEditWorkout: (w: DashboardWorkout) => MaybePromise<void>
  onDeleteWorkout: (id?: string, title?: string) => MaybePromise<void>
  onLoadFullWorkout: (id: string) => Promise<DashboardWorkout | null>
  onPeriodizedError: (msg: string) => void
  onPeriodizedWorkoutLoaded: (full: DashboardWorkout) => void
}

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const accentColors = [
  { border: 'border-yellow-500', gradient: 'from-yellow-500/5' },
  { border: 'border-orange-500', gradient: 'from-orange-500/5' },
  { border: 'border-amber-500', gradient: 'from-amber-500/5' },
  { border: 'border-purple-500', gradient: 'from-purple-500/5' },
]

// ────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────

export function WorkoutCard({
  workout: w,
  idx,
  density,
  isPeriodized,
  onQuickView,
  onStartSession,
  onRestoreWorkout,
  onShareWorkout,
  onEditWorkout,
  onDeleteWorkout,
  onLoadFullWorkout,
  onPeriodizedError,
  onPeriodizedWorkoutLoaded,
}: WorkoutCardProps) {
  const [pendingAction, setPendingAction] = useState<{ type: PendingActionType } | null>(null)
  const isMountedRef = useRef(true)
  React.useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  const accent = accentColors[idx % accentColors.length]
  const isActive = false // FUTURE: connect to active session state
  const workoutKey = String(w?.id || idx)
  const isBusy = !!pendingAction

  const runAction = useCallback(
    async (type: PendingActionType, fn: () => MaybePromise<void | boolean | DashboardWorkout | null>) => {
      if (pendingAction) return
      setPendingAction({ type })
      try {
        await fn()
      } catch {
        // noop
      } finally {
        if (isMountedRef.current) setPendingAction(null)
      }
    },
    [pendingAction],
  )

  const isActionBusy = (type: PendingActionType) => pendingAction?.type === type

  const handleClick = () => {
    if (isBusy) return
    if (isPeriodized && !isPeriodizedWorkoutFullyLoaded(w)) {
      runAction('open', async () => {
        const id = String(w?.id || '').trim()
        const full = await onLoadFullWorkout(id)
        if (!full) {
          onPeriodizedError('Não foi possível carregar os detalhes desse treino.')
          return
        }
        if (!Array.isArray(full?.exercises) || full.exercises.length === 0) {
          onPeriodizedError('Esse treino está sem exercícios. Refaça a periodização para recriar os treinos.')
          return
        }
        onPeriodizedWorkoutLoaded(full)
        onQuickView(full)
      })
      return
    }
    onQuickView(w)
  }

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (w?.archived_at) {
      if (typeof onRestoreWorkout !== 'function') return
      await runAction('restore', () => onRestoreWorkout?.(w))
      return
    }
    await runAction('start', async () => {
      if (isPeriodized && !isPeriodizedWorkoutFullyLoaded(w)) {
        const id = String(w?.id || '').trim()
        const full = await onLoadFullWorkout(id)
        if (!full) {
          onPeriodizedError('Não foi possível carregar os detalhes desse treino.')
          return
        }
        if (!Array.isArray(full?.exercises) || full.exercises.length === 0) {
          onPeriodizedError('Esse treino está sem exercícios. Refaça a periodização para recriar os treinos.')
          return
        }
        onPeriodizedWorkoutLoaded(full)
        await onStartSession(full)
        return
      }
      await onStartSession(w)
    })
  }

  return (
    <div
      key={workoutKey}
      className={[
        'rounded-xl p-4 border-l-4 transition-all group relative overflow-hidden cursor-pointer shadow-sm shadow-black/30',
        `bg-gradient-to-r ${accent.gradient} via-neutral-800/80 to-neutral-800`,
        accent.border,
        isActive ? 'ring-2 ring-green-500/60' : '',
        density === 'compact' ? 'p-3' : 'p-4',
      ].join(' ')}
      onClick={handleClick}
    >
      <div className="relative z-10">
        {isActive && (
          <div className="absolute -top-1 -left-1 w-3 h-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </div>
        )}
        <h3 className="font-black text-white text-base uppercase mb-0.5 pr-28 leading-tight">{String(w?.title || 'Treino')}</h3>
        <p className="text-[11px] text-neutral-500 font-mono mb-3">
          {(Number.isFinite(Number(w?.exercises_count)) ? Math.max(0, Math.floor(Number(w.exercises_count))) : Array.isArray(w?.exercises) ? w.exercises.length : 0)} exercícios
        </p>
        {w?.archived_at ? (
          <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 bg-neutral-900/60 border border-neutral-700 px-2 py-1 rounded-lg mb-2">
            ARQUIVADO
          </div>
        ) : null}

        <div className="flex gap-2 mt-2">
          <button
            onClick={handleStart}
            data-tour="workout-start"
            disabled={isBusy || (Boolean(w?.archived_at) && typeof onRestoreWorkout !== 'function')}
            className="relative z-30 flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 text-yellow-400 hover:text-yellow-300 font-black text-sm transition-all border border-yellow-500/40 hover:border-yellow-500/70 active:scale-95 touch-manipulation disabled:opacity-60 btn-gold-animated !text-black"
          >
            {w?.archived_at ? (
              isActionBusy('restore') ? (
                <>
                  <Loader2 size={16} className="text-yellow-500 animate-spin" /> RESTAURANDO...
                </>
              ) : (
                <>
                  <Undo2 size={16} /> RESTAURAR
                </>
              )
            ) : isActionBusy('start') ? (
              <>
                <Loader2 size={16} className="text-yellow-500 animate-spin" /> INICIANDO...
              </>
            ) : (
              <>
                <Image src="/icons/btn-iniciar-treino.png" alt="" width={20} height={20} className="rounded-[3px]" unoptimized /> INICIAR TREINO
              </>
            )}
          </button>
        </div>
      </div>

      <div className="absolute top-2 right-2 flex gap-1 opacity-100 transition-opacity z-20 bg-neutral-900/50 backdrop-blur-sm rounded-lg p-1 border border-white/5 md:opacity-0 md:group-hover:opacity-100">
        <button
          onClick={async (e) => { e.stopPropagation(); await runAction('share', () => onShareWorkout(w)) }}
          disabled={isBusy}
          className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-white disabled:opacity-60"
        >
          {isActionBusy('share') ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <Share2 size={14} />}
        </button>
        <button
          onClick={async (e) => { e.stopPropagation(); await runAction('edit', () => onEditWorkout(w)) }}
          disabled={isBusy}
          className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-white disabled:opacity-60"
        >
          {isActionBusy('edit') ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <Pencil size={14} />}
        </button>
        <button
          onClick={async (e) => { e.stopPropagation(); await runAction('delete', () => onDeleteWorkout(w?.id, w?.title)) }}
          disabled={isBusy}
          className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-red-400 disabled:opacity-60"
        >
          {isActionBusy('delete') ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  )
}
