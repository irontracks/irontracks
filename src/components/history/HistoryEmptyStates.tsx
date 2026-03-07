'use client'

import { Trophy } from 'lucide-react'

type EmptyProps = {
    isReadOnly: boolean
    onAdd: () => void
}

/**
 * Shown when the user has zero workout history at all.
 */
export function HistoryEmptyState({ isReadOnly, onAdd }: EmptyProps) {
    return (
        <div
            className="text-center py-12 rounded-2xl relative overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
            <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/5 via-transparent to-transparent pointer-events-none" />
            <div className="relative">
                <div className="w-16 h-16 mx-auto bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/30 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-yellow-500/10">
                    <Trophy className="text-yellow-500" size={28} />
                </div>
                <div className="text-white font-black text-lg">Comece sua jornada</div>
                <div className="text-neutral-500 text-sm mt-1 max-w-xs mx-auto">
                    Registre seu primeiro treino e acompanhe sua evolução ao longo do tempo.
                </div>
                {!isReadOnly && (
                    <div className="mt-5">
                        <button
                            type="button"
                            onClick={onAdd}
                            className="min-h-[44px] px-6 py-2.5 bg-yellow-500 text-black rounded-xl hover:bg-yellow-400 font-black shadow-lg shadow-yellow-500/20 transition-all duration-300 active:scale-95 text-sm"
                        >
                            Adicionar primeiro treino
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

type EmptyPeriodProps = {
    onSeeAll: () => void
    on90Days: () => void
}

/**
 * Shown when the selected period has no workouts but other periods have data.
 */
export function HistoryEmptyPeriod({ onSeeAll, on90Days }: EmptyPeriodProps) {
    return (
        <div
            className="rounded-2xl p-5"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
            <div className="text-white font-black">Sem treinos nesse período</div>
            <div className="text-sm text-neutral-500 mt-1">Aumente o período para visualizar mais resultados.</div>
            <div className="mt-4 flex gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={onSeeAll}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-yellow-500 text-black font-black shadow-lg shadow-yellow-500/20 transition-all duration-300 active:scale-95"
                >
                    Ver tudo
                </button>
                <button
                    type="button"
                    onClick={on90Days}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-black transition-all duration-300 active:scale-95"
                >
                    Últimos 90 dias
                </button>
            </div>
        </div>
    )
}
