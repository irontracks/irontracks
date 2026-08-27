'use client'

/**
 * Histórico da Avaliação por Foto — lista os laudos já gerados e reabre cada um.
 *
 * Por que existe: até jul/2026 o laudo era gravado em `body_photo_assessments`
 * (scores + JSON completo) e as fotos no bucket privado, mas NÃO havia tela
 * nenhuma pra consultar depois — fechou o modal de captura, o laudo sumia da
 * vista. Todo o backend já estava pronto e sem consumidor: a rota GET
 * /api/body-photo/assessments (com signed URLs), `fetchBodyPhotoList`,
 * `fetchBodyPhotoDetail` e a action de apagar. Esta tela é a UI que faltava.
 *
 * A correlação com treino continua ON-DEMAND (não é persistida): cada clique
 * recomputa com os treinos mais recentes, então o número muda conforme a pessoa
 * treina — é isso que a torna útil, e é por isso que não vale cachear.
 */

import React, { useCallback, useState } from 'react'
import NextImage from 'next/image'
import { AlertTriangle, ChevronLeft, Dumbbell, ImageOff, Loader2, RefreshCw, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import { useBodyPhotoHistory } from '@/hooks/useBodyPhotoHistory'
import {
    BODY_PHOTO_POSES,
    POSE_LABELS_PT,
    type BodyPhotoAssessmentStatus,
    type BodyPhotoLaudo,
} from '@/types/bodyPhotoAssessment'
import { BodyFatCrossCheckCard } from './BodyFatCrossCheckCard'
import { BodyPhotoLaudoView } from './BodyPhotoLaudoView'
import { BodyPhotoCorrelationView } from './BodyPhotoCorrelationView'
import { useBackHandler } from '@/hooks/useBackHandler'
import { dialogProps } from '@/utils/a11y/backdrop'
import { useFocusTrap } from '@/hooks/useFocusTrap'

/**
 * Sem prop `open`: o pai MONTA este componente só quando abre. Assim o estado
 * (detalhe aberto, correlação carregada, confirmação de exclusão) nasce limpo a
 * cada abertura, sem precisar de um efeito de reset — que além de frágil,
 * violaria a regra `react-hooks/set-state-in-effect` do lint.
 */
interface Props {
    onClose: () => void
}

const STATUS_LABEL: Record<BodyPhotoAssessmentStatus, string> = {
    pending: 'Pendente',
    uploading: 'Enviando',
    analyzing: 'Analisando',
    done: 'Laudo pronto',
    failed: 'Falhou',
}

const STATUS_STYLE: Record<BodyPhotoAssessmentStatus, { bg: string; border: string; color: string }> = {
    pending: { bg: 'rgba(115,115,115,0.12)', border: 'rgba(115,115,115,0.3)', color: '#a3a3a3' },
    uploading: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', color: '#93c5fd' },
    analyzing: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', color: '#93c5fd' },
    done: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', color: '#4ade80' },
    failed: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', color: '#f87171' },
}

/** `assessment_date` vem como 'YYYY-MM-DD' — montar a Date com hora local evita o off-by-one de fuso. */
const formatDate = (raw: string): string => {
    const [y, m, d] = String(raw || '').split('-').map((n) => Number(n))
    if (!y || !m || !d) return String(raw || '')
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Timestamp ISO → "31 de jul., 20:55" (a correlação envelhece; a data importa). */
const formatDateTime = (iso: string): string => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const StatusBadge = ({ status }: { status: BodyPhotoAssessmentStatus }) => {
    const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending
    return (
        <span
            className="text-[9px] uppercase font-black px-2 py-0.5 rounded-full border whitespace-nowrap"
            style={{ background: s.bg, borderColor: s.border, color: s.color }}
        >
            {STATUS_LABEL[status] ?? status}
        </span>
    )
}

const ScorePill = ({ label, value }: { label: string; value: number | null }) => (
    <div className="flex flex-col items-center min-w-[38px]">
        <span className="text-sm font-black text-white leading-none">{value == null ? '—' : Math.round(value)}</span>
        <span className="text-[9px] uppercase tracking-wide text-neutral-400 mt-0.5">{label}</span>
    </div>
)

export const BodyPhotoHistoryModal: React.FC<Props> = ({ onClose }) => {
    /* `aria-modal` sem confinar o Tab seria promessa falsa — andam juntos. */
    const dlgRef = useFocusTrap(true, onClose)

    const {
        items, listLoading, listError, reloadList,
        detail, detailLoading, detailError, openDetail, backToList,
        correlation, correlationLoading, correlationError, correlate,
        deletingId, removeAssessment,
    } = useBodyPhotoHistory()

    /** id aguardando confirmação de exclusão — a confirmação é inline, no próprio card. */
    const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

    const handleDelete = useCallback(async (id: string) => {
        await removeAssessment(id)
        setConfirmingDelete(null)
    }, [removeAssessment])

    // Voltar (gesto/botão nativo) fecha o detalhe antes de fechar o modal inteiro.
    const handleBack = useCallback(() => {
        if (detail) backToList()
        else onClose()
    }, [detail, backToList, onClose])
    useBackHandler(true, handleBack)

    const laudo = (detail?.assessment.analysis ?? null) as BodyPhotoLaudo | null
    const photos = detail
        ? [...detail.photos].sort((a, b) => BODY_PHOTO_POSES.indexOf(a.pose) - BODY_PHOTO_POSES.indexOf(b.pose))
        : []

    return (
        <div className="fixed inset-0 z-[2200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
            <div ref={dlgRef} {...dialogProps('Histórico de fotos corporais')} className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-neutral-800 bg-neutral-950 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                        {detail ? (
                            <button
                                onClick={backToList}
                                aria-label="Voltar para a lista"
                                className="tap-44 w-9 h-9 rounded-xl border border-neutral-700 text-neutral-400 hover:text-white hover:border-yellow-500/40 transition flex items-center justify-center shrink-0"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                        ) : (
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.2)' }}>
                                <Sparkles className="w-5 h-5 text-yellow-500" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <h2 className="text-base font-black text-white leading-tight truncate">
                                {detail ? `Laudo de ${formatDate(detail.assessment.assessment_date)}` : 'Laudos por Foto'}
                            </h2>
                            <p className="text-[11px] text-neutral-400 truncate">
                                {detail ? 'Avaliação por foto salva' : 'Suas avaliações por foto já geradas'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Fechar"
                        className="tap-44 w-9 h-9 rounded-xl border border-neutral-700 text-neutral-400 hover:text-white hover:border-yellow-500/40 transition flex items-center justify-center shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5">
                    {/* ── Detalhe ─────────────────────────────────────────── */}
                    {detail ? (
                        <div className="space-y-5">
                            {photos.length > 0 ? (
                                <div className="grid grid-cols-3 gap-2">
                                    {photos.map((p) => (
                                        <div key={p.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
                                            <div className="relative aspect-[3/4] bg-neutral-900 flex items-center justify-center">
                                                {p.signedUrl ? (
                                                    <NextImage src={p.signedUrl} alt={POSE_LABELS_PT[p.pose]} fill className="object-cover" unoptimized />
                                                ) : (
                                                    <ImageOff className="w-6 h-6 text-neutral-700" />
                                                )}
                                            </div>
                                            <p className="text-[11px] text-center text-neutral-400 py-1.5 font-bold">{POSE_LABELS_PT[p.pose]}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {/* Cruzamento foto × medição — só aparece quando existe avaliação
                                física com % de gordura. A IA estimou sem ver este número. */}
                            {laudo && detail.bodyFatReference ? (
                                <BodyFatCrossCheckCard
                                    photoLow={laudo.bodyFatRange.low}
                                    photoHigh={laudo.bodyFatRange.high}
                                    reference={detail.bodyFatReference}
                                />
                            ) : null}

                            {laudo ? (
                                <BodyPhotoLaudoView laudo={laudo} />
                            ) : (
                                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 text-center">
                                    <AlertTriangle className="w-6 h-6 text-neutral-600 mx-auto mb-2" />
                                    <p className="text-sm text-neutral-400">
                                        Esta avaliação não chegou a gerar laudo (status <span className="text-neutral-200">{STATUS_LABEL[detail.assessment.status] ?? detail.assessment.status}</span>).
                                        As fotos continuam salvas — gere uma avaliação nova para ter o laudo.
                                    </p>
                                </div>
                            )}

                            {/* Correlação com treino — a última fica SALVA na avaliação; o
                                botão recalcula com os treinos mais recentes. */}
                            {laudo ? (
                                <div className="pt-2 border-t border-neutral-800">
                                    {correlation ? (
                                        <div className="space-y-3">
                                            <BodyPhotoCorrelationView correlation={correlation.data} window={correlation.window} assessmentId={detail.assessment.id} />
                                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                                <p className="text-[11px] text-neutral-400">
                                                    {correlation.generatedAt
                                                        ? `Cruzamento gerado em ${formatDateTime(correlation.generatedAt)}`
                                                        : 'Cruzamento salvo nesta avaliação'}
                                                </p>
                                                <button
                                                    onClick={correlate}
                                                    disabled={correlationLoading}
                                                    className="inline-flex items-center gap-1.5 tap-44 min-h-[36px] px-3 rounded-lg border text-[13px] font-bold transition active:scale-95 disabled:opacity-50"
                                                    style={{ background: 'rgba(168,85,247,0.06)', borderColor: 'rgba(168,85,247,0.25)', color: '#c4b5fd' }}
                                                >
                                                    {correlationLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                                    {correlationLoading ? 'Atualizando…' : 'Atualizar'}
                                                </button>
                                            </div>
                                            {correlationError && !correlationLoading ? (
                                                <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2">
                                                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                                    <p className="text-[13px] leading-snug text-red-300">
                                                        {correlationError} <span className="text-red-400/70">O cruzamento acima é o anterior.</span>
                                                    </p>
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div className="text-center py-2">
                                            <p className="text-sm text-neutral-400 mb-3">
                                                Cruze este laudo com o que você de fato treinou no período — só o IronTracks faz isso.
                                            </p>
                                            <button
                                                onClick={correlate}
                                                disabled={correlationLoading}
                                                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl border font-bold transition active:scale-95 disabled:opacity-50"
                                                style={{ background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.3)', color: '#d8b4fe' }}
                                            >
                                                {correlationLoading
                                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                                    : correlationError ? <RotateCcw className="w-4 h-4" /> : <Dumbbell className="w-4 h-4" />}
                                                {correlationLoading
                                                    ? 'Cruzando com seus treinos…'
                                                    : correlationError ? 'Tentar novamente' : 'Correlação com treino'}
                                            </button>
                                            {correlationError && !correlationLoading ? (
                                                <div className="mt-3 mx-auto max-w-sm flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-left">
                                                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                                    <p className="text-[13px] leading-snug text-red-300">{correlationError}</p>
                                                </div>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    ) : detailLoading ? (
                        <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-yellow-500 animate-spin" /></div>
                    ) : (
                        /* ── Lista ───────────────────────────────────────── */
                        <div className="space-y-3">
                            {detailError ? (
                                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{detailError}</p>
                            ) : null}
                            {listError ? (
                                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                                    <p className="text-sm text-red-400 flex-1">{listError}</p>
                                    <button onClick={reloadList} className="text-sm font-bold text-red-300 underline underline-offset-2 shrink-0">
                                        Recarregar
                                    </button>
                                </div>
                            ) : null}

                            {listLoading ? (
                                <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-yellow-500 animate-spin" /></div>
                            ) : items.length === 0 && !listError ? (
                                <div className="py-10 text-center">
                                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.15)' }}>
                                        <Sparkles className="w-7 h-7 text-yellow-500/60" />
                                    </div>
                                    <p className="text-white font-bold">Nenhum laudo por foto ainda</p>
                                    <p className="text-sm text-neutral-400 mt-1">Use o botão “Por Foto” para gerar o primeiro.</p>
                                </div>
                            ) : (
                                items.map((a) => {
                                    const confirming = confirmingDelete === a.id
                                    const deleting = deletingId === a.id
                                    return (
                                        <div key={a.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
                                            <div className="flex items-stretch">
                                                <button
                                                    onClick={() => openDetail(a.id)}
                                                    className="flex items-center gap-3 flex-1 min-w-0 p-3 text-left hover:bg-neutral-900/60 transition"
                                                >
                                                    <div className="relative w-14 h-[72px] rounded-xl overflow-hidden bg-neutral-900 shrink-0 flex items-center justify-center">
                                                        {a.thumbnailUrl ? (
                                                            <NextImage src={a.thumbnailUrl} alt="" fill className="object-cover" unoptimized />
                                                        ) : (
                                                            <ImageOff className="w-5 h-5 text-neutral-700" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-sm font-black text-white">{formatDate(a.assessment_date)}</span>
                                                            <StatusBadge status={a.status} />
                                                            {a.correlation ? (
                                                                <span
                                                                    className="inline-flex items-center gap-1 text-[9px] uppercase font-black px-2 py-0.5 rounded-full border whitespace-nowrap"
                                                                    style={{ background: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.3)', color: '#d8b4fe' }}
                                                                    title="Este laudo já tem o cruzamento com treino salvo"
                                                                >
                                                                    <Dumbbell className="w-2.5 h-2.5" />
                                                                    Cruzado
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                        {a.status === 'done' ? (
                                                            <div className="flex items-center gap-3 mt-2">
                                                                <ScorePill label="Comp" value={a.composition_score} />
                                                                <ScorePill label="Sim" value={a.symmetry_score} />
                                                                <ScorePill label="Post" value={a.posture_score} />
                                                                <ScorePill label="Prop" value={a.proportion_score} />
                                                                {a.body_fat_estimate_low != null && a.body_fat_estimate_high != null ? (
                                                                    <div className="flex flex-col items-center">
                                                                        <span className="text-sm font-black text-yellow-500 leading-none">
                                                                            {Math.round(a.body_fat_estimate_low)}–{Math.round(a.body_fat_estimate_high)}%
                                                                        </span>
                                                                        <span className="text-[9px] uppercase tracking-wide text-neutral-400 mt-0.5">Gordura</span>
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ) : (
                                                            <p className="text-[11px] text-neutral-400 mt-1.5">Sem laudo — toque para ver as fotos</p>
                                                        )}
                                                    </div>
                                                </button>
                                                <button
                                                    onClick={() => setConfirmingDelete(confirming ? null : a.id)}
                                                    disabled={deleting}
                                                    aria-label={`Apagar avaliação de ${formatDate(a.assessment_date)}`}
                                                    className="px-3 border-l border-neutral-800 text-neutral-400 hover:text-red-400 transition disabled:opacity-40 flex items-center"
                                                >
                                                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                            </div>
                                            {confirming ? (
                                                <div className="flex items-center gap-2 px-3 py-2.5 border-t border-neutral-800 bg-red-500/[0.06]">
                                                    <p className="text-[13px] text-neutral-300 flex-1">Apagar esta avaliação e suas fotos?</p>
                                                    <button
                                                        onClick={() => setConfirmingDelete(null)}
                                                        className="tap-44 min-h-[36px] px-3 rounded-lg border border-neutral-700 text-neutral-300 text-sm font-bold hover:border-neutral-500 transition"
                                                    >
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(a.id)}
                                                        disabled={deleting}
                                                        className="tap-44 min-h-[36px] px-3 rounded-lg text-sm font-black text-white transition disabled:opacity-50"
                                                        style={{ background: 'rgba(239,68,68,0.9)' }}
                                                    >
                                                        Apagar
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
