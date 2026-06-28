'use client'
import React, { memo, useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, Flame, Clock, Dumbbell, Trophy, MapPin } from 'lucide-react'
import { formatDuration, formatKm, formatKmh } from '@/utils/report/formatters'

type AnyObj = Record<string, unknown>

interface ReportSummaryCardsProps {
    session: AnyObj | null
    currentVolume: number
    volumeDelta: number
    calories: number
    outdoorBike: AnyObj | null
    cardioGps?: AnyObj | null
    hasPreviousSession: boolean
}

// Animated count-up hook
function useCountUp(target: number, duration = 900) {
    const [value, setValue] = useState(0)
    const raf = useRef<number>(0)
    useEffect(() => {
        const start = performance.now()
        const tick = (now: number) => {
            const progress = Math.min(1, (now - start) / duration)
            setValue(Math.round(target * progress))
            if (progress < 1) raf.current = requestAnimationFrame(tick)
        }
        raf.current = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf.current)
    }, [target, duration])
    return value
}

// eslint-disable-next-line react/display-name
export const ReportSummaryCards = memo(({
    session,
    currentVolume,
    volumeDelta,
    calories,
    outdoorBike,
    cardioGps,
    hasPreviousSession,
}: ReportSummaryCardsProps) => {
    const animVol = useCountUp(Math.round(currentVolume))
    const animCal = useCountUp(Math.round(calories))

    return (
        <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                {/* Tempo Total */}
                <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 p-4 rounded-2xl border border-neutral-800 flex flex-col gap-2 shadow-sm shadow-black/30">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                            <Clock size={16} className="text-amber-400" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Tempo</p>
                    </div>
                    <p className="text-2xl font-black font-mono text-white">{formatDuration(session?.totalTime)}</p>
                </div>

                {/* Volume */}
                <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 p-4 rounded-2xl border border-neutral-800 flex flex-col gap-2 shadow-sm shadow-black/30">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                            <Dumbbell size={16} className="text-yellow-400" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Volume</p>
                    </div>
                    <div className="flex items-baseline gap-1 min-w-0">
                        <span className="text-xl sm:text-2xl font-black font-mono tabular-nums text-white truncate">{animVol.toLocaleString('pt-BR')}</span>
                        <span className="text-xs font-black text-neutral-400">kg</span>
                    </div>
                    {hasPreviousSession && Number.isFinite(volumeDelta) && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black w-fit ${volumeDelta >= 0
                                ? 'bg-green-500/15 text-green-300 border border-green-500/30'
                                : 'bg-red-500/15 text-red-300 border border-red-500/30'
                            }`}>
                            {volumeDelta >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {volumeDelta > 0 ? '+' : ''}{volumeDelta.toFixed(1)}%
                        </span>
                    )}
                </div>

                {/* Calorias */}
                <div className="bg-gradient-to-br from-orange-950/40 to-neutral-950 p-4 rounded-2xl border border-orange-500/20 flex flex-col gap-2 shadow-sm shadow-black/30">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
                            <Flame size={16} className="text-orange-400" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-orange-500/70">Calorias</p>
                    </div>
                    <p className="text-2xl font-black font-mono text-orange-200">~{animCal}</p>
                </div>

                {/* Status */}
                <div className="bg-gradient-to-br from-green-950/30 to-neutral-950 p-4 rounded-2xl border border-green-500/20 flex flex-col gap-2 shadow-sm shadow-black/30">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-green-500/15 border border-green-500/25 flex items-center justify-center">
                            <Trophy size={16} className="text-green-400" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-green-500/70">Status</p>
                    </div>
                    <p className="text-base font-black uppercase text-green-300">Concluído ✓</p>
                </div>
            </div>

            {outdoorBike && (Number(outdoorBike?.distanceMeters) > 0 || Number(outdoorBike?.durationSeconds) > 0) && (
                <div className="mb-8">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">Bike Outdoor</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800">
                            <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Distância</p>
                            <p className="text-2xl font-mono font-bold">{formatKm(outdoorBike.distanceMeters)}</p>
                        </div>
                        <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800">
                            <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Vel. Média</p>
                            <p className="text-2xl font-mono font-bold">{formatKmh(outdoorBike.avgSpeedKmh)}</p>
                        </div>
                        <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800">
                            <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Vel. Máx</p>
                            <p className="text-2xl font-mono font-bold">{formatKmh(outdoorBike.maxSpeedKmh)}</p>
                        </div>
                        <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800">
                            <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Tempo Bike</p>
                            <p className="text-2xl font-mono font-bold">{formatDuration(Number(outdoorBike.durationSeconds) || 0)}</p>
                        </div>
                    </div>
                </div>
            )}

            {cardioGps && (Number(cardioGps?.distanceMeters) > 0 || Number(cardioGps?.durationSeconds) > 0) && (
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-lg bg-green-500/15 border border-green-500/25 flex items-center justify-center">
                            <MapPin size={12} className="text-green-400" />
                        </div>
                        <div className="text-xs font-black uppercase tracking-widest text-green-400/80">Cardio GPS</div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-green-950/20 p-4 rounded-xl border border-green-500/15">
                            <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Distância</p>
                            <p className="text-2xl font-mono font-bold text-green-300">{formatKm(cardioGps.distanceMeters)}</p>
                        </div>
                        <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800">
                            <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Tempo</p>
                            <p className="text-2xl font-mono font-bold">{formatDuration(Number(cardioGps.durationSeconds) || 0)}</p>
                        </div>
                        <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800">
                            <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Pace Médio</p>
                            <p className="text-2xl font-mono font-bold">
                                {cardioGps.avgPaceMinKm != null && Number(cardioGps.avgPaceMinKm) > 0
                                    ? (() => {
                                        const totalSec = Math.round(Number(cardioGps.avgPaceMinKm) * 60)
                                        const m = Math.floor(totalSec / 60)
                                        const s = totalSec % 60
                                        return `${m}:${String(s).padStart(2, '0')}`
                                    })()
                                    : '—'}
                                {cardioGps.avgPaceMinKm != null && Number(cardioGps.avgPaceMinKm) > 0 && (
                                    <span className="text-xs font-normal text-neutral-400 ml-1">/km</span>
                                )}
                            </p>
                        </div>
                        <div className="bg-orange-950/20 p-4 rounded-xl border border-orange-500/15">
                            <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Calorias</p>
                            <p className="text-2xl font-mono font-bold text-orange-300">
                                {Number(cardioGps.caloriesEstimated) > 0
                                    ? `~${Math.round(Number(cardioGps.caloriesEstimated))}`
                                    : '—'}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
})  // end memo

