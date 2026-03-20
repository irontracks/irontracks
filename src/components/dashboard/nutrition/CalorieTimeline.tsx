'use client'
/**
 * CalorieTimeline
 * Bar chart showing calorie distribution by hour of day.
 * Requires the meal entries list from the parent.
 */
import { memo, useMemo } from 'react'

interface MealEntry {
  created_at: string
  calories: number
}

interface Props {
  entries: MealEntry[]
}

const CalorieTimeline = memo(function CalorieTimeline({ entries }: Props) {
  const hourlyData = useMemo(() => {
    // Group calories by hour (0-23)
    const map: Record<number, number> = {}
    for (const e of entries) {
      try {
        const h = new Date(e.created_at).getHours()
        map[h] = (map[h] || 0) + Math.max(0, Number(e.calories) || 0)
      } catch { /* skip */ }
    }

    // Build array covering first to last active hour (at least 6am-22pm)
    const hours = Object.keys(map).map(Number)
    if (hours.length === 0) return []
    const minH = Math.min(6, ...hours)
    const maxH = Math.max(22, ...hours)

    const result: { hour: number; kcal: number; label: string }[] = []
    for (let h = minH; h <= maxH; h++) {
      result.push({
        hour: h,
        kcal: map[h] || 0,
        label: `${h}h`,
      })
    }
    return result
  }, [entries])

  if (hourlyData.length === 0 || entries.length === 0) return null

  const maxKcal = Math.max(...hourlyData.map(d => d.kcal), 1)

  return (
    <div className="rounded-2xl bg-neutral-900/70 border border-neutral-800 p-4 ring-1 ring-neutral-800/70 overflow-hidden">
      <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 mb-3">Calorias por Horário</div>
      <div className="flex items-end gap-1 h-16">
        {hourlyData.map(d => {
          const heightPct = Math.round((d.kcal / maxKcal) * 100)
          const hasKcal = d.kcal > 0
          return (
            <div key={d.hour} className="flex-1 flex flex-col items-center gap-1 group relative">
              {/* Tooltip */}
              {hasKcal && (
                <div className="absolute bottom-full mb-1 hidden group-hover:flex bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-[10px] text-white whitespace-nowrap z-10 shadow-xl">
                  {d.label}: {Math.round(d.kcal)} kcal
                </div>
              )}
              <div className="w-full flex-1 flex items-end">
                <div
                  className={`w-full rounded-t transition-all duration-500 ${hasKcal ? 'bg-yellow-400/70' : 'bg-neutral-800/40'}`}
                  style={{ height: hasKcal ? `${Math.max(4, heightPct)}%` : '2px' }}
                />
              </div>
              <div className="text-[8px] text-neutral-600">{d.hour % 3 === 0 ? d.label : ''}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

export default CalorieTimeline
