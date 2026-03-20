'use client'

function safeNumber(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

type DayData = { date: string; calories: number }

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export default function WeeklyChart({
  data,
  goal,
  currentDate,
}: {
  data: DayData[]
  goal: number
  currentDate: string
}) {
  if (!data || data.length === 0) return null

  const safeGoal = Math.max(1, safeNumber(goal))
  const maxVal = Math.max(safeGoal, ...data.map((d) => safeNumber(d.calories)))

  return (
    <div className="rounded-2xl bg-neutral-900/60 border border-neutral-800/60 p-4 ring-1 ring-neutral-800/50">
      <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-3">Últimos 7 dias</div>
      <div className="flex items-end justify-between gap-1.5" style={{ height: 64 }}>
        {data.map((day) => {
          const val = safeNumber(day.calories)
          const pct = maxVal > 0 ? Math.max(4, (val / maxVal) * 100) : 4
          const isToday = day.date === currentDate
          const overGoal = val > safeGoal
          const dayOfWeek = new Date(day.date + 'T12:00:00').getDay()

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end justify-center" style={{ height: 48 }}>
                <div
                  className={`
                    w-full max-w-[20px] rounded-md transition-all duration-300
                    ${isToday
                      ? overGoal ? 'bg-red-400/80' : 'bg-yellow-400/90'
                      : overGoal ? 'bg-red-500/40' : 'bg-neutral-700/70'}
                    ${isToday ? 'ring-1 ring-yellow-400/40' : ''}
                  `}
                  style={{ height: `${pct}%`, minHeight: 3 }}
                  title={`${day.date}: ${Math.round(val)} kcal`}
                />
              </div>
              <div className={`text-[9px] tabular-nums ${isToday ? 'text-yellow-400 font-bold' : 'text-neutral-600'}`}>
                {WEEKDAY_LABELS[dayOfWeek]}
              </div>
            </div>
          )
        })}
      </div>
      {/* Goal line marker */}
      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex-1 h-px bg-neutral-700/50 relative">
          <div className="absolute left-0 top-0 h-px bg-yellow-500/30" style={{ width: `${(safeGoal / maxVal) * 100}%` }} />
        </div>
        <div className="text-[9px] text-neutral-600 tabular-nums">{Math.round(safeGoal)}</div>
      </div>
    </div>
  )
}
