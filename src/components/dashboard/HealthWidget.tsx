'use client'

/**
 * HealthWidget
 *
 * Compact Apple Health summary shown on the dashboard when the user has
 * enabled the integration and has data. Shows steps, active calories,
 * resting heart rate and HRV (when available).
 */

import { HeartPulse, Footprints, Flame, Activity } from 'lucide-react'
import type { HealthKitData } from '@/hooks/useHealthKit'

interface HealthWidgetProps {
  data: HealthKitData
}

function Stat({
  icon,
  value,
  label,
  color = '#facc15',
}: {
  icon: React.ReactNode
  value: string
  label: string
  color?: string
}) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
      <div style={{ color }} className="opacity-80">{icon}</div>
      <span className="text-white font-black text-sm leading-none">{value}</span>
      <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-wide leading-none">{label}</span>
    </div>
  )
}

export default function HealthWidget({ data }: HealthWidgetProps) {
  const hasSteps = data.steps > 0
  const hasCals = data.activeCalories > 0
  const hasHR = data.restingHeartRateBpm > 0
  const hasHRV = data.sdnn > 0

  if (!hasSteps && !hasCals && !hasHR && !hasHRV) return null

  const stepsLabel = data.steps >= 1000
    ? `${(data.steps / 1000).toFixed(1)}k`
    : String(data.steps)

  return (
    <div
      className="mx-4 mb-3 rounded-2xl border border-rose-500/20 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(255,45,85,0.08) 0%, rgba(10,10,10,0.95) 100%)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#ff2d55,#ff6b87)' }}>
          <HeartPulse size={11} className="text-white" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-400">Apple Health</span>
        <span className="text-[10px] text-neutral-600 ml-auto">hoje</span>
      </div>

      {/* Stats row */}
      <div className="flex items-start px-3 pb-3 gap-1">
        {hasSteps && (
          <Stat
            icon={<Footprints size={16} />}
            value={stepsLabel}
            label="passos"
            color="#34d399"
          />
        )}
        {hasCals && (
          <Stat
            icon={<Flame size={16} />}
            value={`${data.activeCalories}`}
            label="kcal"
            color="#fb923c"
          />
        )}
        {hasHR && (
          <Stat
            icon={<HeartPulse size={16} />}
            value={`${data.restingHeartRateBpm}`}
            label="FC rep."
            color="#f43f5e"
          />
        )}
        {hasHRV && (
          <Stat
            icon={<Activity size={16} />}
            value={`${Math.round(data.sdnn)}`}
            label="HRV ms"
            color="#a78bfa"
          />
        )}
      </div>
    </div>
  )
}
