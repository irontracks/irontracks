'use client'

import { CalendarDays } from 'lucide-react'
import { brtDateKey } from '@/utils/cron/dateBrt'
import { weekRangeOfDayBrt } from '@/utils/cron/weekRangeBrt'

/**
 * O divisor "Semana de dd/mm" que separa os blocos dos históricos.
 *
 * Existia só no histórico de treino, desenhado inline, e a semana dele
 * começava na SEGUNDA — contra a decisão de 24/08/2026, em que a semana do
 * app passou a ser **domingo→sábado, BRT** (`utils/cron/weekRangeBrt.ts`).
 * O guard `semanaComecaNoDomingo` não o pegava porque o cálculo passava por
 * uma variável intermediária (`dayOfWeek`) em vez de chamar `getDay()` na
 * mesma expressão: guard de forma erra quando a forma muda.
 *
 * Isso importa além da estética. Quem treina domingo lia o treino sob o
 * cabeçalho da semana ANTERIOR, enquanto o push "Resumo da semana" já o
 * contava na semana corrente — duas contagens da mesma semana no mesmo app.
 * Foi exatamente esse defeito que fez o resumo da Fran dizer 5 treinos em 6.
 */

/** O domingo BRT que abre a semana de um instante (ms). `null` se não dá para saber. */
export function weekStartOfMs(dateMs: number | null | undefined): string | null {
    if (!dateMs || !Number.isFinite(dateMs)) return null
    const dayKey = brtDateKey(new Date(dateMs))
    return dayKey ? weekRangeOfDayBrt(dayKey).startDay : null
}

/** O domingo BRT que abre a semana de um dia-calendário `YYYY-MM-DD`. */
export function weekStartOfDay(dayKey: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null
    return weekRangeOfDayBrt(dayKey).startDay
}

/**
 * "Semana de 24/08". Formatado pelos pedaços da string, nunca por `Date`:
 * `new Date('2026-08-24')` é meia-noite UTC — no Brasil, ainda dia 23.
 */
export function weekDividerLabel(startDay: string): string {
    const [, mes, dia] = startDay.split('-')
    return dia && mes ? `Semana de ${dia}/${mes}` : ''
}

/**
 * As classes ficam LITERAIS: o Tailwind v4 varre o código como texto e
 * `via-${cor}-500/20` não gera CSS nenhum — a linha some sem erro.
 */
const ACCENT = {
    yellow: {
        line: 'bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent',
        pill: 'text-yellow-500/70 bg-yellow-500/5 border-yellow-500/15',
    },
    green: {
        line: 'bg-gradient-to-r from-transparent via-green-500/20 to-transparent',
        pill: 'text-green-500/70 bg-green-500/5 border-green-500/15',
    },
} as const

export function HistoryWeekDivider({ label, accent = 'yellow' }: { label: string; accent?: keyof typeof ACCENT }) {
    const tema = ACCENT[accent]
    return (
        <div className="flex items-center gap-2 mb-3 pt-1">
            <div className={`h-px flex-1 ${tema.line}`} />
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] border px-3 py-1 rounded-full ${tema.pill}`}>
                <CalendarDays size={10} aria-hidden="true" /> {label}
            </span>
            <div className={`h-px flex-1 ${tema.line}`} />
        </div>
    )
}
