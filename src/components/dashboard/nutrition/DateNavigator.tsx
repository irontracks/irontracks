'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

function formatDateLabel(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'Hoje'
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date(todayStr + 'T12:00:00')
  const diff = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 1) return 'Ontem'
  if (diff === -1) return 'Amanhã'
  try {
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
  } catch {
    return dateStr
  }
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function DateNavigator({
  currentDate,
  todayDate,
  onDateChange,
}: {
  currentDate: string
  todayDate: string
  onDateChange: (date: string) => void
}) {
  const isToday = currentDate === todayDate
  const isFuture = currentDate > todayDate
  const label = formatDateLabel(currentDate, todayDate)

  return (
    <div className="flex items-center justify-center gap-3 mb-4">
      <button
        type="button"
        onClick={() => onDateChange(shiftDate(currentDate, -1))}
        className="h-9 w-9 grid place-items-center rounded-xl bg-neutral-900/60 border border-neutral-800/60 hover:bg-neutral-800/80 active:scale-95 transition"
        aria-label="Dia anterior"
      >
        <ChevronLeft size={16} className="text-neutral-300" />
      </button>

      <button
        type="button"
        onClick={() => !isToday && onDateChange(todayDate)}
        className={`
          min-w-[140px] h-9 rounded-xl px-4 text-sm font-semibold tracking-tight transition
          ${isToday
            ? 'bg-yellow-500/12 border border-yellow-500/25 text-yellow-300'
            : 'bg-neutral-900/60 border border-neutral-800/60 text-neutral-200 hover:bg-neutral-800/80'}
        `}
      >
        {label}
        {!isToday && (
          <span className="ml-1.5 text-[10px] text-neutral-500">{currentDate.slice(5)}</span>
        )}
      </button>

      <button
        type="button"
        onClick={() => !isFuture && onDateChange(shiftDate(currentDate, 1))}
        disabled={isFuture}
        className="h-9 w-9 grid place-items-center rounded-xl bg-neutral-900/60 border border-neutral-800/60 hover:bg-neutral-800/80 active:scale-95 transition disabled:opacity-30"
        aria-label="Próximo dia"
      >
        <ChevronRight size={16} className="text-neutral-300" />
      </button>
    </div>
  )
}
