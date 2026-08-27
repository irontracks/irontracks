'use client'

import React from 'react'
import type { LabExamExtracted, LabMarker, LabMarkerStatus } from '@/schemas/labExam'

/**
 * Resultados do exame — os marcadores extraídos do documento.
 *
 * Por que existe (ago/2026): o card do exame só abria quando havia PROTOCOLO
 * gerado pela IA. Um exame com `status: 'done'` e 34 marcadores extraídos, mas
 * sem protocolo, mostrava a seta de "abrir" e não abria nada ao toque — falha
 * silenciosa relatada pelo dono ("o card não está clicável e nem abrindo os
 * resultados").
 *
 * Os resultados são o dado primário: existem desde a extração e valem por si,
 * mesmo sem o plano de treino/dieta em cima deles.
 */

const TOM: Record<LabMarkerStatus, { cor: string; fundo: string; borda: string; rotulo: string }> = {
    normal: { cor: '#a3a3a3', fundo: 'rgba(255,255,255,0.03)', borda: 'rgba(255,255,255,0.06)', rotulo: 'normal' },
    low: { cor: '#fbbf24', fundo: 'rgba(251,191,36,0.08)', borda: 'rgba(251,191,36,0.25)', rotulo: 'baixo' },
    high: { cor: '#fbbf24', fundo: 'rgba(251,191,36,0.08)', borda: 'rgba(251,191,36,0.25)', rotulo: 'alto' },
    critical_low: { cor: '#f87171', fundo: 'rgba(248,113,113,0.1)', borda: 'rgba(248,113,113,0.3)', rotulo: 'muito baixo' },
    critical_high: { cor: '#f87171', fundo: 'rgba(248,113,113,0.1)', borda: 'rgba(248,113,113,0.3)', rotulo: 'muito alto' },
}

const formatarValor = (m: LabMarker): string => {
    if (m.value == null) return '—'
    // Sem casas fixas: 0.8 e 1200 aparecem como o laboratório imprimiu.
    const n = Number.isInteger(m.value) ? String(m.value) : String(Number(m.value.toFixed(2)))
    return m.unit ? `${n} ${m.unit}` : n
}

const formatarReferencia = (m: LabMarker): string | null => {
    if (m.refMin == null && m.refMax == null) return null
    if (m.refMin != null && m.refMax != null) return `${m.refMin} – ${m.refMax}`
    if (m.refMin != null) return `≥ ${m.refMin}`
    return `≤ ${m.refMax}`
}

export function LabExamMarkersView({ extracted }: { extracted: LabExamExtracted }) {
    const markers = Array.isArray(extracted?.markers) ? extracted.markers : []

    // Alterados primeiro: é o que a pessoa abriu o exame para ver. Dentro de
    // cada grupo, mantém a ordem do laboratório (não reordena por nome).
    const alterados = markers.filter((m) => m.status !== 'normal')
    const normais = markers.filter((m) => m.status === 'normal')

    const Linha = ({ m }: { m: LabMarker }) => {
        const tom = TOM[m.status] ?? TOM.normal
        const ref = formatarReferencia(m)
        return (
            <div
                className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
                style={{ background: tom.fundo, borderColor: tom.borda }}
            >
                <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-white">{m.name}</div>
                    {ref ? <div className="text-[11px] text-neutral-400">ref. {ref}</div> : null}
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-[14px] font-black tabular-nums" style={{ color: tom.cor }}>
                        {formatarValor(m)}
                    </div>
                    {m.status !== 'normal' ? (
                        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: tom.cor }}>
                            {tom.rotulo}
                        </div>
                    ) : null}
                </div>
            </div>
        )
    }

    if (!markers.length) {
        return (
            <p className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-6 text-center text-sm text-neutral-400">
                Nenhum marcador foi extraído deste exame.
            </p>
        )
    }

    return (
        <div className="space-y-4">
            {Array.isArray(extracted.examTypes) && extracted.examTypes.length ? (
                <div className="flex flex-wrap gap-1.5">
                    {extracted.examTypes.map((t) => (
                        <span key={t} className="rounded-full border border-neutral-800 bg-neutral-900/60 px-2.5 py-1 text-[11px] font-bold text-neutral-400">
                            {t}
                        </span>
                    ))}
                </div>
            ) : null}

            {alterados.length ? (
                <div>
                    <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-yellow-500">
                        Fora da referência ({alterados.length})
                    </div>
                    <div className="space-y-1.5">
                        {alterados.map((m, i) => <Linha key={`${m.name}-${i}`} m={m} />)}
                    </div>
                </div>
            ) : null}

            {normais.length ? (
                <div>
                    <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
                        Dentro da referência ({normais.length})
                    </div>
                    <div className="space-y-1.5">
                        {normais.map((m, i) => <Linha key={`${m.name}-${i}`} m={m} />)}
                    </div>
                </div>
            ) : null}
        </div>
    )
}
