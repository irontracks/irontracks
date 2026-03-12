'use client'

import React, { useRef, useState, useCallback } from 'react'
import NextImage from 'next/image'
import { X, Upload, Scissors } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStoryComposer } from '@/components/stories/useStoryComposer'
import { StoryControlPanel } from '@/components/stories/StoryControlPanel'
import { StoryComposerIosSavePanel } from './StoryComposerIosSavePanel'
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

const STICKERS = [
  { id: 'fire', src: '/sticker-fire.png', label: '🔥 Fogo', alt: 'Sticker fogo' },
  { id: 'lightning', src: '/sticker-lightning.png', label: '⚡ Raio', alt: 'Sticker raio' },
]

export default function StoryComposer({ open, session, onClose, calories }: StoryComposerProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  const {
    inputRef, videoRef,
    selectedFile, mediaKind, backgroundUrl, backgroundImage,
    busy, busyAction, busySubAction, uploadProgress, isExporting,
    error, info, showSafeGuide, setShowSafeGuide,
    layout, livePositions, setLivePositions,
    draggingKey, saveImageUrl, setSaveImageUrl,
    showTrimmer, setShowTrimmer, videoDuration, trimRange, setTrimRange, previewTime, setPreviewTime,
    metrics: rawMetrics,
    loadMedia, onSelectLayout,
    onPiecePointerDown, onPiecePointerMove, onPiecePointerUp,
    shareImage, postToIronTracks,
  } = useStoryComposer({ open, session, onClose })

  // Override kcal with the pre-calculated value from the report if provided
  const metrics = calories != null && Number.isFinite(calories) && calories > 0
    ? { ...rawMetrics, kcal: Math.round(calories) }
    : rawMetrics

  // ── Sticker state ───────────────────────────────────────────────────
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null)
  const [stickerPos, setStickerPos] = useState({ x: 0.5, y: 0.5 })
  const [stickerScale, setStickerScale] = useState(1.0)
  // Refs to avoid stale closures in pointer handlers
  const stickerScaleRef = useRef(1.0)
  const stickerPosRef = useRef({ x: 0.5, y: 0.5 })
  React.useEffect(() => { stickerScaleRef.current = stickerScale }, [stickerScale])
  React.useEffect(() => { stickerPosRef.current = stickerPos }, [stickerPos])

  // Multi-pointer tracking: supports simultaneous drag (1 finger) and pinch (2 fingers)
  const stickerPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  // Delta-based pinch: tracks the distance from the previous frame so that
  // the same physical finger movement always produces the same scale change,
  // regardless of the sticker's current size (unlike ratio-based which gets
  // harder to control when the sticker is small).
  const pinchRef = useRef<{ lastDistance: number; settled: boolean } | null>(null)
  const stickerDragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)

  // How many scale units to add/remove per pixel of finger spread/pinch.
  // 0.007 feels natural: ~140 px of movement → 1.0 scale unit.
  const PINCH_SENSITIVITY = 0.007
  // Smoothing: how fast the rendered scale catches up to the target (0–1).
  // 0.45 = responsive without snapping; lower = smoother but laggier.
  const PINCH_SMOOTH = 0.45
  const targetScaleRef = useRef(1.0)

  const onStickerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    stickerPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = Array.from(stickerPointersRef.current.values())
    if (pts.length >= 2) {
      // Two fingers → pinch mode.
      // We mark settled=false so the FIRST pointermove just establishes the
      // baseline distance without changing scale (prevents the initial jump
      // that happens when the second finger lands at an arbitrary position).
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
      pinchRef.current = { lastDistance: Math.max(dist, 10), settled: false }
      targetScaleRef.current = stickerScaleRef.current
      stickerDragRef.current = null
    } else {
      // One finger → drag mode
      pinchRef.current = null
      stickerDragRef.current = {
        startX: e.clientX, startY: e.clientY,
        startPosX: stickerPosRef.current.x, startPosY: stickerPosRef.current.y,
      }
    }
  }, [])

  const onStickerPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    stickerPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = Array.from(stickerPointersRef.current.values())
    if (pts.length >= 2 && pinchRef.current) {
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
      if (!pinchRef.current.settled) {
        // First move after 2nd finger landed: just set the baseline, don't scale yet
        pinchRef.current.lastDistance = dist
        pinchRef.current.settled = true
        return
      }
      // Delta-based: how many pixels did the spread change this frame?
      const delta = dist - pinchRef.current.lastDistance
      pinchRef.current.lastDistance = dist // update for next frame
      // Add delta × sensitivity to the target scale
      const rawTarget = Math.max(0.3, Math.min(5.0, targetScaleRef.current + delta * PINCH_SENSITIVITY))
      targetScaleRef.current = rawTarget
      // Smooth the rendered scale towards the target
      const smoothed = stickerScaleRef.current + (rawTarget - stickerScaleRef.current) * PINCH_SMOOTH
      stickerScaleRef.current = smoothed // keep ref in sync immediately
      setStickerScale(smoothed)
    } else if (pts.length === 1 && stickerDragRef.current) {
      // Drag: move sticker position
      const rect = previewRef.current?.getBoundingClientRect()
      if (!rect) return
      const dx = (e.clientX - stickerDragRef.current.startX) / rect.width
      const dy = (e.clientY - stickerDragRef.current.startY) / rect.height
      setStickerPos({
        x: Math.max(0.05, Math.min(0.95, stickerDragRef.current.startPosX + dx)),
        y: Math.max(0.05, Math.min(0.95, stickerDragRef.current.startPosY + dy)),
      })
    }
  }, [PINCH_SENSITIVITY, PINCH_SMOOTH])

  const onStickerPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    stickerPointersRef.current.delete(e.pointerId)
    if (stickerPointersRef.current.size < 2) pinchRef.current = null
    if (stickerPointersRef.current.size === 0) stickerDragRef.current = null
  }, [])

  const toggleSticker = (id: string) => {
    if (selectedSticker === id) {
      setSelectedSticker(null)
    } else {
      setSelectedSticker(id)
      setStickerPos({ x: 0.5, y: 0.35 })
      setStickerScale(1.0) // reset size when switching sticker
    }
  }

  // Draw loop
  React.useEffect(() => {
    if (!open) return
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    const draw = () => drawStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage, metrics, layout, livePositions, transparentBg: mediaKind === 'video' })
    if (isExporting) { draw(); return }
    if (layout === 'live' && draggingKey) { raf = requestAnimationFrame(draw) } else { draw() }
    return () => cancelAnimationFrame(raf)
  }, [open, backgroundImage, layout, livePositions, mediaKind, metrics, draggingKey, isExporting])

  const livePieces = React.useMemo(() => [
    { key: 'brand', label: 'IRONTRACKS' },
    { key: 'title', label: 'TREINO' },
    { key: 'subtitle', label: 'RELATÓRIO' },
    { key: 'cardVolume', label: 'VOLUME' },
    { key: 'cardTempo', label: 'TEMPO' },
    { key: 'cardKcal', label: 'KCAL' },
  ], [])

  if (!open) return null

  const isVideo = mediaKind === 'video'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2500] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center sm:p-4 pt-safe pb-safe"
        >
          {/* Mobile Header */}
          <div className="flex-none px-4 pb-4 pt-14 flex justify-between items-start w-full max-w-md mx-auto sm:hidden bg-gradient-to-b from-black/60 to-transparent border-b border-yellow-500/10">
            <div className="min-w-0 flex-1 mr-4">
              <h3 className="font-black text-lg truncate leading-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500">{metrics.title || 'Story Composer'}</h3>
              <p className="text-[10px] text-yellow-500/50 font-black uppercase tracking-[0.2em] mt-1">COMPARTILHE SUA CONQUISTA</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-neutral-800/80 border border-neutral-700/50 text-neutral-400 flex items-center justify-center hover:bg-neutral-700 transition-colors flex-none"><X size={16} /></button>
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
              <button onClick={onClose} className="w-9 h-9 rounded-full bg-neutral-800 border border-neutral-700/50 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"><X size={18} /></button>
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
                        crossOrigin="anonymous"
                        src={backgroundUrl || undefined}
                        className="absolute inset-0 w-full h-full object-cover bg-black"
                        controls={false} playsInline muted autoPlay loop
                      />
                    )}

                    <canvas ref={previewCanvasRef} width={CANVAS_W} height={CANVAS_H} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />

                    {showSafeGuide && (
                      <div className="absolute inset-0 pointer-events-none z-10">
                        <div className="absolute left-0 right-0 h-px bg-yellow-400/40" style={{ top: `${(SAFE_TOP / CANVAS_H) * 100}%` }} />
                        <div className="absolute left-0 right-0 h-px bg-yellow-400/40" style={{ bottom: `${(SAFE_BOTTOM / CANVAS_H) * 100}%` }} />
                        <div className="absolute top-0 bottom-0 w-px bg-yellow-400/20" style={{ left: `${(SAFE_SIDE / CANVAS_W) * 100}%` }} />
                        <div className="absolute top-0 bottom-0 w-px bg-yellow-400/20" style={{ right: `${(SAFE_SIDE / CANVAS_W) * 100}%` }} />
                        <div className="absolute left-0 right-0 top-0 bg-black/25" style={{ height: `${(SAFE_TOP / CANVAS_H) * 100}%` }} />
                        <div className="absolute left-0 right-0 bottom-0 bg-black/25" style={{ height: `${(SAFE_BOTTOM / CANVAS_H) * 100}%` }} />
                        <div className="absolute left-0 right-0 flex items-center justify-center" style={{ top: `${(SAFE_TOP / CANVAS_H) * 100 - 5}%` }}>
                          <span className="text-[7px] font-black uppercase tracking-widest text-yellow-400/60 bg-black/40 px-1.5 py-0.5 rounded-full">SAFE TOP</span>
                        </div>
                        <div className="absolute left-0 right-0 flex items-center justify-center" style={{ bottom: `${(SAFE_BOTTOM / CANVAS_H) * 100 - 5}%` }}>
                          <span className="text-[7px] font-black uppercase tracking-widest text-yellow-400/60 bg-black/40 px-1.5 py-0.5 rounded-full">SAFE BOTTOM</span>
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
                            {selectedSticker && (() => {
                          const stk = STICKERS.find(s => s.id === selectedSticker)
                          if (!stk) return null
                          const BASE_SIZE = 96 // px — base sticker size
                          return (
                            <div
                              onPointerDown={onStickerPointerDown}
                              onPointerMove={onStickerPointerMove}
                              onPointerUp={onStickerPointerUp}
                              onPointerCancel={onStickerPointerUp}
                              className="absolute z-30 select-none touch-none cursor-grab active:cursor-grabbing"
                              style={{
                                left: `${stickerPos.x * 100}%`,
                                top: `${stickerPos.y * 100}%`,
                                width: `${BASE_SIZE}px`,
                                height: `${BASE_SIZE}px`,
                                transform: `translate(-50%, -50%) scale(${stickerScale})`,
                                transformOrigin: 'center center',
                              }}
                            >
                              <img
                                src={stk.src}
                                alt={stk.alt}
                                draggable={false}
                                className="w-full h-full object-contain drop-shadow-2xl pointer-events-none"
                              />
                            </div>
                          )
                        })()}
                  </div>

                  {/* Sticker Picker */}
                  <div className="w-full max-w-[300px] sm:max-w-[340px]">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-2">Stickers</p>
                    <div className="flex items-center gap-2">
                      {STICKERS.map(stk => (
                        <button
                          key={stk.id}
                          type="button"
                          onClick={() => toggleSticker(stk.id)}
                          className={[
                            'relative w-16 h-16 rounded-2xl border-2 transition-all active:scale-95 overflow-hidden flex items-center justify-center',
                            selectedSticker === stk.id
                              ? 'border-yellow-400 bg-yellow-500/15 shadow-lg shadow-yellow-900/30'
                              : 'border-neutral-700/60 bg-neutral-900/60 hover:border-neutral-600'
                          ].join(' ')}
                        >
                          <NextImage src={stk.src} alt={stk.alt} width={52} height={52} unoptimized className="object-contain" />
                          {selectedSticker === stk.id && (
                            <div className="absolute inset-0 rounded-xl ring-2 ring-yellow-400/60 ring-inset" />
                          )}
                        </button>
                      ))}
                      {selectedSticker && (
                        <button
                          type="button"
                          onClick={() => setSelectedSticker(null)}
                          className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-700/60 text-neutral-400 hover:text-red-400 text-xs font-black transition-colors flex items-center justify-center"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Media Controls */}
                  <div className="w-full max-w-[300px] sm:max-w-[340px] flex items-center gap-3">
                    <label className={['flex-1 h-12 rounded-xl bg-neutral-900 border border-neutral-800 text-white font-bold text-[11px] uppercase tracking-wider hover:bg-neutral-800 hover:border-neutral-700 inline-flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]', busy ? 'opacity-50 pointer-events-none' : ''].join(' ')}>
                      <Upload size={16} className="text-yellow-500" />
                      {isVideo ? 'TROCAR' : 'TROCAR FOTO'}
                      <input
                        ref={inputRef} type="file" accept="image/*,video/*" className="sr-only"
                        onChange={(e) => { const f = e.target.files?.[0] || null; if (inputRef.current) inputRef.current.value = ''; loadMedia(f) }}
                      />
                    </label>

                    {isVideo && (
                      <button type="button" onClick={() => setShowTrimmer(v => !v)}
                        className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-colors active:scale-[0.98] ${showTrimmer ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'}`}
                        disabled={busy}
                      >
                        <Scissors size={18} />
                      </button>
                    )}

                    <button type="button" onClick={() => setShowSafeGuide(v => !v)}
                      className={`w-28 h-12 rounded-xl border font-bold text-[10px] uppercase tracking-wider transition-colors active:scale-[0.98] ${showSafeGuide ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'}`}
                      disabled={busy}
                    >
                      GUIA {showSafeGuide ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                {/* Controls Column */}
                <StoryControlPanel
                  layout={layout}
                  onSelectLayout={onSelectLayout}
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

      <StoryComposerIosSavePanel saveImageUrl={saveImageUrl} onClose={() => setSaveImageUrl(null)} />
    </AnimatePresence>
  )
}
