'use client'
/**
 * TeacherPlanBadge
 * Small inline badge showing the teacher's current plan, student count and
 * an "Upgrade" CTA when approaching the limit.
 */
import React from 'react'
import { Users, Zap } from 'lucide-react'
import type { TeacherPlanState } from '@/hooks/useTeacherPlan'

interface TeacherPlanBadgeProps {
  planState: TeacherPlanState
  onUpgradeClick: () => void
}

export default function TeacherPlanBadge({ planState, onUpgradeClick }: TeacherPlanBadgeProps) {
  const { loading, plan, studentCount, maxStudents, canAddStudent } = planState

  if (loading) return null

  const planName = plan?.name ?? 'Free'
  const isFree = (plan?.tier_key ?? 'free') === 'free'
  const isUnlimited = maxStudents === 0
  const pct = isUnlimited ? 0 : maxStudents > 0 ? Math.min(100, Math.round((studentCount / maxStudents) * 100)) : 0
  const nearLimit = !isUnlimited && pct >= 80
  const atLimit = !isUnlimited && !canAddStudent

  const barColor = atLimit ? 'bg-red-500' : nearLimit ? 'bg-yellow-400' : 'bg-emerald-500'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800">
      {/* plan label */}
      <span className={`text-xs font-semibold uppercase tracking-wide ${isFree ? 'text-neutral-400' : 'text-yellow-400'}`}>
        {planName}
      </span>

      {/* student count */}
      <div className="flex items-center gap-1 text-xs text-neutral-300">
        <Users size={12} className="text-neutral-500" />
        <span>{studentCount}{isUnlimited ? '' : `/${maxStudents}`}</span>
      </div>

      {/* progress bar */}
      {!isUnlimited && (
        <div className="w-16 h-1.5 rounded-full bg-neutral-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* upgrade CTA */}
      {(atLimit || nearLimit || isFree) && (
        <button
          onClick={onUpgradeClick}
          className="flex items-center gap-1 text-xs font-semibold text-yellow-400 hover:text-yellow-300 transition-colors ml-1"
        >
          <Zap size={11} />
          Upgrade
        </button>
      )}
    </div>
  )
}
