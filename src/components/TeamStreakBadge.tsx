'use client'
import React from 'react'
import { getBadgeInfo } from '@/hooks/useTeamStreak'

interface TeamStreakBadgeProps {
    partnerName: string
    count: number
    /** If true, renders a larger card layout; otherwise a compact pill */
    variant?: 'pill' | 'card'
    className?: string
}

const BADGE_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
    gold: { bg: 'bg-yellow-500/15', border: 'border-yellow-500/40', text: 'text-yellow-300', label: 'Dupla Lendária' },
    silver: { bg: 'bg-neutral-400/10', border: 'border-neutral-400/30', text: 'text-neutral-300', label: 'Dupla de Ferro' },
    bronze: { bg: 'bg-orange-600/15', border: 'border-orange-600/30', text: 'text-orange-400', label: 'Dupla em Chamas' },
    iron: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-300', label: 'Iniciantes' },
}

/**
 * TeamStreakBadge — displays the shared session count and badge between two training partners.
 * Two variants: 'pill' for inline use and 'card' for history/profile views.
 */
export function TeamStreakBadge({ partnerName, count, variant = 'pill', className = '' }: TeamStreakBadgeProps) {
    const badgeInfo = getBadgeInfo(count)
    if (!badgeInfo || count === 0) return null

    const colors = BADGE_COLORS[badgeInfo.badge ?? 'iron'] ?? BADGE_COLORS.iron

    if (variant === 'pill') {
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${colors.bg} ${colors.border} ${colors.text} ${className}`}>
                {badgeInfo.emoji} {count} treino{count !== 1 ? 's' : ''} juntos
            </span>
        )
    }

    return (
        <div className={`rounded-2xl border p-4 ${colors.bg} ${colors.border} ${className}`}>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-2xl font-black text-white">{badgeInfo.emoji} {count}</p>
                    <p className={`text-xs font-bold ${colors.text}`}>{badgeInfo.label}</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-neutral-500">com</p>
                    <p className="text-sm font-bold text-white truncate max-w-[120px]">{partnerName}</p>
                    <p className="text-[10px] text-neutral-500">treino{count !== 1 ? 's' : ''} juntos</p>
                </div>
            </div>
            {/* Progress bar to next badge */}
            {(() => {
                const THRESHOLDS = [1, 5, 15, 30]
                const nextThreshold = THRESHOLDS.find(t => t > count)
                if (!nextThreshold) return null
                const prevThreshold = THRESHOLDS.reverse().find(t => t <= count) ?? 1
                const pct = ((count - prevThreshold) / (nextThreshold - prevThreshold)) * 100
                return (
                    <div className="mt-3">
                        <div className="flex justify-between text-[9px] text-neutral-500 mb-1">
                            <span>Próximo badge: {nextThreshold} treinos</span>
                            <span>{nextThreshold - count} restante{nextThreshold - count !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-neutral-700/60 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 transition-all duration-700" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}
