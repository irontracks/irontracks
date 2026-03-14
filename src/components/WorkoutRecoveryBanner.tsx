'use client'

/**
 * @module WorkoutRecoveryBanner
 *
 * Premium-styled banner that appears when an orphaned workout finish backup
 * is detected. Allows the user to retry saving or dismiss the backup.
 */

import { useWorkoutRecovery } from '@/hooks/useWorkoutRecovery'
import { Dumbbell, RotateCcw, X, CheckCircle, AlertTriangle } from 'lucide-react'

interface WorkoutRecoveryBannerProps {
  userId: string | null | undefined
}

export default function WorkoutRecoveryBanner({ userId }: WorkoutRecoveryBannerProps) {
  const { backup, recovering, recovered, error, retryRecovery, dismissRecovery } = useWorkoutRecovery(userId)

  // Nothing to show
  if (!backup && !recovered) return null

  // Success state — auto-dismiss after 4s
  if (recovered) {
    return (
      <div
        className="mx-4 mb-4 rounded-2xl border p-4 flex items-center gap-3 animate-fade-in"
        style={{
          background: 'linear-gradient(135deg, rgba(22,101,52,0.3) 0%, rgba(12,12,12,0.95) 100%)',
          borderColor: 'rgba(74,222,128,0.3)',
        }}
      >
        <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
        <p className="text-sm text-green-300 font-medium flex-1">
          Treino recuperado com sucesso!
        </p>
      </div>
    )
  }

  // Recovery banner
  const formattedDate = (() => {
    try {
      const d = new Date(backup!.date)
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return backup!.date
    }
  })()

  return (
    <div
      className="mx-4 mb-4 rounded-2xl border p-4 relative overflow-hidden animate-fade-in"
      style={{
        background: 'linear-gradient(160deg, rgba(30,20,8,0.9) 0%, rgba(12,12,12,0.95) 50%)',
        borderColor: 'rgba(234,179,8,0.25)',
      }}
    >
      {/* Gold top line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{
            background: 'linear-gradient(135deg, rgba(234,179,8,0.2) 0%, rgba(234,179,8,0.05) 100%)',
            border: '1px solid rgba(234,179,8,0.2)',
          }}
        >
          <Dumbbell className="w-5 h-5 text-yellow-500" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-white mb-0.5">
            ⚠️ Treino não salvo encontrado
          </h4>
          <p className="text-xs text-neutral-400 mb-1">
            <span className="text-yellow-500/80 font-semibold">{backup!.workoutTitle}</span>
            {' · '}
            {backup!.exerciseCount} exercício{backup!.exerciseCount !== 1 ? 's' : ''}
            {' · '}
            {formattedDate}
          </p>

          {error && (
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={retryRecovery}
              disabled={recovering}
              className="btn-gold-animated flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 transition-all"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${recovering ? 'animate-spin' : ''}`} />
              {recovering ? 'Recuperando...' : 'Recuperar Treino'}
            </button>

            <button
              onClick={dismissRecovery}
              disabled={recovering}
              className="px-3 py-2 rounded-xl text-xs font-medium text-neutral-500 hover:text-neutral-300 transition-colors disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              Descartar
            </button>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={dismissRecovery}
          disabled={recovering}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-600 hover:text-neutral-400 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
