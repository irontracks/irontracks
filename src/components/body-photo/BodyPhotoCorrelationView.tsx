'use client'

import React, { useState } from 'react'
import { Dumbbell, TrendingUp, Wrench } from 'lucide-react'
import {
    type BodyPhotoCorrelation,
    type TrainingWindowSummary,
    CORRELATION_TREND_LABELS_PT,
} from '@/types/bodyPhotoAssessment'
import { MuscleGapCard } from './MuscleGapCard'

// Mesma regra do HistoryList (useHistoryData): 't' só a partir de 1000kg, senão kg arredondado (pt-BR).
const formatVolume = (kg: number): string =>
    kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg).toLocaleString('pt-BR')}kg`

const TREND_STYLE: Record<BodyPhotoCorrelation['links'][number]['trend'], { c: string; b: string; bg: string }> = {
    supported: { c: '#86efac', b: 'rgba(34,197,94,0.3)', bg: 'rgba(34,197,94,0.08)' },
    undertrained: { c: '#fdba74', b: 'rgba(249,115,22,0.3)', bg: 'rgba(249,115,22,0.08)' },
    overtrained: { c: '#fca5a5', b: 'rgba(239,68,68,0.3)', bg: 'rgba(239,68,68,0.08)' },
    neutral: { c: '#cbd5e1', b: 'rgba(148,163,184,0.3)', bg: 'rgba(148,163,184,0.08)' },
}

const Stat = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-center">
        <div className="text-lg font-black text-white leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mt-1">{label}</div>
    </div>
)

export const BodyPhotoCorrelationView: React.FC<{
    correlation: BodyPhotoCorrelation
    window: TrainingWindowSummary
    /** Sem id não há como analisar o grupo — o botão "Ajustar treino" some. */
    assessmentId?: string | null
}> = ({ correlation, window, assessmentId = null }) => {
    const hasTraining = window.sessions > 0
    const [openGap, setOpenGap] = useState<string | null>(null)
    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-yellow-500" />
                <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/90">Correlação com o treino</h3>
            </div>

            {/* Stats da janela */}
            <div className="grid grid-cols-3 gap-2">
                <Stat label="Sessões" value={String(window.sessions)} />
                <Stat label="Volume" value={formatVolume(window.totalVolumeKg)} />
                <Stat label="Séries" value={String(window.totalSets)} />
            </div>

            {!hasTraining ? (
                <p className="text-sm text-orange-300/90 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                    Nenhum treino registrado nesta janela — registre treinos no app pra desbloquear a correlação completa.
                </p>
            ) : null}

            {/* Headline + narrativa */}
            {correlation.headline ? (
                <div className="rounded-2xl border p-4" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.9), rgba(12,12,12,0.95))', borderColor: 'rgba(234,179,8,0.15)' }}>
                    <div className="flex items-start gap-2">
                        <TrendingUp className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                        <p className="text-sm font-bold text-white leading-snug">{correlation.headline}</p>
                    </div>
                    {correlation.narrative ? <p className="mt-2 text-sm text-neutral-300 leading-relaxed">{correlation.narrative}</p> : null}
                </div>
            ) : null}

            {/* Mais treinados = mais SÉRIES. Ordenar por carga aqui enganava tanto
                quanto enganou a IA: exercício de carga leve (flexora, elevação
                lateral, abdominal) sumia da lista mesmo com muita série. */}
            {(window.topExercisesBySets?.length || window.topExercises?.length) ? (
                <div className="space-y-1.5">
                    <h4 className="text-[11px] uppercase tracking-widest font-black text-neutral-400">Mais treinados no período</h4>
                    {(window.topExercisesBySets?.length ? window.topExercisesBySets : window.topExercises).slice(0, 5).map((ex, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-neutral-300 truncate">{ex.name}</span>
                            <span className="text-neutral-400 shrink-0 ml-2">{ex.sets} séries · {formatVolume(ex.volumeKg)}</span>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* Ligações grupo × treino */}
            {correlation.links?.length ? (
                <div className="space-y-2">
                    <h4 className="text-[11px] uppercase tracking-widest font-black text-yellow-500/80">Grupo muscular × treino</h4>
                    {correlation.links.map((l, i) => {
                        const s = TREND_STYLE[l.trend]
                        // O botão aparece onde há o que ajustar. `neutral` entra porque é
                        // onde cai o caso "muita série e físico não acompanha" — que pede
                        // execução, não volume; o card sabe distinguir.
                        const adjustable = assessmentId && (l.trend === 'undertrained' || l.trend === 'neutral')
                        const open = openGap === l.muscleGroup
                        return (
                            <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-bold text-white">{l.muscleGroup}</span>
                                    <span className="text-[10px] uppercase tracking-wide font-black px-2 py-0.5 rounded-full border shrink-0" style={{ color: s.c, borderColor: s.b, background: s.bg }}>
                                        {CORRELATION_TREND_LABELS_PT[l.trend]}
                                    </span>
                                </div>
                                {l.observation ? <p className="mt-1 text-sm text-neutral-400 leading-snug">{l.observation}</p> : null}
                                {adjustable ? (
                                    <button
                                        onClick={() => setOpenGap(open ? null : l.muscleGroup)}
                                        className="mt-2 inline-flex items-center gap-1.5 tap-44 min-h-[32px] px-2.5 rounded-lg border text-[12px] font-bold transition active:scale-95"
                                        style={{ background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.3)', color: '#d8b4fe' }}
                                    >
                                        <Wrench className="w-3.5 h-3.5" />
                                        {open ? 'Fechar' : 'Ajustar treino'}
                                    </button>
                                ) : null}
                                {adjustable && open && assessmentId ? (
                                    <div className="mt-3">
                                        <MuscleGapCard
                                            assessmentId={assessmentId}
                                            muscleLabel={l.muscleGroup}
                                            onClose={() => setOpenGap(null)}
                                        />
                                    </div>
                                ) : null}
                            </div>
                        )
                    })}
                </div>
            ) : null}

            {/* Funcionando / faltando */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {correlation.whatIsWorking?.length ? (
                    <div className="space-y-1.5">
                        <h4 className="text-[11px] uppercase tracking-widest font-black text-emerald-400/80">Funcionando</h4>
                        <ul className="space-y-1.5">
                            {correlation.whatIsWorking.map((it, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-neutral-300"><span className="mt-1 text-emerald-400">•</span><span className="leading-snug">{it}</span></li>
                            ))}
                        </ul>
                    </div>
                ) : null}
                {correlation.whatIsMissing?.length ? (
                    <div className="space-y-1.5">
                        <h4 className="text-[11px] uppercase tracking-widest font-black text-orange-400/80">Faltando</h4>
                        <ul className="space-y-1.5">
                            {correlation.whatIsMissing.map((it, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-neutral-300"><span className="mt-1 text-orange-400">•</span><span className="leading-snug">{it}</span></li>
                            ))}
                        </ul>
                    </div>
                ) : null}
            </div>

            {/* Próximo foco */}
            {correlation.nextFocus?.length ? (
                <div className="space-y-2">
                    <h4 className="text-[11px] uppercase tracking-widest font-black text-yellow-500/80">Próximo foco</h4>
                    {correlation.nextFocus.map((f, i) => (
                        <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                            <span className="text-sm font-bold text-white">{f.focus}</span>
                            <p className="mt-1 text-sm text-neutral-300 leading-snug">{f.action}</p>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    )
}
