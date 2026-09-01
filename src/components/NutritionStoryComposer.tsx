'use client'

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { STORY_PREVIEW_BOX, STORY_PREVIEW_ROW } from '@/lib/design/storyPreviewBox'
import { ArrowLeft, Upload, Scissors } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStoryComposer } from '@/components/stories/useStoryComposer'
import { NutritionStoryControlPanel } from '@/components/stories/NutritionStoryControlPanel'
import { StoryComposerIosSavePanel } from './StoryComposerIosSavePanel'
import { BrandDragHandle } from '@/components/stories/BrandDragHandle'
import { AlignmentGuides } from '@/components/stories/AlignmentGuides'
import { CustomTextDragHandle } from '@/components/stories/CustomTextDragHandle'
import { CustomTextPanel } from '@/components/stories/CustomTextPanel'
import { CANVAS_W, CANVAS_H, SAFE_TOP, SAFE_BOTTOM, SAFE_SIDE } from './storyComposerUtils'
import { drawNutritionStory, type NutritionStoryContent } from '@/components/stories/nutritionStory'
import { NUTRITION_STORY_TEMPLATES, getNutritionTemplateById } from '@/components/stories/nutritionStoryTemplates'
import { useUserSettings } from '@/hooks/useUserSettings'
import { createClient } from '@/utils/supabase/client'
import { FullscreenPortal } from '@/components/stories/FullscreenPortal'
import { useBackHandler } from '@/hooks/useBackHandler'

interface NutritionStoryComposerProps {
  open: boolean
  mode: 'meal' | 'day' | 'period'
  content: NutritionStoryContent
  onClose: () => void
}

export default function NutritionStoryComposer({ open, mode, content, onClose }: NutritionStoryComposerProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  useBackHandler(open, onClose)

  // Template salvo (user_settings.preferences.nutritionStoryTemplate)
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

  const title =
    content.kind === 'meal' ? content.mealName
      : content.kind === 'period' ? content.periodLabel
        : 'Resumo do dia'

  // Renderer injetado + meta/caption do POST (deriva do content).
  const draw = useCallback(
    (args: { ctx: CanvasRenderingContext2D; canvasW: number; canvasH: number; backgroundImage: HTMLImageElement | null; transparentBg?: boolean; skipClear?: boolean; template: import('@/components/stories/storyTemplates').StoryTemplate; workoutTransform?: { scale: number; offsetX: number; offsetY: number }; brandOffset?: { x: number; y: number } }) =>
      drawNutritionStory({ ...args, content }),
    [content],
  )
  const metaOverride = useMemo<Record<string, unknown>>(() => {
    if (content.kind === 'meal') {
      return { source: 'nutrition', kind: 'meal', mealName: content.mealName, calories: content.calories, protein: content.protein, carbs: content.carbs, fat: content.fat }
    }
    if (content.kind === 'period') {
      // `loggedDays`/`windowDays` viajam no meta pelo mesmo motivo que estão
      // desenhados: a média sem a cobertura vira outra afirmação.
      return { source: 'nutrition', kind: 'period', periodLabel: content.periodLabel, rangeText: content.rangeText, calories: content.calories, goalCalories: content.goalCalories, protein: content.protein, carbs: content.carbs, fat: content.fat, loggedDays: content.loggedDays, windowDays: content.windowDays }
    }
    return { source: 'nutrition', kind: 'day', dateText: content.dateText, calories: content.calories, goalCalories: content.goalCalories, protein: content.protein, carbs: content.carbs, fat: content.fat }
  }, [content])
  const captionOverride =
    content.kind === 'meal' ? content.mealName
      : content.kind === 'period' ? `${content.periodLabel} · ${content.rangeText}`
        : `Resumo do dia ${content.dateText}`

  const {
    inputRef, videoRef,
    mediaKind, backgroundUrl, backgroundImage,
    busy, busyAction, busySubAction, uploadProgress, isExporting,
    error, info, showSafeGuide,
    template, setTemplate,
    saveImageUrl, setSaveImageUrl,
    showTrimmer, setShowTrimmer, videoDuration, trimRange, setTrimRange, previewTime,
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
    caloriesOverride: content.calories,
    initialTemplateId: settings.nutritionStoryTemplate,
    onTemplatePersist: (id) => { updateSetting('nutritionStoryTemplate', id); void save({ nutritionStoryTemplate: id }) },
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
    drawNutritionStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage, content, transparentBg: isVideo, template, workoutTransform, brandOffset, brandScale, customText, customTextOffset })
  }, [open, backgroundImage, isVideo, content, template, workoutTransform, brandOffset, brandScale, customText, customTextOffset])

  /**
   * Story de nutrição NASCE pedindo a foto (pedido do dono, 16/08/2026).
   *
   * A mídia sempre foi aceita nos três modos, mas era um botão no meio do
   * painel: quem abria via o card sobre o gradiente do template e seguia
   * assim. Agora o seletor abre junto com a tela, como no Instagram Stories.
   *
   * ⚠️ MEDIDO NO IPHONE (16/08/2026): no WKWebView isto NÃO abre o seletor. O
   * WebKit só abre o picker de arquivo com ativação transitória do usuário, e
   * até este efeito rodar ela já se foi — o composer é `dynamic()`, então entre
   * o toque em "Compartilhar" e o mount há o carregamento do chunk. A tentativa
   * fica porque funciona na web e não custa nada; quem garante a foto no
   * aparelho é o CONVITE em cima da prévia, que abre o picker com um toque real.
   *
   * Três guardas: (1) só uma vez por abertura (`pediuMidiaRef`), senão cancelar
   * o picker o reabriria em loop; (2) só quando ainda NÃO há mídia — reabrir o
   * composer de um story que já tem foto não pode pedir outra; (3) falha em
   * silêncio se o WebView recusar — nesse caso sobra a tela normal.
   */
  const pediuMidiaRef = useRef(false)
  useEffect(() => {
    if (!open) { pediuMidiaRef.current = false; return }
    if (pediuMidiaRef.current || backgroundImage || isVideo) return
    pediuMidiaRef.current = true
    // rAF: o input precisa estar montado no DOM antes do clique.
    const id = requestAnimationFrame(() => {
      try { inputRef.current?.click() } catch { /* WebView recusou — segue a tela normal */ }
    })
    return () => cancelAnimationFrame(id)
  }, [open, backgroundImage, isVideo, inputRef])


  if (!open) return null

  // Portal: o composer é montado DENTRO de overlays que criam stacking context
  // próprio (ver FullscreenPortal). Sem sair de lá, o `z-[2500]` abaixo não vale
  // contra o resto da página e o topo — com o botão Voltar — fica encoberto.
  return (
    <FullscreenPortal>
    <AnimatePresence>
      {open && (
        <motion.div
          key="nutrition-story-composer"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2500] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center sm:p-4 pt-safe pb-safe"
        >
          {/* Mobile Header */}
          <div className="flex-none px-4 pb-4 pt-14 flex justify-between items-start w-full max-w-md mx-auto sm:hidden bg-gradient-to-b from-black/60 to-transparent border-b border-yellow-500/10">
            <div className="min-w-0 flex-1 mr-4">
              <h3 className="font-black text-lg truncate leading-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500">{title}</h3>
              <p className="text-[10px] text-yellow-500/50 font-black uppercase tracking-[0.2em] mt-1">{mode === 'meal' ? 'COMPARTILHE SUA REFEIÇÃO' : mode === 'period' ? 'COMPARTILHE SEU PERÍODO' : 'COMPARTILHE SEU DIA'}</p>
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
                <p className="text-[10px] text-yellow-500/50 font-black uppercase tracking-[0.2em] mt-1">{mode === 'meal' ? 'COMPARTILHE SUA REFEIÇÃO' : mode === 'period' ? 'COMPARTILHE SEU PERÍODO' : 'COMPARTILHE SEU DIA'}</p>
              </div>
              <button onClick={onClose} className="min-w-[44px] min-h-[44px] rounded-full bg-neutral-800 border border-neutral-700/50 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors" aria-label="Voltar" title="Voltar"><ArrowLeft size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 bg-black sm:bg-transparent max-lg:pb-32">
              <div className="p-4 sm:p-8 flex flex-col lg:flex-row gap-8 min-h-full max-w-5xl mx-auto items-center lg:items-start">

                {/* Preview */}
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

                    {/* Pinça (2 dedos) = zoom · arrasto (1 dedo) = mover o card (a foto fica fixa) */}
                    <div
                      className="absolute inset-0 z-20 touch-none select-none cursor-grab active:cursor-grabbing"
                      onTouchStart={(e) => onWorkoutTouchStart({ touches: Array.from(e.touches) }, previewRef.current?.getBoundingClientRect() ?? null)}
                      onTouchMove={(e) => onWorkoutTouchMove({ touches: Array.from(e.touches) }, previewRef.current?.getBoundingClientRect() ?? null)}
                      onTouchEnd={onWorkoutTouchEnd}
                      onTouchCancel={onWorkoutTouchEnd}
                      onWheel={(e) => onWorkoutWheel(e.deltaY)}
                    >
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none px-2.5 py-1 rounded-full bg-black/55 backdrop-blur border border-white/15 text-[9px] font-black uppercase tracking-widest text-white/80 whitespace-nowrap">
                        Pinça: zoom · Arraste: mover
                      </div>
                    </div>

                    {/* Alça da MARCA — arrasta o IRON·TRACKS sozinho, fora do bloco */}
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

                    {/* Guias de alinhamento — só durante o arrasto da marca. */}
                    <AlignmentGuides x={alignGuides.x} y={alignGuides.y} />
                  </div>

                  {/* Controles de zoom precisos (+/− e Reset) */}
                  <div className={`${STORY_PREVIEW_ROW} flex items-center gap-2`}>
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

                  {/* Upload de foto/vídeo de fundo — vale nos DOIS modos (refeição e resumo do
                      dia). Antes era gateado por `mode === 'meal'`, então o "Resumo do dia" só
                      oferecia os estilos de cor, sem anexar mídia. O renderer já compõe os
                      macros por cima da imagem/vídeo (transparentBg quando é vídeo). */}
                  <div className={`${STORY_PREVIEW_ROW} flex items-center gap-3`}>
                    {/* Sem mídia, isto é a AÇÃO da tela — o story de nutrição é
                        para sair com foto (pedido do dono, 16/08/2026). Com mídia
                        já escolhida vira o botão discreto de trocar: dourado ali
                        competiria com salvar/publicar.

                        ⚠️ Já houve um convite DENTRO da prévia, e ele foi
                        removido depois de duas rodadas no aparelho: (1) os
                        handlers de pinça/arrasto da prévia dão `preventDefault`
                        e cancelavam o clique do label, então ele não abria
                        nada; (2) resolvido isso, ele cobria o desenho —
                        centralizado tapava o "MÉDIA POR DIA", e mais acima
                        tapava a marca. A prévia é o RESULTADO; controle se
                        põe fora dela. Não recriar. */}
                    <label className={[
                      'flex-1 rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] uppercase tracking-wider',
                      backgroundImage || isVideo
                        ? 'h-12 bg-neutral-900 border border-neutral-800 text-white font-bold text-[11px] hover:bg-neutral-800 hover:border-neutral-700'
                        : 'h-14 bg-yellow-500 text-black t-action text-xs hover:bg-yellow-400',
                      busy ? 'opacity-50 pointer-events-none' : '',
                    ].join(' ')}>
                      <Upload size={16} className={backgroundImage || isVideo ? 'text-yellow-500' : 'text-black'} />
                      {backgroundImage || isVideo ? 'TROCAR MÍDIA' : 'PONHA SUA FOTO OU VÍDEO'}
                      <input
                        ref={inputRef} type="file" aria-label="Adicionar mídia" accept="image/*,video/*" className="sr-only"
                        onChange={(e) => { const f = e.target.files?.[0] || null; if (inputRef.current) inputRef.current.value = ''; loadMedia(f) }}
                      />
                    </label>
                    {isVideo && (
                      <button type="button" onClick={() => setShowTrimmer(v => !v)}
                        className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-colors active:scale-[0.98] ${showTrimmer ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'}`}
                        disabled={busy}
                        aria-label="Cortar vídeo"
                      >
                        <Scissors size={16} />
                      </button>
                    )}
                  </div>

                  {isExporting && (
                    <p className="text-[10px] text-yellow-500/70 font-bold uppercase tracking-widest">Renderizando vídeo…</p>
                  )}
                </div>

                {/* Painel de controle */}

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

                {/* A LEGENDA fica DEPOIS dos controles (01/09/2026).
                    Medido no aparelho do usuário (393×852): a barra de ações
                    ocupa de 749 a 852, e com a legenda antes do painel o
                    seletor de estilo caía por baixo dela — ele conseguia
                    postar e salvar, mas não trocar cor nem layout. Estilo e
                    layout são a razão de existir do composer; a legenda é
                    opcional e quem quer escrever rola atrás dela. */}
                <div className="w-full max-w-[340px] lg:max-w-none">
                  <CustomTextPanel
                    value={customText}
                    onChange={setCustomText}
                    overflowing={customTextOverflowing}
                  />
                </div>
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
