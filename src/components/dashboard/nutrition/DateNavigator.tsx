'use client'

import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

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
  onOpenHistory,
}: {
  currentDate: string
  todayDate: string
  onDateChange: (date: string) => void
  /** Abre a lista de dias. Sem ela, chegar a três semanas atrás custa 21 toques. */
  onOpenHistory?: () => void
}) {
  const isToday = currentDate === todayDate
  /**
   * HOJE é o fim da linha — a seta não pode levar para amanhã.
   *
   * Era `currentDate > todayDate`: estando em hoje isso é `false`, então a
   * seta ficava ATIVA e navegava para o dia seguinte. Amanhã não tem refeição
   * lançada, e o estado vazio da tela diz "nenhuma refeição registrada" — o
   * app afirmando que a pessoa não comeu num dia que ainda não chegou.
   *
   * A volta existia (a seta da esquerda), mas o caminho inteiro é ruído: não há
   * o que registrar no futuro, porque o dia fecha à meia-noite.
   */
  const semProximoDia = currentDate >= todayDate
  const label = formatDateLabel(currentDate, todayDate)

  return (
    <div className="flex items-center justify-center gap-2 mb-4">
      <button
        type="button"
        onClick={() => onDateChange(shiftDate(currentDate, -1))}
        className="tap-44 h-9 w-9 grid place-items-center rounded-xl bg-neutral-900/60 border border-neutral-800/60 hover:bg-neutral-800/80 active:scale-95 transition"
        aria-label="Dia anterior"
      >
        <ChevronLeft size={16} className="text-neutral-300" />
      </button>

      <button
        type="button"
        onClick={() => !isToday && onDateChange(todayDate)}
        className={`
          min-w-[104px] tap-44 h-9 rounded-xl px-4 text-sm font-semibold tracking-tight transition
          ${isToday
            ? 'bg-yellow-500/10 border border-yellow-500/25 text-yellow-400'
            : 'bg-neutral-900/60 border border-neutral-800/60 text-neutral-200 hover:bg-neutral-800/80'}
        `}
      >
        {label}
        {!isToday && (
          <span className="ml-1.5 text-[10px] text-neutral-400">{currentDate.slice(5)}</span>
        )}
      </button>

      <button
        type="button"
        onClick={() => !semProximoDia && onDateChange(shiftDate(currentDate, 1))}
        disabled={semProximoDia}
        className="tap-44 h-9 w-9 grid place-items-center rounded-xl bg-neutral-900/60 border border-neutral-800/60 hover:bg-neutral-800/80 active:scale-95 transition disabled:opacity-30"
        aria-label="Próximo dia"
      >
        <ChevronRight size={16} className="text-neutral-300" />
      </button>

      {/* Com RÓTULO, não só o ícone: o dono não achou o histórico quando ele era
          um calendário mudo ao lado das setas — e num navegador de datas o
          ícone de calendário lê como "escolher data", não como "ver o passado".
          Ícone sozinho é atalho para quem já sabe que a função existe. */}
      {onOpenHistory && (
        <button
          type="button"
          onClick={onOpenHistory}
          className="tap-44 h-9 inline-flex items-center gap-1.5 rounded-xl border border-neutral-800/60 bg-neutral-900/60 px-2.5 text-[11px] font-semibold text-neutral-300 transition hover:bg-neutral-800/80 active:scale-95"
          aria-label="Histórico de nutrição"
        >
          <CalendarDays size={14} className="text-neutral-400" />
          Histórico
        </button>
      )}
    </div>
  )
}
