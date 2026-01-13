'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Share2, X } from 'lucide-react'

const CANVAS_W = 1080
const CANVAS_H = 1920
const SAFE_TOP = 250
const SAFE_BOTTOM = 420
const SAFE_SIDE = 90

const safeString = (v) => {
  try {
    return String(v ?? '').trim()
  } catch {
    return ''
  }
}

const formatDatePt = (v) => {
  try {
    if (!v) return ''
    const d = v?.toDate ? v.toDate() : v instanceof Date ? v : new Date(v)
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

const formatDuration = (seconds) => {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0) return '-'
  const mins = Math.floor(s / 60)
  const secs = Math.floor(s % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

const calculateTotalVolume = (logs) => {
  try {
    const safeLogs = logs && typeof logs === 'object' ? logs : {}
    let volume = 0
    Object.values(safeLogs).forEach((log) => {
      if (!log || typeof log !== 'object') return
      const w = Number(safeString(log.weight).replace(',', '.'))
      const r = Number(safeString(log.reps).replace(',', '.'))
      if (!Number.isFinite(w) || !Number.isFinite(r)) return
      if (w <= 0 || r <= 0) return
      volume += w * r
    })
    return volume
  } catch {
    return 0
  }
}

const computeKcal = ({ session, volume }) => {
  try {
    const outdoorBike = session?.outdoorBike && typeof session.outdoorBike === 'object' ? session.outdoorBike : null
    const bikeKcal = Number(outdoorBike?.caloriesKcal)
    if (Number.isFinite(bikeKcal) && bikeKcal > 0) return Math.round(bikeKcal)
    const durationMinutes = (Number(session?.totalTime) || 0) / 60
    return Math.round(volume * 0.02 + durationMinutes * 4)
  } catch {
    return 0
  }
}

const drawRoundedRect = (ctx, x, y, w, h, r) => {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

const fitCover = ({ canvasW, canvasH, imageW, imageH }) => {
  const iw = Number(imageW) || 0
  const ih = Number(imageH) || 0
  if (iw <= 0 || ih <= 0) return { scale: 1, dw: 0, dh: 0 }
  const coverScale = Math.max(canvasW / iw, canvasH / ih)
  const dw = iw * coverScale
  const dh = ih * coverScale
  return { scale: coverScale, dw, dh }
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

const storyPresets = [
  { id: 'clean', label: 'Clean', filter: 'contrast(1.08) saturate(1.12) brightness(1.04)' },
  { id: 'pop', label: 'Pop', filter: 'contrast(1.18) saturate(1.28) brightness(1.06)' },
  { id: 'strava', label: 'Strava', filter: 'contrast(1.22) saturate(1.22) brightness(1.02)' },
  { id: 'mono', label: 'Mono', filter: 'grayscale(1) contrast(1.14) brightness(1.04)' },
  { id: 'warm', label: 'Warm', filter: 'contrast(1.12) saturate(1.16) brightness(1.04) sepia(0.18)' },
]

const storyLayouts = [
  { id: 'bottom-row', label: 'Normal' },
  { id: 'right-stack', label: 'Direita' },
  { id: 'left-stack', label: 'Esquerda' },
  { id: 'top-row', label: 'Topo' },
]

const drawVignette = ({ ctx, canvasW, canvasH, strength }) => {
  const s = clamp(Number(strength) || 0, 0, 1)
  if (s <= 0) return
  const g = ctx.createRadialGradient(canvasW / 2, canvasH * 0.45, canvasH * 0.25, canvasW / 2, canvasH * 0.45, canvasH * 0.8)
  g.addColorStop(0, `rgba(0,0,0,0)`)
  g.addColorStop(1, `rgba(0,0,0,${0.75 * s})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, canvasW, canvasH)
}

const drawGrain = ({ ctx, canvasW, canvasH, strength }) => {
  const s = clamp(Number(strength) || 0, 0, 1)
  if (s <= 0) return
  const dots = Math.floor(24000 * s)
  ctx.save()
  ctx.globalAlpha = 0.06 * s
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < dots; i++) {
    const x = Math.random() * canvasW
    const y = Math.random() * canvasH
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.fillStyle = '#000000'
  for (let i = 0; i < Math.floor(dots * 0.7); i++) {
    const x = Math.random() * canvasW
    const y = Math.random() * canvasH
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.restore()
}

const drawStory = ({
  ctx,
  canvasW,
  canvasH,
  backgroundImage,
  zoom,
  offset,
  metrics,
  layout,
  preset,
  vignette,
  grain,
}) => {
  ctx.clearRect(0, 0, canvasW, canvasH)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvasW, canvasH)

  const presetDef = storyPresets.find((p) => p.id === preset) || storyPresets[0]
  const bgFilter = presetDef?.filter || 'none'

  if (backgroundImage) {
    const iw = Number(backgroundImage.naturalWidth) || 0
    const ih = Number(backgroundImage.naturalHeight) || 0
    const { scale: coverScale } = fitCover({ canvasW, canvasH, imageW: iw, imageH: ih })
    const finalScale = coverScale * (Number(zoom) || 1)
    const dw = iw * finalScale
    const dh = ih * finalScale
    const cx = (canvasW - dw) / 2 + (Number(offset?.x) || 0)
    const cy = (canvasH - dh) / 2 + (Number(offset?.y) || 0)
    ctx.save()
    ctx.filter = bgFilter
    ctx.drawImage(backgroundImage, cx, cy, dw, dh)
    ctx.restore()
  } else {
    const g = ctx.createLinearGradient(0, 0, canvasW, canvasH)
    g.addColorStop(0, '#0a0a0a')
    g.addColorStop(1, '#111827')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, canvasW, canvasH)
  }

  const baseOverlay = ctx.createLinearGradient(0, canvasH * 0.35, 0, canvasH)
  baseOverlay.addColorStop(0, 'rgba(0,0,0,0)')
  baseOverlay.addColorStop(1, 'rgba(0,0,0,0.78)')
  ctx.fillStyle = baseOverlay
  ctx.fillRect(0, 0, canvasW, canvasH)

  if (preset === 'strava') {
    const topOverlay = ctx.createLinearGradient(0, 0, 0, canvasH * 0.45)
    topOverlay.addColorStop(0, 'rgba(0,0,0,0.55)')
    topOverlay.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = topOverlay
    ctx.fillRect(0, 0, canvasW, canvasH)
  }

  drawVignette({ ctx, canvasW, canvasH, strength: vignette })

  const left = SAFE_SIDE
  const right = canvasW - SAFE_SIDE
  const safeBottomY = canvasH - SAFE_BOTTOM

  ctx.textBaseline = 'top'

  const brandY = SAFE_TOP + 24
  ctx.fillStyle = '#facc15'
  ctx.font = '900 56px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
  ctx.fillText('IRONTRACKS', left, brandY)

  const title = safeString(metrics?.title).toUpperCase()
  ctx.fillStyle = '#ffffff'
  ctx.font = '900 74px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'

  const lines = []
  const words = title.split(/\s+/).filter(Boolean)
  let line = ''
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w
    if (ctx.measureText(candidate).width <= right - left) line = candidate
    else {
      if (line) lines.push(line)
      line = w
    }
    if (lines.length >= 2) break
  }
  if (line && lines.length < 2) lines.push(line)

  const cards = [
    { label: 'VOLUME', value: `${Math.round(Number(metrics?.volume) || 0).toLocaleString('pt-BR')} kg` },
    { label: 'TEMPO', value: formatDuration(metrics?.totalTime) },
    { label: 'KCAL', value: String(metrics?.kcal || 0) },
  ]

  const gap = 18
  const cardH = 130

  const layoutId = storyLayouts.some((l) => l.id === layout) ? layout : 'bottom-row'

  let titleY = 0
  let subtitleY = 0
  let cardsBoxes = []

  if (layoutId === 'top-row') {
    titleY = Math.max(brandY + 92, SAFE_TOP + 130)
    subtitleY = titleY + lines.length * 86 + 12
    const cardY = subtitleY + 56
    const cardW = Math.floor((right - left - gap * 2) / 3)
    cardsBoxes = cards.map((_, idx) => ({
      x: left + idx * (cardW + gap),
      y: cardY,
      w: cardW,
      h: cardH,
    }))
  } else if (layoutId === 'right-stack' || layoutId === 'left-stack') {
    const stackW = 360
    const x = layoutId === 'right-stack' ? right - stackW : left
    const totalH = cardH * 3 + gap * 2
    const cardY0 = safeBottomY - 24 - totalH
    cardsBoxes = cards.map((_, idx) => ({
      x,
      y: cardY0 + idx * (cardH + gap),
      w: stackW,
      h: cardH,
    }))
    subtitleY = cardsBoxes[0].y - 56
    titleY = Math.max(brandY + 92, subtitleY - 24 - lines.length * 86)
  } else {
    const cardY = safeBottomY - 24 - cardH
    subtitleY = cardY - 56
    titleY = Math.max(brandY + 92, subtitleY - 24 - lines.length * 86)
    const cardW = Math.floor((right - left - gap * 2) / 3)
    cardsBoxes = cards.map((_, idx) => ({
      x: left + idx * (cardW + gap),
      y: cardY,
      w: cardW,
      h: cardH,
    }))
  }

  lines.forEach((l, idx) => {
    ctx.fillText(l, left, titleY + idx * 86)
  })

  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
  const dateText = metrics?.date ? `• ${metrics.date}` : ''
  ctx.fillText(`RELATÓRIO DO TREINO ${dateText}`.trim(), left, subtitleY)

  const cardFill = preset === 'strava' ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.55)'
  const cardStroke = preset === 'strava' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.12)'

  cards.forEach((c, idx) => {
    const box = cardsBoxes[idx]
    if (!box) return
    const x = box.x
    const y = box.y
    const w = box.w
    const h = box.h
    ctx.save()
    drawRoundedRect(ctx, x, y, w, h, 26)
    ctx.fillStyle = cardFill
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = cardStroke
    ctx.stroke()
    ctx.restore()

    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.font = '900 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    ctx.fillText(c.label, x + 22, y + 18)

    ctx.fillStyle = '#ffffff'
    ctx.font = '900 42px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    ctx.fillText(c.value, x + 22, y + 54)
  })

  drawGrain({ ctx, canvasW, canvasH, strength: grain })
}

export default function StoryComposer({ open, session, onClose }) {
  const previewRef = useRef(null)
  const previewCanvasRef = useRef(null)
  const inputRef = useRef(null)

  const [backgroundUrl, setBackgroundUrl] = useState('')
  const [backgroundImage, setBackgroundImage] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showSafeGuide, setShowSafeGuide] = useState(true)
  const [layout, setLayout] = useState('bottom-row')
  const [preset, setPreset] = useState('clean')
  const [vignette, setVignette] = useState(0.35)
  const [grain, setGrainState] = useState(0.18)

  const metrics = useMemo(() => {
    const title = safeString(session?.workoutTitle || session?.name || 'Treino')
    const date = formatDatePt(session?.date || session?.completed_at || session?.completedAt || session?.created_at)
    const logs = session?.logs && typeof session.logs === 'object' ? session.logs : {}
    const volume = calculateTotalVolume(logs)
    const totalTime = Number(session?.totalTime) || 0
    const kcal = computeKcal({ session, volume })
    return {
      title,
      date,
      volume,
      totalTime,
      kcal,
    }
  }, [session])

  useEffect(() => {
    if (!open) return
    setError('')
    setBusy(false)
    setDragging(false)
    setShowSafeGuide(true)
  }, [open])

  useEffect(() => {
    return () => {
      try {
        if (backgroundUrl) URL.revokeObjectURL(backgroundUrl)
      } catch {
      }
    }
  }, [backgroundUrl])

  const loadBackground = async (file) => {
    try {
      setError('')
      if (!file) return
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      try {
        if (backgroundUrl) URL.revokeObjectURL(backgroundUrl)
      } catch {
      }
      setBackgroundUrl(url)
      setBackgroundImage(img)
      setOffset({ x: 0, y: 0 })
      setZoom(1)
    } catch {
      setError('Não foi possível carregar a imagem.')
    }
  }

  const onPointerDown = (e) => {
    try {
      if (!backgroundImage) return
      setDragging(true)
      setDragStart({ x: e.clientX, y: e.clientY })
      e.currentTarget?.setPointerCapture?.(e.pointerId)
    } catch {
    }
  }

  const onPointerMove = (e) => {
    try {
      if (!dragging) return
      const preview = previewRef.current
      if (!preview) return
      const rect = preview.getBoundingClientRect()
      if (!rect.width || !rect.height) return

      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y

      const scaleX = CANVAS_W / rect.width
      const scaleY = CANVAS_H / rect.height

      setOffset((prev) => ({ x: (prev?.x || 0) + dx * scaleX, y: (prev?.y || 0) + dy * scaleY }))
      setDragStart({ x: e.clientX, y: e.clientY })
    } catch {
    }
  }

  const onPointerUp = (e) => {
    try {
      setDragging(false)
      e.currentTarget?.releasePointerCapture?.(e.pointerId)
    } catch {
      setDragging(false)
    }
  }

  const renderToCanvas = async () => {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no_ctx')
    drawStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage, zoom, offset, metrics, layout, preset, vignette, grain })
    return canvas
  }

  useEffect(() => {
    if (!open) return
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    const draw = () => {
      drawStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage, zoom, offset, metrics, layout, preset, vignette, grain })
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [open, backgroundImage, zoom, offset.x, offset.y, metrics, layout, preset, vignette, grain])

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url)
      } catch {
      }
    }, 1000)
  }

  const createImageBlob = async ({ type }) => {
    const canvas = await renderToCanvas()
    const mime = 'image/jpeg'
    const quality = 0.98
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no_blob'))), mime, quality)
    })
    const base = safeString(metrics.title).replace(/[^\w\d-_]+/g, '-').slice(0, 48) || 'treino'
    const filename = `irontracks-story-${base}.jpg`
    return { blob, filename, mime }
  }

  const shareImage = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await createImageBlob({ type: 'jpg' })
      const file = new File([result.blob], result.filename, { type: result.mime })
      const canShareFile = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }))
      if (canShareFile) await navigator.share({ files: [file], title: 'Story IronTracks' })
      else downloadBlob(result.blob, result.filename)
    } catch {
      setError('Não foi possível compartilhar.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 pt-safe pb-safe">
      <div className="w-full max-w-5xl bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-widest text-yellow-500">Foto</div>
            <div className="text-white font-black truncate">{metrics.title || 'Treino'}</div>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
            aria-label="Fechar"
            disabled={busy}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex flex-col items-center gap-3">
            <div
              ref={previewRef}
              className="relative w-full max-w-[360px] aspect-[9/16] rounded-3xl overflow-hidden border border-neutral-800 bg-black touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <canvas
                ref={previewCanvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                className="absolute inset-0 w-full h-full"
              />

              {showSafeGuide ? (
                <>
                  <div className="absolute inset-x-0 top-0 bg-black/45" style={{ height: `${(SAFE_TOP / CANVAS_H) * 100}%` }} />
                  <div className="absolute inset-x-0 bottom-0 bg-black/45" style={{ height: `${(SAFE_BOTTOM / CANVAS_H) * 100}%` }} />
                  <div
                    className="absolute border border-yellow-500/60 rounded-2xl pointer-events-none"
                    style={{
                      left: `${(SAFE_SIDE / CANVAS_W) * 100}%`,
                      right: `${(SAFE_SIDE / CANVAS_W) * 100}%`,
                      top: `${(SAFE_TOP / CANVAS_H) * 100}%`,
                      bottom: `${(SAFE_BOTTOM / CANVAS_H) * 100}%`,
                    }}
                  />
                </>
              ) : null}
            </div>

            <div className="w-full max-w-[360px] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex-1 h-10 rounded-2xl bg-neutral-950 border border-neutral-800 text-white font-black uppercase tracking-widest text-xs hover:bg-neutral-800"
                disabled={busy}
              >
                Escolher Foto
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => loadBackground(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Ajustes</div>
              <div className="mt-3">
                <div className="text-xs text-neutral-300 font-bold">Layout</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {storyLayouts.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLayout(l.id)}
                      className={[
                        'h-10 rounded-2xl border text-xs font-black uppercase tracking-widest',
                        layout === l.id
                          ? 'bg-yellow-500 text-black border-yellow-500'
                          : 'bg-neutral-950 text-white border-neutral-800 hover:bg-neutral-800',
                      ].join(' ')}
                      disabled={busy}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 text-xs text-neutral-300 font-bold">Efeito</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {storyPresets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPreset(p.id)}
                      className={[
                        'h-10 rounded-2xl border text-xs font-black uppercase tracking-widest',
                        preset === p.id
                          ? 'bg-yellow-500 text-black border-yellow-500'
                          : 'bg-neutral-950 text-white border-neutral-800 hover:bg-neutral-800',
                      ].join(' ')}
                      disabled={busy}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs text-neutral-300 font-bold">
                  <span>Zoom</span>
                  <span className="font-mono">{Number(zoom).toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={1.8}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full mt-2"
                  disabled={busy}
                />
                <div className="mt-2 text-xs text-neutral-500">
                  Arraste a imagem para reposicionar.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Finalização</div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-neutral-300 font-bold">
                  <span>Vignette</span>
                  <span className="font-mono">{Math.round(Number(vignette) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.8}
                  step={0.01}
                  value={vignette}
                  onChange={(e) => setVignette(Number(e.target.value))}
                  className="w-full mt-2"
                  disabled={busy}
                />

                <div className="mt-4 flex items-center justify-between text-xs text-neutral-300 font-bold">
                  <span>Grain</span>
                  <span className="font-mono">{Math.round(Number(grain) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.6}
                  step={0.01}
                  value={grain}
                  onChange={(e) => setGrainState(Number(e.target.value))}
                  className="w-full mt-2"
                  disabled={busy}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSafeGuide((v) => !v)}
              className="h-11 rounded-2xl bg-neutral-950 border border-neutral-800 text-white font-black uppercase tracking-widest text-xs hover:bg-neutral-800"
              disabled={busy}
            >
              {showSafeGuide ? 'Ocultar Safe Area' : 'Mostrar Safe Area'}
            </button>

            {error ? (
              <div className="rounded-2xl border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={shareImage}
              className="h-12 rounded-2xl bg-yellow-500 text-black font-black uppercase tracking-widest text-xs hover:bg-yellow-400 inline-flex items-center justify-center gap-2"
              disabled={busy}
            >
              <Share2 size={16} /> Compartilhar (JPG)
            </button>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
              <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Dica</div>
              <div className="mt-2">
                Para melhor resultado, use uma foto vertical e recorte com zoom.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
