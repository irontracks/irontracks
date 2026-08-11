'use client'

import Image from 'next/image'

// ────────────────────────────────────────────────────────────────
// Illustration presets — nano banana characters
// ────────────────────────────────────────────────────────────────

const ILLUSTRATIONS = {
  workouts: '/illustrations/empty-workouts.png',
  history: '/illustrations/empty-history.png',
  community: '/illustrations/empty-community.png',
  error: '/illustrations/error-state.png',
} as const

export type EmptyStateVariant = keyof typeof ILLUSTRATIONS

// ────────────────────────────────────────────────────────────────
// EmptyState Component
// ────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  /** Illustration variant */
  variant: EmptyStateVariant
  /** Main title */
  title: string
  /** Supporting description */
  description?: string
  /** Optional CTA button */
  action?: {
    label: string
    onClick: () => void
  }
  /** Custom className for wrapper */
  className?: string
  /** Compact mode (smaller illustration) */
  compact?: boolean
}

export function EmptyState({ variant, title, description, action, className = '', compact = false }: EmptyStateProps) {
  const imgSize = compact ? 100 : 160

  return (
    <div className={`flex flex-col items-center justify-center py-8 px-4 text-center ${className}`}>
      <div
        className="relative mb-4 opacity-90"
        style={{ width: imgSize, height: imgSize }}
      >
        <Image
          src={ILLUSTRATIONS[variant]}
          alt=""
          width={imgSize}
          height={imgSize}
          className="object-contain drop-shadow-lg"
          priority={false}
        />
      </div>

      <h3 className="text-base font-bold text-neutral-200 mb-1">
        {title}
      </h3>

      {/* `neutral-400`, não `neutral-500`: medido, #737373 sobre #0a0a0a dá
          4.18:1 e reprova no WCAG AA (mínimo 4.5:1 para texto normal).
          #a3a3a3 dá 7.85:1. O `WorkoutCard` já tinha essa lição escrita em
          comentário — aqui ela não tinha chegado.
          `text-balance` distribui as linhas: sem ele, "Monte um programa de 4,
          6 ou 8 semanas aqui mesmo." deixava a palavra "mesmo" sozinha na
          segunda linha, em texto centralizado, onde o órfão é mais visível. */}
      {description && (
        <p className="text-sm text-neutral-400 max-w-xs leading-relaxed text-balance">
          {description}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm rounded-xl transition-all hover:scale-[1.02] active:scale-95 min-h-[44px]"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
