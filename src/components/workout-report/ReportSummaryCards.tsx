'use client'
import React from 'react'
import { TrendingUp, TrendingDown, Flame } from 'lucide-react'
import { formatDuration, formatKm, formatKmh } from '@/utils/report/formatters'

type AnyObj = Record<string, unknown>

interface ReportSummaryCardsProps {
    session: AnyObj | null
    currentVolume: number
    volumeDelta: number
    calories: number
    outdoorBike: AnyObj | null
    hasPreviousSession: boolean
}

export const ReportSummaryCards = ({
    session,
    currentVolume,
    volumeDelta,
    calories,
    outdoorBike,
    hasPreviousSession,
}: ReportSummaryCardsProps) => {
    return (
        <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800 flex flex-col justify-between">
                    <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Tempo Total</p>
                    <p className="text-3xl font-mono font-bold">{formatDuration(session?.totalTime)}</p>
                </div>
                <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800 flex flex-col justify-between">
                    <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Volume (Kg)</p>
                    <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 min-w-0">
                            <span className="text-2xl sm:text-3xl font-mono font-bold leading-none min-w-0">
                                {currentVolume.toLocaleString('pt-BR')}
                            </span>
                            <span className="text-sm font-black text-neutral-400">kg</span>
                        </div>
                        {hasPreviousSession && Number.isFinite(volumeDelta) && (
                            <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold w-fit ${volumeDelta >= 0
                                    ? 'bg-green-500/15 text-green-200 border border-green-500/30'
                                    : 'bg-red-500/15 text-red-200 border border-red-500/30'
                                    }`}
                            >
                                {volumeDelta >= 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                                {volumeDelta > 0 ? '+' : ''}{volumeDelta.toFixed(1)}%
                            </span>
                        )}
                    </div>
                </div>
                <div className="bg-orange-500/10 p-4 rounded-lg border border-orange-500/30 flex flex-col justify-between">
                    <p className="text-xs font-bold uppercase text-orange-300 mb-1 flex items-center gap-1">
                        <Flame size={12} /> Calorias
                    </p>
                    <p className="text-3xl font-mono font-bold text-orange-200">~{calories}</p>
                </div>
                <div className="bg-black text-white p-4 rounded-lg flex flex-col justify-between">
                    <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Status</p>
                    <p className="text-xl font-bold uppercase italic">CONCLUÍDO</p>
                </div>
            </div>

            {outdoorBike && (Number(outdoorBike?.distanceMeters) > 0 || Number(outdoorBike?.durationSeconds) > 0) && (
                <div className="mb-8">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">Bike Outdoor</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800">
                            <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Distância</p>
                            <p className="text-2xl font-mono font-bold">{formatKm(outdoorBike.distanceMeters)}</p>
                        </div>
                        <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800">
                            <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Vel. Média</p>
                            <p className="text-2xl font-mono font-bold">{formatKmh(outdoorBike.avgSpeedKmh)}</p>
                        </div>
                        <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800">
                            <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Vel. Máx</p>
                            <p className="text-2xl font-mono font-bold">{formatKmh(outdoorBike.maxSpeedKmh)}</p>
                        </div>
                        <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800">
                            <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Tempo Bike</p>
                            <p className="text-2xl font-mono font-bold">{formatDuration(Number(outdoorBike.durationSeconds) || 0)}</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
