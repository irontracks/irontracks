'use client'

/**
 * Cruzamento visual: faixa de gordura ESTIMADA na foto × valor MEDIDO na
 * avaliação física (dobras/BIA).
 *
 * Os dois números sempre existiram no app, em telas diferentes, e ninguém os
 * confrontava. No caso que originou o card, a foto dizia 14–17% e as dobras
 * 7,07% — sete pontos de diferença que ninguém via.
 *
 * A leitura aqui é sobre QUALIDADE DE DADO, não sobre quem está certo: os dois
 * métodos erram de formas diferentes, e a distância entre eles é o sinal. Por
 * isso o texto nunca declara um vencedor — sugere o que conferir.
 */

import React from 'react'
import { Ruler, Sparkles, TriangleAlert } from 'lucide-react'
import {
    compareBodyFat,
    type BodyFatReference,
    type CrossCheckSeverity,
} from '@/utils/bodyPhoto/bodyFatCrossCheck'

const SOURCE_LABEL: Record<BodyFatReference['source'], string> = {
    skinfold: 'dobras cutâneas',
    bia: 'bioimpedância',
    assessment: 'avaliação física',
}

const TONE: Record<CrossCheckSeverity, { border: string; bg: string; text: string }> = {
    ok: { border: 'rgba(34,197,94,0.25)', bg: 'rgba(34,197,94,0.06)', text: '#4ade80' },
    attention: { border: 'rgba(234,179,8,0.25)', bg: 'rgba(234,179,8,0.06)', text: '#facc15' },
    high: { border: 'rgba(239,68,68,0.25)', bg: 'rgba(239,68,68,0.06)', text: '#f87171' },
}

const formatDate = (raw: string): string => {
    const [y, m, d] = String(raw || '').split('-').map(Number)
    if (!y || !m || !d) return String(raw || '')
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const pct = (n: number) => `${Number(n).toFixed(1).replace('.', ',')}%`

export const BodyFatCrossCheckCard: React.FC<{
    photoLow: number
    photoHigh: number
    reference: BodyFatReference
}> = ({ photoLow, photoHigh, reference }) => {
    const check = compareBodyFat(photoLow, photoHigh, reference)
    const tone = TONE[check.severity]
    const sourceLabel = SOURCE_LABEL[reference.source]

    const veredito = check.verdict === 'match'
        ? 'Os dois métodos concordam.'
        : check.verdict === 'photo_higher'
            ? `A foto estima ${pct(check.deltaPoints)} a mais que a medição.`
            : `A foto estima ${pct(check.deltaPoints)} a menos que a medição.`

    const leitura = check.verdict === 'match'
        ? 'A leitura visual bate com o que foi medido — bom sinal para as duas fontes.'
        : check.severity === 'high'
            ? `Diferença grande. Vale conferir as dobras (uma medida fora puxa o resultado inteiro) e repetir as fotos com boa luz. Enquanto divergirem tanto, trate os dois como estimativa.`
            : check.severity === 'attention'
                ? 'Diferença dentro do que os métodos costumam divergir, mas já merece atenção na próxima medição.'
                : 'Diferença pequena — normal entre métodos diferentes.'

    return (
        <div className="rounded-2xl border p-4" style={{ borderColor: tone.border, background: tone.bg }}>
            <div className="flex items-center gap-2 mb-3">
                <TriangleAlert className="w-4 h-4" style={{ color: tone.text }} />
                <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: tone.text }}>
                    Foto × medição
                </h3>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Sparkles className="w-3 h-3 text-yellow-500" />
                        <span className="text-[10px] uppercase tracking-wide font-bold text-neutral-400">Estimado na foto</span>
                    </div>
                    <div className="text-lg font-black text-white leading-none">
                        {pct(photoLow)}–{pct(photoHigh)}
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-1">estimativa visual por IA</div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Ruler className="w-3 h-3 text-blue-400" />
                        <span className="text-[10px] uppercase tracking-wide font-bold text-neutral-400">Medido</span>
                    </div>
                    <div className="text-lg font-black text-white leading-none">{pct(reference.percent)}</div>
                    <div className="text-[10px] text-neutral-400 mt-1">
                        {sourceLabel} · {formatDate(reference.assessmentDate)}
                    </div>
                </div>
            </div>

            <p className="text-[13px] leading-snug mt-3">
                <span className="font-bold" style={{ color: tone.text }}>{veredito}</span>{' '}
                <span className="text-neutral-400">{leitura}</span>
            </p>

            {check.stale ? (
                <p className="text-[11px] text-neutral-400 mt-2">
                    A medição é de {formatDate(reference.assessmentDate)} — {reference.daysApart} dias antes destas fotos.
                    Parte da diferença pode ser só o tempo entre as duas.
                </p>
            ) : null}
        </div>
    )
}
