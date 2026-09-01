'use client'

import React from 'react'
import { Palette, Crown, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import VideoTrimmer from '@/components/stories/VideoTrimmer'
import type { StoryTemplate } from './storyTemplates'
import { useMedirPosicaoDasAcoes } from './useMedirPosicaoDasAcoes'

interface NutritionStoryControlPanelProps {
  templates: StoryTemplate[]
  templateId: string
  onSelectTemplate: (id: string) => void
  // Vídeo (só no modo refeição com vídeo)
  showTrimmer: boolean
  isVideo: boolean
  videoDuration: number
  trimRange: [number, number]
  setTrimRange: (v: [number, number]) => void
  previewTime: number
  videoRef: React.RefObject<HTMLVideoElement | null>
  // Ações
  busy: boolean
  busyAction: 'post' | 'share' | null
  busySubAction: 'processing' | 'uploading' | null
  uploadProgress: number
  error: string
  info: string
  onPost: () => void
  onShare: () => void
}

export function NutritionStoryControlPanel({
  templates, templateId, onSelectTemplate,
  showTrimmer, isVideo, videoDuration, trimRange, setTrimRange, previewTime, videoRef,
  busy, busyAction, busySubAction, uploadProgress, error, info, onPost, onShare,
}: NutritionStoryControlPanelProps) {
  const { acoes: acoesRef, estilo: estiloRef } = useMedirPosicaoDasAcoes('nutricao')
  return (
    <div className="flex-1 w-full max-w-[360px] flex flex-col gap-6">

      {/* Trimmer (refeição + vídeo) */}
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

      {/* Seletor de estilo */}
      <div ref={estiloRef} className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-yellow-500/80 mb-2">
          <Palette size={14} />
          ESCOLHA O ESTILO
          {templates.find((t) => t.id === templateId)?.name && (
            <span className="text-neutral-400">
              · <span className="text-neutral-200">{templates.find((t) => t.id === templateId)?.name}</span>
            </span>
          )}
        </div>
        {/* Mesma gramática do StoryControlPanel: seleção em DOURADO, não em
            branco sólido. Branco puro é o maior contraste possível (21:1) e
            estava sendo gasto num controle secundário, roubando o olho do
            preview — que é o que o usuário veio ver. Três colunas dão nome
            inteiro e linhas cheias. */}
        {/* Mesma gramática do StoryControlPanel: uma linha, sem rótulo sob
            cada bolinha (a cor é a informação) e o nome do escolhido ao lado do
            título da seção. Cinco estilos aqui, seis lá — o `grid-cols-6` serve
            aos dois, e com cinco a última coluna fica vazia sem quebrar linha. */}
        <div className="grid grid-cols-6 gap-2">
          {templates.map((t) => {
            const ativo = templateId === t.id
            return (
            <button
              key={t.id} type="button"
              onClick={() => onSelectTemplate(t.id)}
              disabled={busy}
              aria-pressed={ativo}
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

      <div className="flex-1 hidden lg:block" />

      {/* Mensagens */}
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

      {/* Ações — barra FIXA no rodapé em mobile, igual ao painel de treino.
          ⚠️ A correção de 01/09 (relato do Diogo) só alcançou o
          `StoryControlPanel`; nutrição, cardio e métricas usam ESTE painel e
          ficaram com as ações no fim de uma coluna que o usuário só alcança
          rolando por cima da prévia — que captura o arraste. Ou seja: o mesmo
          defeito, em três dos quatro caminhos. */}
      <div ref={acoesRef} className="story-actions-bar space-y-3 pt-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-[2600] max-lg:flex max-lg:items-center max-lg:gap-2 max-lg:space-y-0 max-lg:border-t max-lg:border-white/10 max-lg:bg-black/95 max-lg:backdrop-blur max-lg:px-4 max-lg:pt-3 max-lg:pb-[max(12px,env(safe-area-inset-bottom))]">
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

        {busyAction === 'post' && busySubAction === 'uploading' && (
          <div className="space-y-1.5 max-lg:hidden" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do upload">
            <div className="w-full bg-neutral-800/80 rounded-full h-2 overflow-hidden border border-neutral-700/50">
              <div className="bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 h-2 rounded-full transition-all duration-300 ease-out" style={{ width: `${uploadProgress}%` }} />
            </div>
            <p className="text-[10px] text-yellow-500/70 text-right font-mono font-bold">{uploadProgress}%</p>
          </div>
        )}

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
              <span className="max-lg:hidden">BAIXAR / COMPARTILHAR</span>
              <span className="lg:hidden">SALVAR</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
