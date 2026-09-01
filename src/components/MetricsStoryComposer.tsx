'use client'

/**
 * MetricsStoryComposer — o quarto composer da família (treino · nutrição ·
 * cardio · MÉTRICAS). Mesmo molde do `CardioStoryComposer`: todo o editor
 * (zoom/pan do bloco, marca arrastável, legenda livre, templates, publicar /
 * compartilhar / salvar) vem do `useStoryComposer`; aqui só muda o `draw` e a
 * origem dos dados.
 *
 * Os números vêm de `/api/admin/funnel-summary`, que é admin-only — este
 * componente não é montado para usuário comum, e o gate que vale é o da ROTA,
 * não o da UI.
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { STORY_PREVIEW_BOX, STORY_PREVIEW_ROW } from '@/lib/design/storyPreviewBox'
import { ArrowLeft, Upload, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStoryComposer } from '@/components/stories/useStoryComposer'
import { NutritionStoryControlPanel } from '@/components/stories/NutritionStoryControlPanel'
import { StoryComposerIosSavePanel } from './StoryComposerIosSavePanel'
import { BrandDragHandle } from '@/components/stories/BrandDragHandle'
import { AlignmentGuides } from '@/components/stories/AlignmentGuides'
import { CustomTextDragHandle } from '@/components/stories/CustomTextDragHandle'
import { CustomTextPanel } from '@/components/stories/CustomTextPanel'
import { CANVAS_W, CANVAS_H, SAFE_TOP, SAFE_BOTTOM, SAFE_SIDE } from './storyComposerUtils'
import { drawMetricsStory, metricsToContent, type MetricsStoryItem } from '@/components/stories/metricsStory'
import { NUTRITION_STORY_TEMPLATES, getNutritionTemplateById } from '@/components/stories/nutritionStoryTemplates'
import { useUserSettings } from '@/hooks/useUserSettings'
import { createClient } from '@/utils/supabase/client'
import { FullscreenPortal } from '@/components/stories/FullscreenPortal'
import { useBackHandler } from '@/hooks/useBackHandler'
import { properNameFieldProps } from '@/utils/ui/textFieldProps'

interface MetricsStoryComposerProps {
  open: boolean
  onClose: () => void
}

const PERIODS = [7, 14, 30] as const
const DEFAULT_TITLE = 'IRONTRACKS EM NÚMEROS'

export default function MetricsStoryComposer({ open, onClose }: MetricsStoryComposerProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  useBackHandler(open, onClose)

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

  // ── Dados do funil ─────────────────────────────────────────────────────────
  const [periodDays, setPeriodDays] = useState<number>(14)
  const [metrics, setMetrics] = useState<MetricsStoryItem[]>([])
  const [heroKey, setHeroKey] = useState<string | null>(null)
  const [title, setTitle] = useState<string>(DEFAULT_TITLE)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchMetrics = useCallback(async (days: number) => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/funnel-summary?days=${days}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(res.status === 403 ? 'Sem permissão (admin).' : 'Falha ao carregar as métricas.')
      const json = await res.json()
      const list = Array.isArray(json?.metrics) ? (json.metrics as MetricsStoryItem[]) : []
      setMetrics(list)
      // Só escolhe o herói na primeira carga — trocar o período não pode
      // desfazer a escolha de quem já mexeu no seletor.
      setHeroKey((cur) => (cur && list.some((m) => m.key === cur) ? cur : (list[0]?.key ?? null)))
    } catch (e) {
      setMetrics([])
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar as métricas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void fetchMetrics(periodDays)
  }, [open, periodDays, fetchMetrics])

  const content = useMemo(
    () => metricsToContent(metrics, { heroKey, periodDays, title }),
    [metrics, heroKey, periodDays, title],
  )

  const draw = useCallback(
    (args: { ctx: CanvasRenderingContext2D; canvasW: number; canvasH: number; backgroundImage: HTMLImageElement | null; transparentBg?: boolean; skipClear?: boolean; template: import('@/components/stories/storyTemplates').StoryTemplate; workoutTransform?: { scale: number; offsetX: number; offsetY: number }; brandOffset?: { x: number; y: number } }) =>
      drawMetricsStory({ ...args, content }),
    [content],
  )

  const metaOverride = useMemo<Record<string, unknown>>(() => ({
    source: 'metrics',
    periodDays,
    heroKey,
    metrics: metrics.map((m) => ({ key: m.key, value: m.value })),
  }), [periodDays, heroKey, metrics])

  const captionOverride = `${content.hero.value} · ${content.hero.label.toLowerCase()}`

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
    brandOffset, brandScale, alignGuides, onBrandPointerDown, onBrandPointerMove, onBrandPointerUp,
    customText, setCustomText, customTextOffset, customTextBox, customTextOverflowing,
    onCustomTextPointerDown, onCustomTextPointerMove, onCustomTextPointerUp,
    loadMedia, shareImage, postToIronTracks,
  } = useStoryComposer({
    open,
    session: { name: title },
    onClose,
    initialTemplateId: settings.metricsStoryTemplate,
    onTemplatePersist: (id) => { updateSetting('metricsStoryTemplate', id); void save({ metricsStoryTemplate: id }) },
    resolveTemplate: getNutritionTemplateById,
    draw,
    metaOverride,
    captionOverride,
  })

  const isVideo = mediaKind === 'video'

  useEffect(() => {
    if (!open) return
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawMetricsStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage, content, transparentBg: isVideo, template, workoutTransform, brandOffset, brandScale, customText, customTextOffset })
  }, [open, backgroundImage, isVideo, content, template, workoutTransform, brandOffset, brandScale, customText, customTextOffset])

  if (!open) return null

  // Portal: o composer é montado DENTRO de overlays que criam stacking context
  // próprio (ver FullscreenPortal). Sem sair de lá, o `z-[2500]` abaixo não vale
  // contra o resto da página e o topo — com o botão Voltar — fica encoberto.
  return (
    <FullscreenPortal>
    <AnimatePresence>
      {open && (
        <motion.div
          key="metrics-story-composer"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2500] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center sm:p-4 pt-safe pb-safe"
        >
          <div className="flex-none px-4 pb-4 pt-14 flex justify-between items-start w-full max-w-md mx-auto sm:hidden bg-gradient-to-b from-black/60 to-transparent border-b border-yellow-500/10">
            <div className="min-w-0 flex-1 mr-4">
              <h3 className="font-black text-lg truncate leading-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500">Story de métricas</h3>
              <p className="text-[10px] t-meta-inherit text-yellow-500/70 mt-1">COMPARTILHE OS NÚMEROS</p>
            </div>
            <button onClick={onClose} className="min-w-[44px] min-h-[44px] rounded-full bg-neutral-800/80 border border-neutral-700/50 text-neutral-400 flex items-center justify-center hover:bg-neutral-700 transition-colors flex-none" aria-label="Voltar" title="Voltar"><ArrowLeft size={16} /></button>
          </div>

          <motion.div
            initial={{ y: 20, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}
            className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-5xl bg-black sm:bg-neutral-900 sm:border border-neutral-800 sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="hidden sm:flex px-6 py-5 border-b border-yellow-500/10 items-center justify-between flex-none">
              <div>
                <h2 className="font-black text-xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500">Story de métricas</h2>
                <p className="text-[10px] t-meta-inherit text-yellow-500/70 mt-1">COMPARTILHE OS NÚMEROS</p>
              </div>
              <button onClick={onClose} className="min-w-[44px] min-h-[44px] rounded-full bg-neutral-800 border border-neutral-700/50 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors" aria-label="Voltar" title="Voltar"><ArrowLeft size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 bg-black sm:bg-transparent max-lg:pb-24">
              <div className="p-4 sm:p-8 flex flex-col lg:flex-row gap-8 h-full max-w-5xl mx-auto items-center lg:items-start">

                <div className="flex-none flex flex-col items-center gap-6">
                  <div
                    ref={previewRef}
                    className={`relative ${STORY_PREVIEW_BOX} aspect-[9/16] rounded-3xl overflow-hidden border border-neutral-800 bg-neutral-900 shadow-2xl ring-1 ring-white/10 shrink-0`}
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

                    <div
                      className="absolute inset-0 z-20 touch-none select-none cursor-grab active:cursor-grabbing"
                      onTouchStart={(e) => onWorkoutTouchStart({ touches: Array.from(e.touches) }, previewRef.current?.getBoundingClientRect() ?? null)}
                      onTouchMove={(e) => onWorkoutTouchMove({ touches: Array.from(e.touches) }, previewRef.current?.getBoundingClientRect() ?? null)}
                      onTouchEnd={onWorkoutTouchEnd}
                      onTouchCancel={onWorkoutTouchEnd}
                      onWheel={(e) => onWorkoutWheel(e.deltaY)}
                    >
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none px-2.5 py-1 rounded-full bg-black/55 backdrop-blur border border-white/15 text-[10px] t-meta-inherit text-white/80 whitespace-nowrap">
                        Pinça: zoom · Arraste: mover
                      </div>
                    </div>

                    <BrandDragHandle
                      brandOffset={brandOffset}
                      brandScale={brandScale}
                      template={template}
                      previewRef={previewRef}
                      onPointerDown={onBrandPointerDown}
                      onPointerMove={onBrandPointerMove}
                      onPointerUp={onBrandPointerUp}
                    />

                    <CustomTextDragHandle
                      box={customTextBox}
                      offset={customTextOffset}
                      previewRef={previewRef}
                      onPointerDown={onCustomTextPointerDown}
                      onPointerMove={onCustomTextPointerMove}
                      onPointerUp={onCustomTextPointerUp}
                    />

                    <AlignmentGuides x={alignGuides.x} y={alignGuides.y} />
                  </div>

                  <div className={`${STORY_PREVIEW_ROW} flex items-center gap-2`}>
                    <button type="button" onClick={() => nudgeWorkoutScale(-0.05)} disabled={busy} aria-label="Diminuir zoom" className="w-12 h-11 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-xl font-black hover:bg-neutral-800 disabled:opacity-50 transition-colors active:scale-95">−</button>
                    <div className="flex-1 h-11 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-center text-xs font-bold tabular-nums text-yellow-500">
                      {Math.round(workoutTransform.scale * 100)}%
                    </div>
                    <button type="button" onClick={() => nudgeWorkoutScale(0.05)} disabled={busy} aria-label="Aumentar zoom" className="w-12 h-11 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-xl font-black hover:bg-neutral-800 disabled:opacity-50 transition-colors active:scale-95">+</button>
                    <button type="button" onClick={resetWorkoutTransform} disabled={busy} className="h-11 px-4 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 text-[11px] font-bold uppercase tracking-wider hover:bg-neutral-800 hover:text-white disabled:opacity-50 transition-colors active:scale-95">Reset</button>
                  </div>

                  <div className={`${STORY_PREVIEW_ROW} flex items-center gap-3`}>
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

                {/* ── Dados: período · destaque · título ─────────────────── */}
                <div className="w-full max-w-[340px] lg:max-w-none space-y-4">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-4">
                    <div>
                      <p className="text-[10px] t-meta-inherit text-neutral-400 mb-2">Período</p>
                      <div className="flex gap-2">
                        {PERIODS.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setPeriodDays(d)}
                            aria-pressed={periodDays === d}
                            className={['flex-1 h-11 rounded-xl border text-[11px] font-bold uppercase tracking-wider transition-colors active:scale-95', periodDays === d ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:bg-neutral-800'].join(' ')}
                          >{d} dias</button>
                        ))}
                        <button
                          type="button"
                          onClick={() => void fetchMetrics(periodDays)}
                          disabled={loading}
                          aria-label="Recarregar métricas"
                          className="w-11 h-11 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 flex items-center justify-center hover:bg-neutral-800 disabled:opacity-50 transition-colors active:scale-95"
                        ><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] t-meta-inherit text-neutral-400 mb-2">Destaque</p>
                      {loading && metrics.length === 0 ? (
                        <p className="text-xs text-neutral-400">Carregando métricas…</p>
                      ) : loadError ? (
                        <p className="text-xs text-red-400">{loadError}</p>
                      ) : metrics.length === 0 ? (
                        <p className="text-xs text-neutral-400">Nenhuma métrica no período.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {metrics.map((m) => (
                            <button
                              key={m.key}
                              type="button"
                              onClick={() => setHeroKey(m.key)}
                              aria-pressed={heroKey === m.key}
                              className={['tap-44 px-3 h-9 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-colors active:scale-95', heroKey === m.key ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800'].join(' ')}
                            >{m.label} · {m.value}</button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label htmlFor="metrics-story-title" className="block text-[10px] t-meta-inherit text-neutral-400 mb-2">Título</label>
                      <input
                        id="metrics-story-title"
                        {...properNameFieldProps}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={40}
                        className="w-full h-11 px-3 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-sm font-bold focus:border-yellow-500/50 focus:outline-none"
                      />
                    </div>
                  </div>

                  <CustomTextPanel
                    value={customText}
                    onChange={setCustomText}
                    overflowing={customTextOverflowing}
                  />
                </div>

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
    </FullscreenPortal>
  )
}
