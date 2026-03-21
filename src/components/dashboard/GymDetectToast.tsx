'use client'

import { useState } from 'react'

interface GymDetectToastProps {
  gymName: string
  distance: number | null
  onStartWorkout: () => void
  onCheckin: () => void
  onDismiss: () => void
  loading?: boolean
}

export default function GymDetectToast({ gymName, distance, onStartWorkout, onCheckin, onDismiss, loading }: GymDetectToastProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss()
  }

  return (
    <div
      className="fixed bottom-20 left-4 right-4 z-[1100] animate-slide-up"
      style={{ animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      <div
        className="relative rounded-2xl border p-4 backdrop-blur-xl"
        style={{
          background: 'linear-gradient(135deg, rgba(15,15,15,0.98) 0%, rgba(20,18,12,0.98) 100%)',
          borderColor: 'rgba(234,179,8,0.3)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(234,179,8,0.15)',
        }}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute right-3 top-3 rounded-full p-1 text-white/40 hover:text-white/80 transition-colors"
          aria-label="Fechar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Icon + Text */}
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>

          <div className="flex-1 pr-6">
            <p className="text-sm font-bold text-white">{gymName}</p>
            <p className="text-xs text-white/50 mt-0.5">
              {distance ? `${distance}m de distância` : 'Você está aqui!'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={onStartWorkout}
            disabled={loading}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold text-black transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
          >
            {loading ? '...' : '🏋️ Iniciar Treino'}
          </button>
          <button
            onClick={onCheckin}
            disabled={loading}
            className="rounded-xl border px-4 py-2.5 text-sm font-medium text-white/70 transition-all active:scale-95 hover:text-white disabled:opacity-50"
            style={{ borderColor: 'rgba(255,255,255,0.15)' }}
          >
            📍 Check-in
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
