'use client'

import React, { useRef, useState, useEffect } from 'react'
import { ArrowLeft, Frame, PersonStanding, RotateCcw, Scissors, Upload } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStoryComposer } from '@/components/stories/useStoryComposer'
import { StoryControlPanel } from '@/components/stories/StoryControlPanel'
import { StoryComposerIosSavePanel } from './StoryComposerIosSavePanel'
import { BrandDragHandle } from '@/components/stories/BrandDragHandle'
import { TimeDragHandle } from '@/components/stories/TimeDragHandle'
import { AlignmentGuides } from '@/components/stories/AlignmentGuides'
import { CustomTextDragHandle } from '@/components/stories/CustomTextDragHandle'
import { CustomTextPanel } from '@/components/stories/CustomTextPanel'
import { getTemplateById } from '@/components/stories/storyTemplates'
import { buildSessionMuscles } from '@/lib/muscleMap/sessionMuscles'
import { buildMannequinBlob } from '@/lib/muscleMap/mannequinCanvas'
import { logWarnRemote } from '@/lib/logger'
import { useUserSettings } from '@/hooks/useUserSettings'
import { useBackHandler } from '@/hooks/useBackHandler'
import { createClient } from '@/utils/supabase/client'
import {
  SessionLite,
  CANVAS_W,
  CANVAS_H,
  SAFE_TOP,
  SAFE_BOTTOM,
  SAFE_SIDE,
  DEFAULT_LIVE_POSITIONS,
  clamp01,
  drawStory,
} from './storyComposerUtils'

interface StoryComposerProps {
  open: boolean
  session: SessionLite
  onClose: () => void
  /** Pre-calculated calories from the report (avoids re-computation divergence) */
  calories?: number
}

export default function StoryComposer({ open, session, onClose, calories }: StoryComposerProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  // Template salvo do usuário (user_settings.preferences.storyTemplate).
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

  const {
    inputRef, videoRef,
    mediaKind, backgroundUrl, backgroundImage,
    busy, busyAction, busySubAction, uploadProgress, isExporting,
    error, info, showSafeGuide, setShowSafeGuide,
    layout, livePositions, setLivePositions,
    template, setTemplate, templates,
    draggingKey, saveImageUrl, setSaveImageUrl,
    showTrimmer, setShowTrimmer, videoDuration, trimRange, setTrimRange, previewTime,
    metrics: rawMetrics,
    workoutTransform, nudgeWorkoutScale, resetWorkoutTransform,
    onWorkoutTouchStart, onWorkoutTouchMove, onWorkoutTouchEnd, onWorkoutWheel,
    brandOffset, brandScale, alignGuides, onBrandPointerDown, onBrandPointerMove, onBrandPointerUp,
    timeOffset, onTimePointerDown, onTimePointerMove, onTimePointerUp,
    customText, setCustomText, customTextOffset, customTextBox, customTextOverflowing,
    onCustomTextPointerDown, onCustomTextPointerMove, onCustomTextPointerUp,
    loadMedia, onSelectLayout,
    onPiecePointerDown, onPiecePointerMove, onPiecePointerUp,
    onGroupPointerDown, onGroupPointerMove, onGroupPointerUp,
    shareImage, postToIronTracks,
  } = useStoryComposer({
    open,
    session,
    onClose,
    caloriesOverride: calories,
    initialTemplateId: settings.storyTemplate,
    onTemplatePersist: (id) => { updateSetting('storyTemplate', id); void save({ storyTemplate: id }) },
  })

  /* ── Manequim: o corpo no lugar da foto ─────────────────────────────────
   * Para quem não quer se expor, mas quer mostrar o treino. Entra pela MESMA
   * porta da foto (`loadMedia`), então nenhum renderer precisa saber que a
   * "foto" é gerada — e zoom, pan, layouts, export e publicação valem de graça.
   * Vazio = a sessão não tem série concluída que a heurística reconheça; o
   * botão desabilita em vez de entregar um manequim apagado. */
  const sessionMuscles = React.useMemo(() => (open ? buildSessionMuscles(session) : {}), [open, session])
  const hasMuscles = React.useMemo(() => Object.keys(sessionMuscles).length > 0, [sessionMuscles])
  const [mannequinBusy, setMannequinBusy] = useState(false)

  const useMannequin = React.useCallback(async () => {
    if (!hasMuscles || mannequinBusy) return
    setMannequinBusy(true)
    try {
      const blob = await buildMannequinBlob({
        muscles: sessionMuscles,
        gender: settings.biologicalSex === 'female' ? 'female' : 'male',
        background: template.overlay.fallbackBg,
        canvasW: CANVAS_W,
        canvasH: CANVAS_H,
      })
      await loadMedia(new File([blob], 'irontracks-manequim.png', { type: 'image/png' }))
    } catch (e) {
      // Falha aqui é asset que não carregou; o composer segue usável com o
      // fundo do template. Silenciar seria mais uma saída muda em caminho
      // visual — e é assim que a Live Activity morreu 12 vezes.
      logWarnRemote('story.mannequin.failed', 'não foi possível montar o manequim', {
        message: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setMannequinBusy(false)
    }
  }, [hasMuscles, mannequinBusy, sessionMuscles, settings.biologicalSex, template, loadMedia])

  // metrics.kcal already reflects caloriesOverride (applied inside the hook so the canvas is correct)
  const metrics = rawMetrics

  // Draw loop
  React.useEffect(() => {
    if (!open) return
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    const draw = () => drawStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage, metrics, layout, livePositions, transparentBg: mediaKind === 'video', template, workoutTransform, brandOffset, brandScale, customText, customTextOffset, timeOffset })
    if (isExporting) { draw(); return }
    if (layout === 'live' && draggingKey) { raf = requestAnimationFrame(draw) } else { draw() }
    return () => cancelAnimationFrame(raf)
  }, [open, backgroundImage, layout, livePositions, mediaKind, metrics, draggingKey, isExporting, template, workoutTransform, brandOffset, brandScale, customText, customTextOffset, timeOffset])

  const livePieces = React.useMemo(() => [
    { key: 'brand', label: 'IRONTRACKS' },
    { key: 'title', label: 'TREINO' },
    { key: 'subtitle', label: 'RELATÓRIO' },
    { key: 'cardVolume', label: 'VOLUME' },
    { key: 'cardTempo', label: 'TEMPO' },
    { key: 'cardKcal', label: 'KCAL' },
  ], [])

  useBackHandler(open, onClose)

  if (!open) return null

  const isVideo = mediaKind === 'video'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="story-composer"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2500] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center sm:p-4 pt-safe pb-safe"
        >
          {/* Mobile Header */}
          <div className="flex-none px-4 pb-4 pt-14 flex justify-between items-start w-full max-w-md mx-auto sm:hidden bg-gradient-to-b from-black/60 to-transparent border-b border-yellow-500/10">
            <div className="min-w-0 flex-1 mr-4">
              <h3 className="font-black text-lg truncate leading-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500">{metrics.title || 'Story Composer'}</h3>
              <p className="text-[10px] text-yellow-500/50 font-black uppercase tracking-[0.2em] mt-1">COMPARTILHE SUA CONQUISTA</p>
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
                <h2 className="font-black text-xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500">{metrics.title || 'Story Composer'}</h2>
                <p className="text-[10px] text-yellow-500/50 font-black uppercase tracking-[0.2em] mt-1">COMPARTILHE SUA CONQUISTA</p>
              </div>
              <button onClick={onClose} className="min-w-[44px] min-h-[44px] rounded-full bg-neutral-800 border border-neutral-700/50 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors" aria-label="Voltar" title="Voltar"><ArrowLeft size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 bg-black sm:bg-transparent">
              <div className="p-4 sm:p-8 flex flex-col lg:flex-row gap-8 h-full max-w-5xl mx-auto items-center lg:items-start">

                {/* Preview Column */}
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
                        <div className="absolute left-0 right-0 top-0 bg-black/25" style={{ height: `${(SAFE_TOP / CANVAS_H) * 100}%` }} />
                        <div className="absolute left-0 right-0 bottom-0 bg-black/25" style={{ height: `${(SAFE_BOTTOM / CANVAS_H) * 100}%` }} />
                        <div className="absolute left-0 right-0 flex items-center justify-center" style={{ top: `${(SAFE_TOP / CANVAS_H) * 100 - 5}%` }}>
                          <span className="text-[9px] font-black uppercase tracking-widest text-yellow-400/60 bg-black/40 px-1.5 py-0.5 rounded-full">SAFE TOP</span>
                        </div>
                        <div className="absolute left-0 right-0 flex items-center justify-center" style={{ bottom: `${(SAFE_BOTTOM / CANVAS_H) * 100 - 5}%` }}>
                          <span className="text-[9px] font-black uppercase tracking-widest text-yellow-400/60 bg-black/40 px-1.5 py-0.5 rounded-full">SAFE BOTTOM</span>
                        </div>
                      </div>
                    )}

                    {layout === 'live' && (
                      <div className="absolute inset-0 pointer-events-none z-20">
                        {livePieces.map((p) => {
                          const pos = livePositions?.[p.key] ?? DEFAULT_LIVE_POSITIONS?.[p.key] ?? { x: 0.1, y: 0.1 }
                          const isDragging = draggingKey === p.key
                          return (
                            <button
                              key={p.key} type="button"
                              className={['absolute pointer-events-auto select-none touch-none px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-transform active:scale-110',
                                isDragging ? 'bg-yellow-500 text-black border-yellow-500 shadow-lg scale-110 z-50' : 'bg-black/60 backdrop-blur text-white border-white/20 hover:border-yellow-500/50',
                              ].join(' ')}
                              style={{ left: `${clamp01(pos.x) * 100}%`, top: `${clamp01(pos.y) * 100}%`, cursor: 'grab' }}
                              onPointerDown={(e) => onPiecePointerDown(p.key, e)}
                              onPointerMove={(e) => onPiecePointerMove(p.key, e, previewRef.current?.getBoundingClientRect() ?? null)}
                              onPointerUp={(e) => onPiecePointerUp(p.key, e)}
                              onPointerCancel={(e) => onPiecePointerUp(p.key, e)}
                            >
                              {p.label}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {layout === 'group' && (
                      <div
                        className={[
                          'absolute inset-0 z-20 touch-none select-none cursor-grab active:cursor-grabbing',
                          'flex items-center justify-center',
                        ].join(' ')}
                        onPointerDown={onGroupPointerDown}
                        onPointerMove={(e) => onGroupPointerMove(e, previewRef.current?.getBoundingClientRect() ?? null)}
                        onPointerUp={onGroupPointerUp}
                        onPointerCancel={onGroupPointerUp}
                      >
                        <span
                          className={[
                            'pointer-events-none px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest shadow-lg transition-all',
                            draggingKey === '__group__'
                              ? 'bg-yellow-500 text-black border-yellow-500 scale-110'
                              : 'bg-black/60 backdrop-blur text-white border-white/30',
                          ].join(' ')}
                        >
                          ARRASTAR GRUPO
                        </span>
                      </div>
                    )}

                    {/* Pinça (2 dedos) = zoom · arrasto (1 dedo) = mover o card. Vale em TODOS os
                        layouts — exceto LIVE/GRUPO, que já usam o arrasto para posicionar as peças
                        (lá o zoom sai pelos botões +/− abaixo, senão este overlay comeria o pointer). */}
                    {layout !== 'live' && layout !== 'group' && (
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
                    )}

                    {/* A guarda `layout !== 'live' && !== 'group'` saiu com os
                        próprios layouts (25/08/2026): a marca é arrastável em
                        todos os quatro que restaram. */}
                    <BrandDragHandle
                      brandOffset={brandOffset}
                      brandScale={brandScale}
                      template={template}
                      previewRef={previewRef}
                      onPointerDown={onBrandPointerDown}
                      onPointerMove={onBrandPointerMove}
                      onPointerUp={onBrandPointerUp}
                    />

                    {/* Alça do HORÁRIO — pedido do dono: independente do layout,
                        igual à marca. */}
                    <TimeDragHandle
                      timeOffset={timeOffset}
                      previewRef={previewRef}
                      onPointerDown={onTimePointerDown}
                      onPointerMove={onTimePointerMove}
                      onPointerUp={onTimePointerUp}
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

                  {/* UMA linha para os seis controles (pedido do dono).
                      Somados como estavam — 48+48+70+120+112 + gaps — davam
                      438px numa faixa de 340: não cabia. Em vez de espremer
                      seis botões ilegíveis, o que sobrou foi agrupado pelo que
                      cada um FAZ:

                      · zoom e reset são a mesma família (manipular o bloco) e
                        viraram um stepper único, sem gaps internos — quatro
                        controles com o custo de largura de um;
                      · trocar mídia e guia são de naturezas diferentes, e ficam
                        do outro lado de um divisor, como ícones de 44pt.

                      O rótulo "GUIA ON/OFF" saiu: o estado já era comunicado
                      pela COR (dourado aceso = ligado), então a palavra repetia
                      o que o olho lê primeiro. `aria-label` mantém o estado
                      para quem usa leitor de tela. */}
                  <div className="w-full max-w-[300px] sm:max-w-[340px] flex items-center gap-2">
                      {/* Stepper: peças coladas dentro de uma casca só. */}
                      <div className="flex h-11 flex-1 items-center overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
                        <button
                          type="button" onClick={() => nudgeWorkoutScale(-0.05)} disabled={busy}
                          aria-label="Diminuir zoom"
                          className="h-full w-10 text-xl font-black text-white transition-colors hover:bg-neutral-800 disabled:opacity-50 active:scale-95"
                        >−</button>
                        <div className="flex h-full min-w-[52px] flex-1 items-center justify-center border-x border-neutral-800 text-xs font-black tabular-nums text-yellow-500">
                          {Math.round(workoutTransform.scale * 100)}%
                        </div>
                        <button
                          type="button" onClick={() => nudgeWorkoutScale(0.05)} disabled={busy}
                          aria-label="Aumentar zoom"
                          className="h-full w-10 text-xl font-black text-white transition-colors hover:bg-neutral-800 disabled:opacity-50 active:scale-95"
                        >+</button>
                        <button
                          type="button" onClick={resetWorkoutTransform} disabled={busy}
                          aria-label="Redefinir zoom e posição"
                          title="Redefinir zoom e posição"
                          className="flex h-full w-10 items-center justify-center border-l border-neutral-800 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white disabled:opacity-50 active:scale-95"
                        >
                          <RotateCcw size={15} />
                        </button>
                      </div>

                      {/* Divisor: separa manipular o BLOCO de trocar a FONTE. */}
                      <span className="h-6 w-px shrink-0 bg-white/10" aria-hidden="true" />

                      <label
                        aria-label={isVideo ? 'Trocar vídeo' : 'Trocar foto'}
                        title={isVideo ? 'Trocar vídeo' : 'Trocar foto'}
                        className={['tap-44 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-yellow-500 transition-all hover:border-neutral-700 hover:bg-neutral-800 active:scale-[0.98]', busy ? 'pointer-events-none opacity-50' : ''].join(' ')}
                      >
                        <Upload size={17} />
                        <input
                          ref={inputRef} type="file" aria-label="Trocar mídia" accept="image/*,video/*" className="sr-only"
                          onChange={(e) => { const f = e.target.files?.[0] || null; if (inputRef.current) inputRef.current.value = ''; loadMedia(f) }}
                        />
                      </label>

                      {/* Manequim: publica o corpo com os músculos da sessão acesos,
                          para quem não quer postar a própria foto. */}
                      <button
                        type="button"
                        onClick={useMannequin}
                        disabled={busy || mannequinBusy || !hasMuscles}
                        aria-label={hasMuscles ? 'Usar manequim com os músculos do treino' : 'Manequim indisponível: nenhuma série reconhecida neste treino'}
                        title={hasMuscles ? 'Usar manequim' : 'Nenhuma série reconhecida neste treino'}
                        className={['tap-44 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-yellow-500 transition-all hover:border-neutral-700 hover:bg-neutral-800 active:scale-[0.98]', (busy || mannequinBusy || !hasMuscles) ? 'pointer-events-none opacity-50' : ''].join(' ')}
                      >
                        <PersonStanding size={17} />
                      </button>

                      {isVideo && (
                        <button type="button" onClick={() => setShowTrimmer(v => !v)}
                          className={`tap-44 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors active:scale-[0.98] ${showTrimmer ? 'border-yellow-500 bg-yellow-500 text-black' : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white'}`}
                          disabled={busy}
                          aria-label="Cortar vídeo"
                        >
                          <Scissors size={17} />
                        </button>
                      )}

                      <button type="button" onClick={() => setShowSafeGuide(v => !v)}
                        aria-pressed={showSafeGuide}
                        aria-label={showSafeGuide ? 'Ocultar guias de área segura' : 'Mostrar guias de área segura'}
                        title={showSafeGuide ? 'Ocultar guias' : 'Mostrar guias'}
                        className={`tap-44 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors active:scale-[0.98] ${showSafeGuide ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-500' : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white'}`}
                        disabled={busy}
                      >
                        <Frame size={17} />
                      </button>
                  </div>
                </div>

                {/* Legenda livre — sai na fonte do template escolhido. */}
                <div className="w-full max-w-[340px] lg:max-w-none">
                  <CustomTextPanel
                    value={customText}
                    onChange={setCustomText}
                    overflowing={customTextOverflowing}
                  />
                </div>

                {/* Controls Column */}
                <StoryControlPanel
                  layout={layout}
                  onSelectLayout={onSelectLayout}
                  templates={templates}
                  templateId={template.id}
                  onSelectTemplate={(id) => setTemplate(getTemplateById(id))}
                  livePositions={livePositions}
                  onResetPositions={() => setLivePositions(DEFAULT_LIVE_POSITIONS)}
                  showTrimmer={showTrimmer}
                  setShowTrimmer={setShowTrimmer}
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
