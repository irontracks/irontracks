'use client'

import React, { useCallback, useRef, useState } from 'react'
import NextImage from 'next/image'
import { Camera, X, Check, Loader2, Sparkles, RotateCcw, Dumbbell } from 'lucide-react'
import { createBodyPhotoAssessment } from '@/actions/bodyPhotoAssessment-actions'
import { analyzeBodyPhoto, fetchBodyPhotoCorrelation } from '@/lib/api/bodyPhoto'
import { compressBodyPhoto, uploadBodyPhoto, type CompressedPhoto } from '@/utils/storage/bodyPhotoUpload'
import { BODY_PHOTO_POSES, POSE_LABELS_PT, type BodyPhotoPose, type BodyPhotoLaudo, type BodyPhotoCorrelation, type TrainingWindowSummary } from '@/types/bodyPhotoAssessment'
import { BodyPhotoLaudoView } from './BodyPhotoLaudoView'
import { BodyPhotoCorrelationView } from './BodyPhotoCorrelationView'

type Stage = 'capture' | 'processing' | 'result' | 'error'

const POSE_HINT: Record<BodyPhotoPose, string> = {
    front: 'Em pé, de frente, braços levemente afastados do corpo.',
    side: 'De perfil, postura natural, olhando para frente.',
    back: 'De costas, postura reta, braços relaxados.',
}

// Guia de pose: manequim 3D clay (mesmo estilo do mapa muscular), por pose e gênero.
// Overlay translúcido com mixBlendMode 'lighten' pra o fundo preto sumir no card escuro.
const PoseGuide = ({ pose, gender }: { pose: BodyPhotoPose; gender: 'M' | 'F' }) => (
    <NextImage
        src={`/poses/${pose}-${gender === 'F' ? 'f' : 'm'}.webp`}
        alt=""
        fill
        sizes="(max-width: 640px) 100vw, 200px"
        unoptimized
        className="object-contain p-3 opacity-75 pointer-events-none select-none"
        style={{ mixBlendMode: 'lighten' }}
    />
)

interface Props {
    open: boolean
    onClose: () => void
    /** user_id do aluno (fluxo personal). Omitido = autoavaliação. */
    studentUserId?: string | null
    /** Gênero pra escolher o manequim do guia de pose. Default 'M'. */
    gender?: 'M' | 'F'
    /** Chamado após gerar o laudo com sucesso (ex.: recarregar histórico). */
    onSaved?: () => void
}

export const BodyPhotoCaptureModal: React.FC<Props> = ({ open, onClose, studentUserId, gender = 'M', onSaved }) => {
    const [stage, setStage] = useState<Stage>('capture')
    const [photos, setPhotos] = useState<Partial<Record<BodyPhotoPose, CompressedPhoto>>>({})
    const [busyPose, setBusyPose] = useState<BodyPhotoPose | null>(null)
    const [progress, setProgress] = useState('')
    const [laudo, setLaudo] = useState<BodyPhotoLaudo | null>(null)
    const [errorMsg, setErrorMsg] = useState('')
    const [assessmentId, setAssessmentId] = useState<string | null>(null)
    const [correlation, setCorrelation] = useState<{ data: BodyPhotoCorrelation; window: TrainingWindowSummary } | null>(null)
    const [correlationLoading, setCorrelationLoading] = useState(false)
    const [correlationError, setCorrelationError] = useState('')
    const inputRefs = useRef<Record<BodyPhotoPose, HTMLInputElement | null>>({ front: null, side: null, back: null })

    const reset = useCallback(() => {
        setStage('capture'); setPhotos({}); setProgress(''); setLaudo(null); setErrorMsg(''); setBusyPose(null)
        setAssessmentId(null); setCorrelation(null); setCorrelationLoading(false); setCorrelationError('')
    }, [])

    const handleCorrelate = useCallback(async () => {
        if (!assessmentId) return
        setCorrelationLoading(true); setCorrelationError('')
        try {
            const res = await fetchBodyPhotoCorrelation(assessmentId)
            if (!res.ok || !res.correlation || !res.window) throw new Error(res.message || res.error || 'Falha na correlação.')
            setCorrelation({ data: res.correlation, window: res.window })
        } catch (e) {
            setCorrelationError(e instanceof Error ? e.message : 'Erro inesperado.')
        } finally {
            setCorrelationLoading(false)
        }
    }, [assessmentId])

    const handleClose = useCallback(() => {
        if (stage === 'processing') return // não fecha no meio da análise
        reset(); onClose()
    }, [stage, reset, onClose])

    const handleFile = useCallback(async (pose: BodyPhotoPose, files: FileList | null) => {
        if (!files?.length) return
        setBusyPose(pose)
        try {
            const compressed = await compressBodyPhoto(files[0])
            setPhotos((prev) => ({ ...prev, [pose]: compressed }))
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Falha ao processar a foto.')
        } finally {
            setBusyPose(null)
        }
    }, [])

    const capturedCount = (Object.keys(photos) as BodyPhotoPose[]).filter((p) => photos[p]).length
    const canAnalyze = !!photos.front && capturedCount >= 1

    const handleAnalyze = useCallback(async () => {
        if (!canAnalyze) return
        setStage('processing'); setErrorMsg('')
        try {
            setProgress('Criando avaliação…')
            const created = await createBodyPhotoAssessment({ studentUserId: studentUserId ?? null })
            if (!created.ok) throw new Error(created.error || 'Falha ao criar avaliação.')
            const id = created.data.id
            setAssessmentId(id)

            for (const pose of BODY_PHOTO_POSES) {
                const photo = photos[pose]
                if (!photo) continue
                setProgress(`Enviando foto: ${POSE_LABELS_PT[pose]}…`)
                const up = await uploadBodyPhoto(id, pose, photo)
                if (!up.ok) throw new Error(up.error || `Falha ao enviar foto ${POSE_LABELS_PT[pose]}.`)
            }

            setProgress('Analisando com IA… isso pode levar alguns segundos.')
            const res = await analyzeBodyPhoto(id)
            if (!res.ok || !res.analysis) throw new Error(res.message || res.error || 'Falha na análise.')

            setLaudo(res.analysis)
            setStage('result')
            try { onSaved?.() } catch { /* noop */ }
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Erro inesperado.')
            setStage('error')
        }
    }, [canAnalyze, photos, studentUserId, onSaved])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-[2200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
            <div className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-neutral-800 bg-neutral-950 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.2)' }}>
                            <Sparkles className="w-5 h-5 text-yellow-500" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-white leading-tight">Avaliação por Foto</h2>
                            <p className="text-[11px] text-neutral-500">Laudo de composição corporal por IA</p>
                        </div>
                    </div>
                    <button onClick={handleClose} disabled={stage === 'processing'} aria-label="Fechar"
                        className="w-9 h-9 rounded-xl border border-neutral-700 text-neutral-400 hover:text-white hover:border-yellow-500/40 transition disabled:opacity-40 flex items-center justify-center">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5">
                    {stage === 'capture' && (
                        <div className="space-y-4">
                            <p className="text-sm text-neutral-400">
                                Tire ou escolha as 3 fotos. A de <span className="text-yellow-400 font-bold">frente</span> é obrigatória; perfil e costas deixam o laudo mais preciso. Use roupa justa, boa luz e corpo inteiro no quadro.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {BODY_PHOTO_POSES.map((pose) => {
                                    const photo = photos[pose]
                                    const isBusy = busyPose === pose
                                    return (
                                        <div key={pose} className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
                                            <div className="relative aspect-[3/4] bg-neutral-900 text-yellow-500/70 flex items-center justify-center">
                                                {photo ? (
                                                    <NextImage src={photo.previewDataUrl} alt={POSE_LABELS_PT[pose]} fill className="object-cover" unoptimized />
                                                ) : (
                                                    <PoseGuide pose={pose} gender={gender} />
                                                )}
                                                {photo ? (
                                                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-500 text-black flex items-center justify-center">
                                                        <Check className="w-4 h-4" />
                                                    </div>
                                                ) : null}
                                                {isBusy ? (
                                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                        <Loader2 className="w-6 h-6 text-yellow-500 animate-spin" />
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div className="p-2.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-bold text-white">{POSE_LABELS_PT[pose]}</span>
                                                    {pose === 'front' ? <span className="text-[9px] uppercase font-black text-yellow-500">Obrigatória</span> : null}
                                                </div>
                                                <p className="text-[11px] text-neutral-500 leading-snug mt-0.5 min-h-[28px]">{POSE_HINT[pose]}</p>
                                                <button
                                                    onClick={() => inputRefs.current[pose]?.click()}
                                                    className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95 border"
                                                    style={{ background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.3)', color: '#fde047' }}
                                                >
                                                    <Camera className="w-3.5 h-3.5" />
                                                    {photo ? 'Trocar' : 'Adicionar'}
                                                </button>
                                                <input
                                                    ref={(el) => { inputRefs.current[pose] = el }}
                                                    type="file" accept="image/*" className="hidden"
                                                    aria-label={`Foto ${POSE_LABELS_PT[pose]}`}
                                                    onChange={(e) => handleFile(pose, e.target.files)}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            {errorMsg ? <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorMsg}</p> : null}
                            <p className="text-[11px] text-neutral-600">Suas fotos ficam privadas (bucket criptografado, só você e seu personal acessam) e podem ser apagadas a qualquer momento.</p>
                        </div>
                    )}

                    {stage === 'processing' && (
                        <div className="py-12 flex flex-col items-center justify-center text-center gap-4">
                            <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
                            <div>
                                <p className="text-white font-bold">{progress || 'Processando…'}</p>
                                <p className="text-xs text-neutral-500 mt-1">Não feche esta janela.</p>
                            </div>
                        </div>
                    )}

                    {stage === 'result' && laudo ? (
                        <div className="space-y-5">
                            <BodyPhotoLaudoView laudo={laudo} />

                            {/* Correlação treino × corpo (on-demand) */}
                            <div className="pt-2 border-t border-neutral-800">
                                {correlation ? (
                                    <BodyPhotoCorrelationView correlation={correlation.data} window={correlation.window} />
                                ) : (
                                    <div className="text-center py-2">
                                        <p className="text-sm text-neutral-400 mb-3">
                                            Cruze este laudo com o que você de fato treinou no período — só o IronTracks faz isso.
                                        </p>
                                        <button
                                            onClick={handleCorrelate}
                                            disabled={correlationLoading}
                                            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl border font-bold transition active:scale-95 disabled:opacity-50"
                                            style={{ background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.3)', color: '#d8b4fe' }}
                                        >
                                            {correlationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Dumbbell className="w-4 h-4" />}
                                            {correlationLoading ? 'Cruzando com seus treinos…' : 'Correlação com treino'}
                                        </button>
                                        {correlationError ? <p className="mt-2 text-sm text-red-400">{correlationError}</p> : null}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : null}

                    {stage === 'error' && (
                        <div className="py-10 flex flex-col items-center text-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                                <X className="w-6 h-6 text-red-400" />
                            </div>
                            <p className="text-sm text-neutral-300 max-w-sm">{errorMsg || 'Não foi possível concluir a análise.'}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-neutral-800 shrink-0">
                    {stage === 'capture' && (
                        <button
                            onClick={handleAnalyze}
                            disabled={!canAnalyze}
                            className="w-full min-h-[48px] rounded-xl text-black font-black shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/30 transition active:scale-95 inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed btn-gold-animated"
                        >
                            <Sparkles className="w-5 h-5" />
                            Analisar {capturedCount > 0 ? `(${capturedCount}/3)` : ''}
                        </button>
                    )}
                    {stage === 'result' && (
                        <div className="flex gap-2">
                            <button onClick={reset} className="flex-1 min-h-[48px] rounded-xl border border-neutral-700 text-neutral-200 font-bold hover:border-yellow-500/40 transition active:scale-95 inline-flex items-center justify-center gap-2">
                                <RotateCcw className="w-4 h-4" /> Nova
                            </button>
                            <button onClick={handleClose} className="flex-1 min-h-[48px] rounded-xl text-black font-black transition active:scale-95 btn-gold-animated">
                                Concluir
                            </button>
                        </div>
                    )}
                    {stage === 'error' && (
                        <button onClick={() => setStage('capture')} className="w-full min-h-[48px] rounded-xl border border-neutral-700 text-neutral-200 font-bold hover:border-yellow-500/40 transition active:scale-95">
                            Tentar de novo
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
