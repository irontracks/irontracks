'use client'

import { Flame, Clock, TrendingUp, Dumbbell, FileText } from 'lucide-react'

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
    { key: '7', label: '7d' },
    { key: '30', label: '30d' },
    { key: '90', label: '90d' },
    { key: 'all', label: 'Tudo' },
]

/**
 * Premium gold summary card shown at the top of the history list.
 * Displays aggregate metrics (session count, time, volume) and period filter pills.
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
        <div className="rounded-2xl border border-yellow-500/20 shadow-lg shadow-yellow-500/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-yellow-600/5 to-transparent pointer-events-none" />
            <div className="absolute top-0 right-0 w-40 h-40 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/4" />
            <div className="relative p-4">
                {/* Header: title + period filter pills */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-yellow-500/70 font-black">Resumo</div>
                        <div className="text-lg font-black tracking-tight text-white">{rangeLabel}</div>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                        {RANGE_OPTIONS.map((opt) => (
                            <button
                                key={opt.key}
                                type="button"
                                onClick={() => onRangeChange(opt.key)}
                                className={`min-h-[36px] px-3 rounded-full text-[11px] font-black uppercase tracking-wider transition-all duration-300 active:scale-95 whitespace-nowrap ${range === opt.key ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30' : 'bg-neutral-900/80 border border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
                    <div className="bg-gradient-to-br from-yellow-500/15 to-yellow-600/5 border border-yellow-500/30 rounded-xl p-3 relative overflow-hidden">
                        <div className="absolute top-2 right-2 opacity-10">
                            <Flame size={28} className="text-yellow-500" />
                        </div>
                        <div className="relative">
                            <div className="text-[10px] uppercase tracking-wider text-yellow-500/80 font-bold">Treinos</div>
                            <div className="text-2xl font-black tracking-tight text-white mt-0.5">{summary.count}</div>
                        </div>
                    </div>
                    {[
                        { icon: <Clock size={12} className="text-yellow-500/60" />, label: 'Tempo', value: <>{summary.totalMinutes}<span className="text-xs text-neutral-500 font-black ml-1">min</span></> },
                        { icon: <TrendingUp size={12} className="text-yellow-500/60" />, label: 'Média', value: <>{summary.avgMinutes}<span className="text-xs text-neutral-500 font-black ml-1">min</span></> },
                        { icon: <Dumbbell size={12} className="text-yellow-500/60" />, label: 'Volume', value: summary.volumeLabel },
                    ].map(({ icon, label, value }) => (
                        <div key={label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className="flex items-center gap-1.5 mb-1">
                                {icon}
                                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">{label}</div>
                            </div>
                            <div className="text-xl font-black tracking-tight text-white">{value}</div>
                        </div>
                    ))}
                </div>

                {/* Report buttons */}
                {!loading && hasItems && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-800/70">
                        <FileText size={14} className="text-neutral-500 flex-shrink-0" />
                        <span className="text-[11px] text-neutral-500 font-bold uppercase tracking-wider flex-shrink-0">Relatórios</span>
                        <div className="flex-1" />
                        <button
                            type="button"
                            onClick={() => onOpenReport('week')}
                            className="h-8 px-3 rounded-lg bg-yellow-500/10 text-yellow-500 text-[11px] font-black uppercase tracking-wider hover:bg-yellow-500/20 transition-all duration-300 active:scale-95 border border-yellow-500/20"
                        >
                            Semanal
                        </button>
                        <button
                            type="button"
                            onClick={() => onOpenReport('month')}
                            className="h-8 px-3 rounded-lg bg-neutral-800/80 text-neutral-300 text-[11px] font-black uppercase tracking-wider hover:bg-neutral-800 transition-all duration-300 active:scale-95 border border-neutral-700/50"
                        >
                            Mensal
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
