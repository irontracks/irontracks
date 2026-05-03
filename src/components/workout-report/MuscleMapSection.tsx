'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'

// BodyMapSvg uses CSS masks + PNG overlays — keep it client-only and lazy
// so it doesn't block the rest of the report from rendering.
const BodyMapSvg = dynamic(() => import('@/components/muscle-map/BodyMapSvg'), { ssr: false })

type MuscleEntry = { label?: string; sets?: number; ratio?: number; color?: string; view?: string }

type Props = {
    /** Output of getMuscleMapWeek — { muscles: Record<MuscleId, MuscleEntry>, ... } */
    data: Record<string, unknown> | null
    status: 'idle' | 'loading' | 'ready' | 'error'
    gender?: 'male' | 'female' | 'not_informed'
}

// Color buckets mirror colorForRatio in muscleMapWeekHelpers.ts so the legend
// matches what gets painted on the silhouette.
const LEGEND_BUCKETS: { label: string; color: string }[] = [
    { label: 'Nenhum', color: '#374151' },
    { label: 'Baixo', color: '#fbbf24' },
    { label: 'Na meta', color: '#ea580c' },
    { label: 'Alto', color: '#dc2626' },
    { label: 'Acima', color: '#991b1b' },
]

export function MuscleMapSection({ data, status, gender = 'male' }: Props) {
    const [view, setView] = useState<'front' | 'back'>('front')

    const musclesForView = useMemo(() => {
        const items = data && typeof data === 'object' && data.muscles && typeof data.muscles === 'object'
            ? (data.muscles as Record<string, MuscleEntry>)
            : null
        if (!items) return {} as Record<string, MuscleEntry>
        return Object.fromEntries(
            Object.entries(items).filter(([, m]) => m && (m.view === view || m.view === 'both')),
        )
    }, [data, view])

    const totalSetsThisView = useMemo(() => {
        return Object.values(musclesForView).reduce((sum, m) => sum + Number(m?.sets || 0), 0)
    }, [musclesForView])

    return (
        <div className="mb-8 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Mapa muscular</div>
                    <div className="text-lg font-black text-white">Sua semana até aqui</div>
                    <div className="text-xs text-neutral-300">Volume acumulado por grupo muscular nesta semana.</div>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-1 flex gap-1 w-fit">
                    <button
                        type="button"
                        onClick={() => setView('front')}
                        className={
                            view === 'front'
                                ? 'min-h-[36px] px-3 rounded-lg bg-neutral-900 text-yellow-500 border border-yellow-500/30 font-black text-xs uppercase tracking-widest'
                                : 'min-h-[36px] px-3 rounded-lg bg-transparent text-neutral-400 hover:text-white font-black text-xs uppercase tracking-widest'
                        }
                    >
                        Frente
                    </button>
                    <button
                        type="button"
                        onClick={() => setView('back')}
                        className={
                            view === 'back'
                                ? 'min-h-[36px] px-3 rounded-lg bg-neutral-900 text-yellow-500 border border-yellow-500/30 font-black text-xs uppercase tracking-widest'
                                : 'min-h-[36px] px-3 rounded-lg bg-transparent text-neutral-400 hover:text-white font-black text-xs uppercase tracking-widest'
                        }
                    >
                        Costas
                    </button>
                </div>
            </div>

            <div className="mt-4 flex flex-col items-center gap-4">
                {status === 'loading' && (
                    <div className="w-full max-w-[280px] aspect-square rounded-2xl bg-neutral-950 animate-pulse" />
                )}
                {status === 'error' && (
                    <div className="text-xs text-red-400 font-bold">Não foi possível carregar o mapa muscular.</div>
                )}
                {status === 'ready' && (
                    <BodyMapSvg view={view} muscles={musclesForView} gender={gender} selected={null} />
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest">
                    {LEGEND_BUCKETS.map(b => (
                        <div key={b.label} className="flex items-center gap-1.5">
                            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: b.color }} />
                            <span className="text-neutral-300">{b.label}</span>
                        </div>
                    ))}
                </div>

                {status === 'ready' && totalSetsThisView > 0 && (
                    <div className="text-[11px] text-neutral-400 text-center">
                        {Math.round(totalSetsThisView)} séries efetivas em{' '}
                        {MUSCLE_GROUPS.filter(m => m.view === view || m.view === 'both').length} grupos visíveis nesta vista
                    </div>
                )}
            </div>
        </div>
    )
}

