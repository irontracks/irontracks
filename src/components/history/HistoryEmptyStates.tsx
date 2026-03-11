'use client'

import NextImage from 'next/image'

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
            className="rounded-2xl relative overflow-hidden text-center"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
            {/* Sprint athlete hero image */}
            <div className="relative w-full h-44 overflow-hidden">
                <NextImage
                    src="/empty-journey.png"
                    alt=""
                    fill
                    priority
                    unoptimized
                    className="object-cover object-center scale-110"
                />
                {/* Bottom fade */}
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/30 to-transparent" />
                {/* Top vignette */}
                <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/60 via-transparent to-transparent" />
            </div>

            {/* Content */}
            <div className="px-6 pb-6 -mt-2">
                <div className="text-white font-black text-lg">Comece sua jornada</div>
                <div className="text-neutral-500 text-sm mt-1 max-w-xs mx-auto leading-relaxed">
                    Registre seu primeiro treino e acompanhe sua evolução ao longo do tempo.
                </div>
                {!isReadOnly && (
                    <div className="mt-5">
                        <button
                            type="button"
                            onClick={onAdd}
                            className="min-h-[44px] px-6 py-2.5 rounded-xl font-black text-black text-sm transition-all active:scale-95"
                            style={{
                                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)',
                                boxShadow: '0 4px 20px rgba(234,179,8,0.35)',
                            }}
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
            className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
            {/* Empty calendar hero */}
            <div className="relative w-full h-36 overflow-hidden">
                <NextImage
                    src="/empty-period.png"
                    alt=""
                    fill
                    unoptimized
                    className="object-cover object-center scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/20 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/50 via-transparent to-transparent" />
            </div>

            {/* Content */}
            <div className="px-5 pb-5 -mt-1">
                <div className="text-white font-black">Sem treinos nesse período</div>
                <div className="text-sm text-neutral-500 mt-1">Aumente o período para visualizar mais resultados.</div>
                <div className="mt-4 flex gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={onSeeAll}
                        className="min-h-[44px] px-4 py-2 rounded-xl font-black text-black text-sm transition-all active:scale-95"
                        style={{
                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                            boxShadow: '0 4px 16px rgba(234,179,8,0.3)',
                        }}
                    >
                        Ver tudo
                    </button>
                    <button
                        type="button"
                        onClick={on90Days}
                        className="min-h-[44px] px-4 py-2 rounded-xl font-black text-neutral-200 text-sm transition-all active:scale-95"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                        Últimos 90 dias
                    </button>
                </div>
            </div>
        </div>
    )
}
