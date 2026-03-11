'use client'

import { UserSettings } from '@/schemas/settings'
import { getProfileCompletenessScore } from '@/schemas/settings'

type ProfileIncompleteBannerProps = {
  settings?: UserSettings | null
  onComplete: () => void
}

export const ProfileIncompleteBanner = ({ settings, onComplete }: ProfileIncompleteBannerProps) => {
  const { score, missingFields } = getProfileCompletenessScore(settings)

  // Don't show banner if profile is ≥90% complete
  if (score >= 90) return null

  const firstMissing = missingFields.slice(0, 2).join(', ')
  const extra = missingFields.length > 2 ? ` e mais ${missingFields.length - 2}` : ''

  // Determine color based on score
  const isLow = score < 40

  return (
    <div
      className={`rounded-2xl border p-4 flex items-center gap-4 ${
        isLow
          ? 'bg-red-500/5 border-red-500/20'
          : 'bg-yellow-500/5 border-yellow-500/20'
      }`}
    >
      {/* Completion ring */}
      <div className="relative flex-shrink-0 w-12 h-12">
        <svg width="48" height="48" className="-rotate-90">
          <circle cx="24" cy="24" r="18" fill="none" stroke="#262626" strokeWidth="3" />
          <circle
            cx="24" cy="24" r="18" fill="none"
            stroke={isLow ? '#f87171' : '#facc15'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 18}`}
            strokeDashoffset={`${2 * Math.PI * 18 * (1 - score / 100)}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-[11px] font-black ${isLow ? 'text-red-400' : 'text-yellow-400'}`}>
            {score}%
          </span>
        </div>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${isLow ? 'text-red-400' : 'text-yellow-400'}`}>
          Complete seu perfil
        </p>
        <p className="text-xs text-neutral-400 leading-snug truncate">
          {firstMissing ? `Falta: ${firstMissing}${extra}` : 'Adicione mais informações para cálculos mais precisos.'}
        </p>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onComplete}
        className={`shrink-0 font-black text-[11px] uppercase tracking-wider px-3 py-2 rounded-xl active:scale-95 transition-all ${
          isLow
            ? 'bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/20'
            : 'bg-yellow-500 text-black hover:bg-yellow-400'
        }`}
      >
        Ver perfil
      </button>
    </div>
  )
}
