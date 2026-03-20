'use client'
/**
 * NutritionWeekComparison
 *
 * Compares this week's daily average vs last week for calories and protein.
 * Reads from the weekly data already available in NutritionMixer.
 */
import { memo, useMemo } from 'react'

interface DayData { date: string; calories: number }

interface Props {
  weeklyData: DayData[]
}

function avg(values: number[]): number {
  const filtered = values.filter(v => v > 0)
  if (!filtered.length) return 0
  return Math.round(filtered.reduce((s, v) => s + v, 0) / filtered.length)
}

function TrendBadge({ value, prev }: { value: number; prev: number }) {
  if (!prev || !value) return null
  const diff = Math.round(((value - prev) / prev) * 100)
  if (Math.abs(diff) < 1) return <span className="text-[10px] text-neutral-500">= estável</span>
  if (diff > 0) return <span className="text-[10px] text-red-400">▲ +{diff}%</span>
  return <span className="text-[10px] text-green-400">▼ {diff}%</span>
}

const NutritionWeekComparison = memo(function NutritionWeekComparison({ weeklyData }: Props) {
  const comparison = useMemo(() => {
    if (!weeklyData || weeklyData.length < 2) return null

    // Sort by date
    const sorted = [...weeklyData].sort((a, b) => a.date.localeCompare(b.date))

    // Split: last 7 days = this week, previous 7 days = last week
    const thisWeek = sorted.slice(-7)
    const lastWeek = sorted.slice(-14, -7)

    if (thisWeek.length < 1) return null

    const thisAvg = avg(thisWeek.map(d => d.calories))
    const lastAvg = avg(lastWeek.map(d => d.calories))

    // Build bar chart data for this week (last 7 days)
    const bars = thisWeek.map(d => ({
      label: new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3),
      kcal: d.calories,
    }))

    return { thisAvg, lastAvg, bars }
  }, [weeklyData])

  if (!comparison) return null

  const maxKcal = Math.max(...comparison.bars.map(b => b.kcal), 1)

  return (
    <div className="rounded-2xl bg-neutral-900/70 border border-neutral-800 p-4 ring-1 ring-neutral-800/70">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Semana Atual vs Anterior</div>
        {comparison.lastAvg > 0 && (
          <TrendBadge value={comparison.thisAvg} prev={comparison.lastAvg} />
        )}
      </div>

      {/* Mini bar chart for this week */}
      <div className="flex items-end gap-1.5 h-14 mb-3">
        {comparison.bars.map((b, i) => {
          const h = Math.round((b.kcal / maxKcal) * 100)
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex items-end h-10">
                <div
                  className="w-full rounded-t-sm bg-yellow-400/60 transition-all duration-500"
                  style={{ height: b.kcal > 0 ? `${Math.max(6, h)}%` : '2px' }}
                  title={`${b.label}: ${Math.round(b.kcal)} kcal`}
                />
              </div>
              <div className="text-[8px] text-neutral-600">{b.label}</div>
            </div>
          )
        })}
      </div>

      {/* Averages */}
      <div className="flex gap-3">
        <div className="flex-1 rounded-xl bg-neutral-900/80 border border-neutral-800 px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-neutral-500">Esta semana</div>
          <div className="text-sm font-semibold text-yellow-300 mt-0.5">{comparison.thisAvg} kcal/dia</div>
        </div>
        {comparison.lastAvg > 0 && (
          <div className="flex-1 rounded-xl bg-neutral-900/80 border border-neutral-800 px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-neutral-500">Semana passada</div>
            <div className="text-sm font-semibold text-neutral-400 mt-0.5">{comparison.lastAvg} kcal/dia</div>
          </div>
        )}
      </div>
    </div>
  )
})

export default NutritionWeekComparison
