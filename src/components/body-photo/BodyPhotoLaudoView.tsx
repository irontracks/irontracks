'use client'

import React from 'react'
import {
    type BodyPhotoLaudo,
    DEVELOPMENT_LABELS_PT,
    PHASE_LABELS_PT,
    type MuscleGroupAssessment,
} from '@/types/bodyPhotoAssessment'

// ─── Score ring ──────────────────────────────────────────────────────────────

const scoreColor = (v: number): string => {
    if (v >= 80) return '#22c55e'
    if (v >= 60) return '#eab308'
    if (v >= 40) return '#f97316'
    return '#ef4444'
}

const ScoreRing = ({ label, value }: { label: string; value: number }) => {
    const r = 26
    const c = 2 * Math.PI * r
    const pct = Math.max(0, Math.min(100, value))
    const dash = (pct / 100) * c
    const color = scoreColor(pct)
    return (
        <div className="flex flex-col items-center gap-1.5">
            <div className="relative w-[68px] h-[68px]">
                <svg width="68" height="68" className="-rotate-90">
                    <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                    <circle
                        cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={`${dash} ${c}`}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-black text-white">{Math.round(pct)}</span>
                </div>
            </div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">{label}</span>
        </div>
    )
}

// ─── Muscle group chip ─────────────────────────────────────────────────────────

const DEV_STYLE: Record<MuscleGroupAssessment['development'], { bg: string; border: string; text: string }> = {
    weak: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', text: '#fca5a5' },
    moderate: { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.3)', text: '#fdba74' },
    good: { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.3)', text: '#fde047' },
    excellent: { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.3)', text: '#86efac' },
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-2">
        <h4 className="text-[11px] uppercase tracking-widest font-black text-yellow-500/80">{title}</h4>
        {children}
    </div>
)

const BulletList = ({ items, tone }: { items: string[]; tone: 'good' | 'bad' }) => {
    if (!items?.length) return null
    const dot = tone === 'good' ? 'text-emerald-400' : 'text-orange-400'
    return (
        <ul className="space-y-1.5">
            {items.map((it, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                    <span className={`mt-1 ${dot}`}>•</span>
                    <span className="leading-snug">{it}</span>
                </li>
            ))}
        </ul>
    )
}

export const BodyPhotoLaudoView: React.FC<{ laudo: BodyPhotoLaudo }> = ({ laudo }) => {
    const priorityRank = { high: 0, medium: 1, low: 2 } as const
    const recs = [...(laudo.recommendations || [])].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])

    return (
        <div className="space-y-5">
            {/* Headline: faixa de gordura + fase */}
            <div
                className="rounded-2xl border p-5"
                style={{
                    background: 'linear-gradient(160deg, rgba(20,18,10,0.9), rgba(12,12,12,0.95))',
                    borderColor: 'rgba(234,179,8,0.15)',
                }}
            >
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <span className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Gordura corporal (estimativa)</span>
                        <div className="text-3xl font-black text-white">
                            {laudo.bodyFatRange.low}–{laudo.bodyFatRange.high}<span className="text-lg text-neutral-400">%</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Fase aparente</span>
                        <div className="text-sm font-bold text-yellow-400">{PHASE_LABELS_PT[laudo.apparentPhase]}</div>
                        {laudo.somatotype ? <div className="text-xs text-neutral-500">{laudo.somatotype}</div> : null}
                    </div>
                </div>
                {laudo.confidence === 'low' ? (
                    <p className="mt-3 text-xs text-orange-300/90 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                        Confiança baixa — fotos com corpo inteiro, boa luz e fundo neutro melhoram a análise.
                    </p>
                ) : null}
            </div>

            {/* Scores */}
            <div className="grid grid-cols-4 gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                <ScoreRing label="Composição" value={laudo.scores.composition} />
                <ScoreRing label="Simetria" value={laudo.scores.symmetry} />
                <ScoreRing label="Postura" value={laudo.scores.posture} />
                <ScoreRing label="Proporção" value={laudo.scores.proportion} />
            </div>

            {/* Resumo */}
            {laudo.summary ? (
                <p className="text-sm text-neutral-200 leading-relaxed bg-neutral-900/40 border border-neutral-800 rounded-xl p-4">
                    {laudo.summary}
                </p>
            ) : null}

            {/* Grupos musculares */}
            {laudo.muscleGroups?.length ? (
                <Section title="Por grupo muscular">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {laudo.muscleGroups.map((g, i) => {
                            const s = DEV_STYLE[g.development]
                            return (
                                <div key={i} className="rounded-xl border p-3" style={{ background: s.bg, borderColor: s.border }}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-bold text-white">{g.group}</span>
                                        <span className="text-[10px] uppercase tracking-wide font-black" style={{ color: s.text }}>
                                            {DEVELOPMENT_LABELS_PT[g.development]}
                                        </span>
                                    </div>
                                    {g.note ? <p className="mt-1 text-xs text-neutral-400 leading-snug">{g.note}</p> : null}
                                </div>
                            )
                        })}
                    </div>
                </Section>
            ) : null}

            {/* Postura + Simetria */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {laudo.posture?.summary || laudo.posture?.findings?.length ? (
                    <Section title="Postura">
                        {laudo.posture.summary ? <p className="text-sm text-neutral-300 leading-snug">{laudo.posture.summary}</p> : null}
                        <BulletList items={laudo.posture.findings} tone="bad" />
                    </Section>
                ) : null}
                {laudo.symmetry?.summary || laudo.symmetry?.imbalances?.length ? (
                    <Section title="Simetria L/R">
                        {laudo.symmetry.summary ? <p className="text-sm text-neutral-300 leading-snug">{laudo.symmetry.summary}</p> : null}
                        <BulletList items={laudo.symmetry.imbalances} tone="bad" />
                    </Section>
                ) : null}
            </div>

            {/* Proporções */}
            {laudo.proportions?.summary ? (
                <Section title="Proporções">
                    <p className="text-sm text-neutral-300 leading-snug">{laudo.proportions.summary}</p>
                    {laudo.proportions.shoulderToWaist ? (
                        <p className="text-xs text-neutral-500">Ombro/cintura: {laudo.proportions.shoulderToWaist}</p>
                    ) : null}
                </Section>
            ) : null}

            {/* Pontos fortes / a melhorar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {laudo.strengths?.length ? (
                    <Section title="Pontos fortes"><BulletList items={laudo.strengths} tone="good" /></Section>
                ) : null}
                {laudo.improvements?.length ? (
                    <Section title="A melhorar"><BulletList items={laudo.improvements} tone="bad" /></Section>
                ) : null}
            </div>

            {/* Recomendações */}
            {recs.length ? (
                <Section title="Recomendações">
                    <div className="space-y-2">
                        {recs.map((r, i) => {
                            const pill =
                                r.priority === 'high' ? { t: 'Alta', c: '#fca5a5', b: 'rgba(239,68,68,0.3)', bg: 'rgba(239,68,68,0.08)' }
                                    : r.priority === 'medium' ? { t: 'Média', c: '#fde047', b: 'rgba(234,179,8,0.3)', bg: 'rgba(234,179,8,0.08)' }
                                        : { t: 'Baixa', c: '#93c5fd', b: 'rgba(59,130,246,0.3)', bg: 'rgba(59,130,246,0.08)' }
                            return (
                                <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-bold text-white">{r.focus}</span>
                                        <span
                                            className="text-[10px] uppercase tracking-wide font-black px-2 py-0.5 rounded-full border shrink-0"
                                            style={{ color: pill.c, borderColor: pill.b, background: pill.bg }}
                                        >
                                            {pill.t}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm text-neutral-300 leading-snug">{r.action}</p>
                                </div>
                            )
                        })}
                    </div>
                </Section>
            ) : null}

            <p className="text-[11px] text-neutral-600 leading-snug pt-1">
                Estimativa visual gerada por IA — não substitui avaliação presencial, bioimpedância ou dobras cutâneas.
            </p>
        </div>
    )
}
