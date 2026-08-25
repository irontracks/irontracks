'use client'

import { Flame, Clock, TrendingUp, Dumbbell, FileText } from 'lucide-react'
import { HistorySummaryShell } from '@/components/history/HistorySummaryShell'

export type HistorySummary = {
    count: number
    totalMinutes: number
    avgMinutes: number
    volumeLabel: string
}

type Props = {
    summary: HistorySummary
    rangeLabel: string
    range: string
    hasItems: boolean
    loading: boolean
    onRangeChange: (range: string) => void
    onOpenReport: (type: 'week' | 'month') => void
}

const RANGE_OPTIONS = [
    { key: '7', label: '7d', ariaLabel: '7 dias' },
    { key: '30', label: '30d', ariaLabel: '30 dias' },
    { key: '90', label: '90d', ariaLabel: '90 dias' },
    { key: 'all', label: 'Tudo', ariaLabel: 'Todo o histórico' },
]

/**
 * Resumo do histórico de TREINO. O desenho mora em `HistorySummaryShell` —
 * o mesmo chassi do resumo de nutrição, para as duas telas não divergirem.
 */
export function HistorySummaryCard({
    summary,
    rangeLabel,
    range,
    hasItems,
    loading,
    onRangeChange,
    onOpenReport,
}: Props) {
    return (
        <HistorySummaryShell
            eyebrow="Resumo"
            title={rangeLabel}
            ranges={{ options: RANGE_OPTIONS, value: range, onChange: onRangeChange }}
            metrics={[
                {
                    key: 'count',
                    label: 'Treinos',
                    value: summary.count,
                    icon: <Flame size={28} className="text-yellow-500" />,
                    featured: true,
                },
                {
                    key: 'time',
                    label: 'Tempo',
                    icon: <Clock size={12} className="text-yellow-500/60" />,
                    value: <>{summary.totalMinutes}<span className="text-xs text-neutral-400 font-black ml-1">min</span></>,
                },
                {
                    key: 'avg',
                    label: 'Média',
                    icon: <TrendingUp size={12} className="text-yellow-500/60" />,
                    value: <>{summary.avgMinutes}<span className="text-xs text-neutral-400 font-black ml-1">min</span></>,
                },
                {
                    key: 'volume',
                    label: 'Volume',
                    icon: <Dumbbell size={12} className="text-yellow-500/60" />,
                    value: summary.volumeLabel,
                },
            ]}
            actions={!loading && hasItems ? {
                label: 'Relatórios',
                icon: <FileText size={14} className="text-neutral-400 flex-shrink-0" />,
                children: (
                    <>
                        <button
                            type="button"
                            onClick={() => onOpenReport('week')}
                            className="tap-44 h-8 px-3 rounded-lg bg-yellow-500/10 text-yellow-500 text-[11px] font-black uppercase tracking-wider hover:bg-yellow-500/20 transition-all duration-300 active:scale-95 border border-yellow-500/20"
                        >
                            Semanal
                        </button>
                        <button
                            type="button"
                            onClick={() => onOpenReport('month')}
                            className="tap-44 h-8 px-3 rounded-lg bg-neutral-800/80 text-neutral-300 text-[11px] font-black uppercase tracking-wider hover:bg-neutral-800 transition-all duration-300 active:scale-95 border border-neutral-700/50"
                        >
                            Mensal
                        </button>
                    </>
                ),
            } : undefined}
        />
    )
}
