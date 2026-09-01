'use client'

import React from 'react'
import { Layout, Move, RotateCcw, Crown, Download, Loader2, CheckCircle2, AlertCircle, Palette } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import VideoTrimmer from '@/components/stories/VideoTrimmer'
import { LayoutThumb } from './LayoutThumb'
import { STORY_LAYOUTS, LivePositions } from '../storyComposerUtils'
import type { StoryTemplate } from './storyTemplates'

interface StoryControlPanelProps {
    layout: string
    onSelectLayout: (l: string) => void
    templates: StoryTemplate[]
    templateId: string
    onSelectTemplate: (id: string) => void
    livePositions: LivePositions
    onResetPositions: () => void
    showTrimmer: boolean
    setShowTrimmer: (v: boolean) => void
    isVideo: boolean
    videoDuration: number
    trimRange: [number, number]
    setTrimRange: (v: [number, number]) => void
    previewTime: number
    videoRef: React.RefObject<HTMLVideoElement | null>
    busy: boolean
    busyAction: 'post' | 'share' | null
    busySubAction: 'processing' | 'uploading' | null
    uploadProgress: number
    error: string
    info: string
    onPost: () => void
    onShare: () => void
}

export function StoryControlPanel({
    layout, onSelectLayout, onResetPositions,
    templates, templateId, onSelectTemplate,
    showTrimmer, isVideo, videoDuration, trimRange, setTrimRange,
    previewTime, videoRef, busy, busyAction, busySubAction, uploadProgress,
    error, info, onPost, onShare,
}: StoryControlPanelProps) {
    return (
        <div className="flex-1 w-full max-w-[360px] flex flex-col gap-6">

            {/* Trimmer UI */}
            <AnimatePresence>
                {showTrimmer && isVideo && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <VideoTrimmer
                            duration={videoDuration}
                            value={trimRange}
                            onChange={(val) => {
                                setTrimRange(val)
                                if (videoRef.current && videoRef.current.paused) videoRef.current.currentTime = val[0]
                            }}
                            onPreview={(play) => {
                                if (!videoRef.current) return
                                if (play) {
                                    videoRef.current.currentTime = trimRange[0]
                                    videoRef.current.play()
                                    const check = () => {
                                        if (!videoRef.current) return
                                        if (videoRef.current.currentTime >= trimRange[1]) {
                                            videoRef.current.pause()
                                            videoRef.current.currentTime = trimRange[0]
                                        } else if (!videoRef.current.paused) { requestAnimationFrame(check) }
                                    }
                                    requestAnimationFrame(check)
                                } else { videoRef.current.pause() }
                            }}
                            currentTime={previewTime}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Template (Estilo) Selector */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-yellow-500/80 mb-2">
                    <Palette size={14} />
                    ESCOLHA O ESTILO
                    {/* O nome do escolhido vive aqui: uma vez, como ESTADO da
                        seção — não repetido sob cada bolinha como legenda. */}
                    {templates.find((t) => t.id === templateId)?.name && (
                        <span className="text-neutral-400">
                            · <span className="text-neutral-200">{templates.find((t) => t.id === templateId)?.name}</span>
                        </span>
                    )}
                </div>
                {/* grid-cols-3: são SEIS estilos, e em 5 colunas o último ficava
                    órfão numa segunda linha — a grade lutando contra o próprio
                    conteúdo. Três colunas dão duas linhas exatas e largura para o
                    nome caber ("CLÁSSICO" truncava em "CLÁSSI…", justamente no
                    item selecionado). */}
                {/* UMA linha (pedido do dono). Seis cards COM rótulo em 440pt
                    dariam ~62pt por célula, e "CLÁSSICO" em 10px não cabe em 62 —
                    voltaria a truncar, que é o defeito que acabamos de corrigir.
                    Então o rótulo saiu de baixo de cada um: a BOLINHA já é a
                    informação (é uma escolha de cor), e o nome "OCEAN" não diz
                    nada sobre a cor que o olho não tenha visto antes de ler.

                    Com o rótulo fora, o swatch CRESCE de 36 para 48px — fica
                    maior do que era em duas linhas. E o nome do estilo escolhido
                    aparece uma vez, ao lado do título da seção, onde é lido como
                    estado e não como legenda de cada peça. Mesma gramática do
                    Lightroom e do VSCO para presets. */}
                <div className="grid grid-cols-6 gap-2">
                    {templates.map((t) => {
                        const ativo = templateId === t.id
                        return (
                        <button
                            key={t.id} type="button"
                            onClick={() => onSelectTemplate(t.id)}
                            disabled={busy}
                            aria-pressed={ativo}
                            // Sem rótulo na tela, o nome tem que estar AQUI —
                            // senão o leitor de tela anuncia seis botões iguais.
                            aria-label={`Estilo ${t.name}`}
                            title={t.name}
                            className={['tap-44 flex aspect-square items-center justify-center rounded-2xl border transition-all active:scale-[0.94]',
                                ativo
                                    ? 'border-yellow-500/60 bg-yellow-500/10'
                                    : 'border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12] hover:bg-white/[0.05]',
                            ].join(' ')}
                        >
                            <span
                                className={['block h-full w-full max-h-12 max-w-12 rounded-full transition-shadow',
                                    ativo ? 'ring-2 ring-yellow-500/70' : 'ring-1 ring-white/15',
                                ].join(' ')}
                                style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 0%, ${t.swatch[1]} 100%)` }}
                            />
                        </button>
                        )
                    })}
                </div>
            </div>

            {/* Layout Selector */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-yellow-500/80 mb-2">
                    <Layout size={14} />
                    ESCOLHA O LAYOUT
                </div>
                {/* MINIATURA, não palavra. "Topo", "Esquerda", "Normal" descrevem
                    posição e obrigam o usuário a imaginar o resultado — em quatro
                    colunas com wireframe ele VÊ onde o conteúdo cai, e os sete
                    layouts cabem em duas linhas em vez de cinco. O `col-span-2`
                    do LIVE saiu: era ele que abria dois buracos na grade. */}
                <div className="grid grid-cols-4 gap-2">
                    {STORY_LAYOUTS.map((l) => {
                        const ativo = layout === l.id
                        return (
                        <button
                            key={l.id} type="button"
                            onClick={() => onSelectLayout(l.id)}
                            aria-pressed={ativo}
                            className={['flex flex-col items-center gap-1.5 rounded-2xl border p-2 transition-all active:scale-[0.97] disabled:opacity-40',
                                ativo
                                    ? 'border-yellow-500/60 bg-yellow-500/10 text-yellow-400'
                                    : 'border-white/[0.06] bg-white/[0.03] text-neutral-400 hover:border-white/[0.12] hover:bg-white/[0.05]',
                            ].join(' ')}
                            disabled={busy}
                        >
                            <LayoutThumb id={l.id} className="h-14 w-auto" />
                            <span className={['text-[10px] uppercase tracking-wide',
                                ativo ? 'font-black' : 'font-semibold',
                            ].join(' ')}>{l.label}</span>
                        </button>
                        )
                    })}
                </div>
                {layout === 'live' && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 mt-2">
                        <Move size={16} className="text-amber-400 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-xs text-amber-200 font-medium">Modo LIVE ativado</p>
                            <p className="text-[10px] text-amber-300/70 mt-1">Arraste os elementos na pré-visualização para personalizar.</p>
                        </div>
                        <button aria-label="Redefinir posições" onClick={onResetPositions} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-amber-500/20 text-amber-300" title="Resetar posições">
                            <RotateCcw size={14} />
                        </button>
                    </div>
                )}
            </div>

            <div className="flex-1 hidden lg:block" />

            {/* Status Messages */}
            <AnimatePresence mode="wait">
                {info && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
                        <CheckCircle2 size={18} className="text-emerald-500" />
                        <p className="text-xs font-bold text-emerald-200">{info}</p>
                    </motion.div>
                )}
                {error && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4 rounded-xl bg-red-950/40 border border-red-900/50 flex items-center gap-3">
                        <AlertCircle size={18} className="text-red-400" />
                        <p className="text-xs font-bold text-red-200">{error}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Actions
                ⚠️ Em MOBILE isto é uma barra FIXA no rodapé, não o fim de uma
                coluna que rola. Relato do Diogo (01/09/2026): "não consigo
                mudar os templates nem salvar a foto" — em 390×844 pt as ações
                ficavam abaixo da dobra, e a prévia (que ocupa quase a tela
                inteira e captura o arraste para mover o card) não deixa rolar
                a página. Sticky não resolveria: ele só segura o que JÁ está na
                viewport. No desktop segue empilhado dentro do painel. */}
            <div className="space-y-3 pt-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-[2600] max-lg:flex max-lg:items-center max-lg:gap-2 max-lg:space-y-0 max-lg:border-t max-lg:border-white/10 max-lg:bg-black/95 max-lg:backdrop-blur max-lg:px-4 max-lg:pt-3 max-lg:pb-[max(12px,env(safe-area-inset-bottom))]">
                {/* Primary: Post */}
                <div className="relative group max-lg:flex-1">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 rounded-2xl opacity-60 group-hover:opacity-100 blur-sm transition-opacity" />
                    <button
                        onClick={onPost} disabled={busy}
                        aria-label="Postar story no IronTracks" aria-busy={busyAction === 'post'}
                        className="relative h-14 w-full rounded-2xl bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 hover:from-yellow-400 hover:via-amber-300 hover:to-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all active:scale-[0.97]"
                    >
                        {busyAction === 'post' ? (
                            <><Loader2 className="animate-spin" size={18} /><span>{busySubAction === 'processing' ? 'PROCESSANDO...' : 'ENVIANDO...'}</span></>
                        ) : (
                            <><Crown size={18} strokeWidth={2.5} /><span>POSTAR NO IRONTRACKS</span></>
                        )}
                    </button>
                </div>

                {/* Upload progress */}
                {busyAction === 'post' && busySubAction === 'uploading' && (
                    <div className="space-y-1.5 max-lg:hidden" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do upload">
                        <div className="w-full bg-neutral-800/80 rounded-full h-2 overflow-hidden border border-neutral-700/50">
                            <div className="bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 h-2 rounded-full transition-all duration-300 ease-out" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <p className="text-[10px] text-yellow-500/70 text-right font-mono font-bold">{uploadProgress}%</p>
                    </div>
                )}

                {/* Secondary: Download / Share */}
                <button
                    onClick={onShare} disabled={busy}
                    aria-label="Baixar ou compartilhar a imagem do story"
                    className="relative h-12 w-full max-lg:h-14 max-lg:w-auto max-lg:shrink-0 max-lg:px-4 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-300 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-neutral-700/50 hover:border-yellow-500/30 transition-all active:scale-[0.97] overflow-hidden"
                >
                    {busyAction === 'share' ? (
                        <>
                            <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 via-amber-500/15 to-yellow-500/10 transition-all duration-300" />
                            <div className="relative flex items-center gap-2"><Loader2 className="animate-spin text-yellow-500" size={16} /><span className="text-yellow-500">{busySubAction === 'processing' ? 'PROCESSANDO...' : 'SALVANDO...'}</span></div>
                        </>
                    ) : (
                        <>
                            <Download size={15} className="text-yellow-500/70" />
                            {/* Na barra fixa não cabe o rótulo inteiro ao lado do
                                POSTAR — e o gesto é o mesmo: no iOS o "baixar"
                                abre o share sheet. O nome completo fica no
                                aria-label e na versão desktop. */}
                            <span className="max-lg:hidden">BAIXAR / COMPARTILHAR</span>
                            <span className="lg:hidden">SALVAR</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}
