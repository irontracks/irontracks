'use client'

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { ArrowLeft, Upload } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStoryComposer } from '@/components/stories/useStoryComposer'
import { NutritionStoryControlPanel } from '@/components/stories/NutritionStoryControlPanel'
import { StoryComposerIosSavePanel } from './StoryComposerIosSavePanel'
import { CANVAS_W, CANVAS_H, SAFE_TOP, SAFE_BOTTOM, SAFE_SIDE } from './storyComposerUtils'
import { drawCardioStory, activityLabel, type CardioStoryContent } from '@/components/stories/cardioStory'
import { NUTRITION_STORY_TEMPLATES, getNutritionTemplateById } from '@/components/stories/nutritionStoryTemplates'
import { useUserSettings } from '@/hooks/useUserSettings'
import { createClient } from '@/utils/supabase/client'
import { useBackHandler } from '@/hooks/useBackHandler'

interface CardioStoryComposerProps {
  open: boolean
  content: CardioStoryContent
  onClose: () => void
}

export default function CardioStoryComposer({ open, content, onClose }: CardioStoryComposerProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  useBackHandler(open, onClose)

  // Template salvo (user_settings.preferences.cardioStoryTemplate)
  const [userId, setUserId] = useState<string | undefined>()
  useEffect(() => {
    if (!open) return
    let cancelled = false
    createClient().auth.getUser().then(({ data }) => {
      if (!cancelled && data?.user?.id) setUserId(data.user.id)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [open])
  const { settings, updateSetting, save } = useUserSettings(userId)

  const title = activityLabel(content.activityType)

  const draw = useCallback(
    (args: { ctx: CanvasRenderingContext2D; canvasW: number; canvasH: number; backgroundImage: HTMLImageElement | null; transparentBg?: boolean; skipClear?: boolean; template: import('@/components/stories/storyTemplates').StoryTemplate; workoutTransform?: { scale: number; offsetX: number; offsetY: number } }) =>
      drawCardioStory({ ...args, content }),
    [content],
  )
  const metaOverride = useMemo<Record<string, unknown>>(() => ({
    source: 'cardio',
    activityType: content.activityType,
    distanceMeters: content.distanceMeters,
    durationSeconds: content.durationSeconds,
    paceMinKm: content.paceMinKm,
    caloriesEstimated: content.caloriesEstimated,
  }), [content])
  const captionOverride = `${title} · ${((content.distanceMeters || 0) / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`

  const {
    inputRef, videoRef,
    mediaKind, backgroundUrl, backgroundImage,
    busy, busyAction, busySubAction, uploadProgress, isExporting,
    error, info, showSafeGuide,
    template, setTemplate,
    saveImageUrl, setSaveImageUrl,
    showTrimmer, videoDuration, trimRange, setTrimRange, previewTime,
    workoutTransform, nudgeWorkoutScale, resetWorkoutTransform,
    onWorkoutTouchStart, onWorkoutTouchMove, onWorkoutTouchEnd, onWorkoutWheel,
    loadMedia, shareImage, postToIronTracks,
  } = useStoryComposer({
    open,
    session: { name: title },
    onClose,
    caloriesOverride: content.caloriesEstimated,
    initialTemplateId: settings.cardioStoryTemplate,
    onTemplatePersist: (id) => { updateSetting('cardioStoryTemplate', id); void save({ cardioStoryTemplate: id }) },
    resolveTemplate: getNutritionTemplateById,
    draw,
    metaOverride,
    captionOverride,
  })

  const isVideo = mediaKind === 'video'

  // Draw loop do preview
  useEffect(() => {
    if (!open) return
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawCardioStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage, content, transparentBg: isVideo, template, workoutTransform })
  }, [open, backgroundImage, isVideo, content, template, workoutTransform])

  if (!open) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cardio-story-composer"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2500] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center sm:p-4 pt-safe pb-safe"
        >
          {/* Mobile Header */}
          <div className="flex-none px-4 pb-4 pt-14 flex justify-between items-start w-full max-w-md mx-auto sm:hidden bg-gradient-to-b from-black/60 to-transparent border-b border-yellow-500/10">
            <div className="min-w-0 flex-1 mr-4">
              <h3 className="font-black text-lg truncate leading-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500">{title}</h3>
              <p className="text-[10px] text-yellow-500/50 font-black uppercase tracking-[0.2em] mt-1">COMPARTILHE SEU CARDIO</p>
            </div>
            <button onClick={onClose} className="min-w-[44px] min-h-[44px] rounded-full bg-neutral-800/80 border border-neutral-700/50 text-neutral-400 flex items-center justify-center hover:bg-neutral-700 transition-colors flex-none" aria-label="Voltar" title="Voltar"><ArrowLeft size={16} /></button>
          </div>

          <motion.div
            initial={{ y: 20, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}
            className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-5xl bg-black sm:bg-neutral-900 sm:border border-neutral-800 sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Desktop Header */}
            <div className="hidden sm:flex px-6 py-5 border-b border-yellow-500/10 items-center justify-between flex-none bg-gradient-to-r from-neutral-900 via-neutral-900 to-neutral-900">
              <div>
                <h2 className="font-black text-xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500">{title}</h2>
                <p className="text-[10px] text-yellow-500/50 font-black uppercase tracking-[0.2em] mt-1">COMPARTILHE SEU CARDIO</p>
              </div>
              <button onClick={onClose} className="min-w-[44px] min-h-[44px] rounded-full bg-neutral-800 border border-neutral-700/50 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors" aria-label="Voltar" title="Voltar"><ArrowLeft size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 bg-black sm:bg-transparent">
              <div className="p-4 sm:p-8 flex flex-col lg:flex-row gap-8 h-full max-w-5xl mx-auto items-center lg:items-start">

                {/* Preview */}
                <div className="flex-none flex flex-col items-center gap-6">
                  <div
                    ref={previewRef}
                    className="relative w-full max-w-[300px] sm:max-w-[340px] aspect-[9/16] rounded-3xl overflow-hidden border border-neutral-800 bg-neutral-900 shadow-2xl ring-1 ring-white/10 shrink-0"
                  >
                    {isVideo && (
                      <video
                        key={backgroundUrl || 'no-video'}
                        ref={videoRef}
                        aria-label="Prévia do vídeo"
                        crossOrigin="anonymous"
                        src={backgroundUrl || undefined}
                        className="absolute inset-0 w-full h-full object-cover bg-black"
                        controls={false} playsInline muted autoPlay loop
                      />
                    )}

                    <canvas ref={previewCanvasRef} aria-label="Canvas de prévia da story" width={CANVAS_W} height={CANVAS_H} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />

                    {showSafeGuide && (
                      <div className="absolute inset-0 pointer-events-none z-10">
                        <div className="absolute left-0 right-0 h-px bg-yellow-400/40" style={{ top: `${(SAFE_TOP / CANVAS_H) * 100}%` }} />
                        <div className="absolute left-0 right-0 h-px bg-yellow-400/40" style={{ bottom: `${(SAFE_BOTTOM / CANVAS_H) * 100}%` }} />
                        <div className="absolute top-0 bottom-0 w-px bg-yellow-400/20" style={{ left: `${(SAFE_SIDE / CANVAS_W) * 100}%` }} />
                        <div className="absolute top-0 bottom-0 w-px bg-yellow-400/20" style={{ right: `${(SAFE_SIDE / CANVAS_W) * 100}%` }} />
                      </div>
                    )}

                    {/* Pinça (2 dedos) = zoom · arrasto (1 dedo) = mover o card (sem foto) */}
                    {!isVideo && (
                      <div
                        className="absolute inset-0 z-20 touch-none select-none cursor-grab active:cursor-grabbing"
                        onTouchStart={(e) => onWorkoutTouchStart({ touches: Array.from(e.touches) })}
                        onTouchMove={(e) => onWorkoutTouchMove({ touches: Array.from(e.touches) }, previewRef.current?.getBoundingClientRect() ?? null)}
                        onTouchEnd={onWorkoutTouchEnd}
                        onTouchCancel={onWorkoutTouchEnd}
                        onWheel={(e) => onWorkoutWheel(e.deltaY)}
                      >
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none px-2.5 py-1 rounded-full bg-black/55 backdrop-blur border border-white/15 text-[9px] font-black uppercase tracking-widest text-white/80 whitespace-nowrap">
                          Pinça: zoom · Arraste: mover
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Controles de zoom precisos (+/− e Reset) */}
                  {!isVideo && (
                    <div className="w-full max-w-[300px] sm:max-w-[340px] flex items-center gap-2">
                      <button
                        type="button" onClick={() => nudgeWorkoutScale(-0.05)} disabled={busy}
                        aria-label="Diminuir zoom"
                        className="w-12 h-11 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-xl font-black hover:bg-neutral-800 disabled:opacity-50 transition-colors active:scale-95"
                      >−</button>
                      <div className="flex-1 h-11 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-center text-xs font-black tabular-nums text-yellow-500">
                        {Math.round(workoutTransform.scale * 100)}%
                      </div>
                      <button
                        type="button" onClick={() => nudgeWorkoutScale(0.05)} disabled={busy}
                        aria-label="Aumentar zoom"
                        className="w-12 h-11 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-xl font-black hover:bg-neutral-800 disabled:opacity-50 transition-colors active:scale-95"
                      >+</button>
                      <button
                        type="button" onClick={resetWorkoutTransform} disabled={busy}
                        className="h-11 px-4 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 text-[11px] font-bold uppercase tracking-wider hover:bg-neutral-800 hover:text-white disabled:opacity-50 transition-colors active:scale-95"
                      >Reset</button>
                    </div>
                  )}

                  {/* Upload de foto de fundo (opcional) */}
                  <div className="w-full max-w-[300px] sm:max-w-[340px] flex items-center gap-3">
                    <label className={['flex-1 h-12 rounded-xl bg-neutral-900 border border-neutral-800 text-white font-bold text-[11px] uppercase tracking-wider hover:bg-neutral-800 hover:border-neutral-700 inline-flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]', busy ? 'opacity-50 pointer-events-none' : ''].join(' ')}>
                      <Upload size={16} className="text-yellow-500" />
                      {backgroundImage ? 'TROCAR FOTO' : 'ADICIONAR FOTO DE FUNDO'}
                      <input
                        ref={inputRef} type="file" aria-label="Adicionar foto" accept="image/*" className="sr-only"
                        onChange={(e) => { const f = e.target.files?.[0] || null; if (inputRef.current) inputRef.current.value = ''; loadMedia(f) }}
                      />
                    </label>
                  </div>

                  {isExporting && (
                    <p className="text-[10px] text-yellow-500/70 font-bold uppercase tracking-widest">Renderizando…</p>
                  )}
                </div>

                {/* Painel de controle (reusa o de nutrição — templates + post/share) */}
                <NutritionStoryControlPanel
                  templates={NUTRITION_STORY_TEMPLATES}
                  templateId={template.id}
                  onSelectTemplate={(id) => setTemplate(getNutritionTemplateById(id))}
                  showTrimmer={showTrimmer}
                  isVideo={isVideo}
                  videoDuration={videoDuration}
                  trimRange={trimRange}
                  setTrimRange={setTrimRange}
                  previewTime={previewTime}
                  videoRef={videoRef}
                  busy={busy}
                  busyAction={busyAction}
                  busySubAction={busySubAction}
                  uploadProgress={uploadProgress}
                  error={error}
                  info={info}
                  onPost={postToIronTracks}
                  onShare={shareImage}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      <StoryComposerIosSavePanel key="ios-save-panel" saveImageUrl={saveImageUrl} onClose={() => setSaveImageUrl(null)} />
    </AnimatePresence>
  )
}
