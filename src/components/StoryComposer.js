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

const storyLayouts = [
  { id: 'bottom-row', label: 'Normal' },
  { id: 'right-stack', label: 'Direita' },
  { id: 'left-stack', label: 'Esquerda' },
  { id: 'top-row', label: 'Topo' },
  { id: 'live', label: 'LIVE' },
]

const defaultLivePositions = {
  brand: { x: 0.083, y: 0.14 },
  title: { x: 0.083, y: 0.245 },
  subtitle: { x: 0.083, y: 0.365 },
  cardVolume: { x: 0.083, y: 0.66 },
  cardTempo: { x: 0.37, y: 0.66 },
  cardKcal: { x: 0.657, y: 0.66 },
}

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0))

const clampPctWithSize = ({ pos, size }) => {
  const px = clamp01(pos?.x)
  const py = clamp01(pos?.y)
  const sw = clamp01(size?.w)
  const sh = clamp01(size?.h)
  return {
    x: Math.max(0, Math.min(1 - sw, px)),
    y: Math.max(0, Math.min(1 - sh, py)),
  }
}

const computeLiveSizes = ({ ctx, metrics }) => {
  try {
    const left = SAFE_SIDE
    const right = CANVAS_W - SAFE_SIDE
    const title = safeString(metrics?.title).toUpperCase()
    const words = title.split(/\s+/).filter(Boolean)
    const lines = []
    let line = ''
    ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
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

    const brandW = (() => {
      ctx.font = 'italic 900 56px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      const ironW = ctx.measureText('IRON').width
      const tracksW = ctx.measureText('TRACKS').width
      return ironW + tracksW
    })()
    const brandH = 56

    const titleW = (() => {
      ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      return Math.max(...lines.map((l) => ctx.measureText(l).width), 0)
    })()
    const titleH = lines.length * 40

    const subtitleW = (() => {
      ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      const dateText = metrics?.date ? `• ${metrics.date}` : ''
      return ctx.measureText(`RELATÓRIO DO TREINO ${dateText}`.trim()).width
    })()
    const subtitleH = 34

    const cardW = Math.floor((right - left - 18 * 2) / 3)
    const cardH = 130

    return {
      brand: { w: brandW / CANVAS_W, h: brandH / CANVAS_H },
      title: { w: titleW / CANVAS_W, h: titleH / CANVAS_H },
      subtitle: { w: subtitleW / CANVAS_W, h: subtitleH / CANVAS_H },
      card: { w: cardW / CANVAS_W, h: cardH / CANVAS_H },
      titleLines: lines,
    }
  } catch {
    return {
      brand: { w: 0.5, h: 0.04 },
      title: { w: 0.7, h: 0.08 },
      subtitle: { w: 0.8, h: 0.04 },
      card: { w: 0.26, h: 0.07 },
      titleLines: [],
    }
  }
}

const drawStory = ({
  ctx,
  canvasW,
  canvasH,
  backgroundImage,
  metrics,
  layout,
  livePositions,
}) => {
  ctx.clearRect(0, 0, canvasW, canvasH)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvasW, canvasH)

  if (backgroundImage) {
    const iw = Number(backgroundImage.naturalWidth) || 0
    const ih = Number(backgroundImage.naturalHeight) || 0
    const { scale: coverScale } = fitCover({ canvasW, canvasH, imageW: iw, imageH: ih })
    const dw = iw * coverScale
    const dh = ih * coverScale
    const cx = (canvasW - dw) / 2
    const cy = (canvasH - dh) / 2
    ctx.drawImage(backgroundImage, cx, cy, dw, dh)
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

  const left = SAFE_SIDE
  const right = canvasW - SAFE_SIDE
  const safeBottomY = canvasH - SAFE_BOTTOM

  const gap = 18
  const cardH = 130

  const layoutId = storyLayouts.some((l) => l.id === layout) ? layout : 'bottom-row'

  if (layoutId === 'live') {
    const safe = livePositions && typeof livePositions === 'object' ? livePositions : defaultLivePositions
    const sizes = computeLiveSizes({ ctx, metrics })

    const brandPos = clampPctWithSize({ pos: safe.brand, size: sizes.brand })
    const titlePos = clampPctWithSize({ pos: safe.title, size: sizes.title })
    const subtitlePos = clampPctWithSize({ pos: safe.subtitle, size: sizes.subtitle })

    const cardVolumePos = clampPctWithSize({ pos: safe.cardVolume, size: sizes.card })
    const cardTempoPos = clampPctWithSize({ pos: safe.cardTempo, size: sizes.card })
    const cardKcalPos = clampPctWithSize({ pos: safe.cardKcal, size: sizes.card })

    const brandX = brandPos.x * CANVAS_W
    const brandY = brandPos.y * CANVAS_H

    ctx.textBaseline = 'top'
    ctx.font = 'italic 900 56px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('IRON', brandX, brandY)
    const ironW = ctx.measureText('IRON').width
    ctx.fillStyle = '#facc15'
    ctx.fillText('TRACKS', brandX + ironW, brandY)

    const titleX = titlePos.x * CANVAS_W
    const titleY = titlePos.y * CANVAS_H
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    ;(sizes.titleLines ?? []).forEach((l, idx) => {
      ctx.fillText(l, titleX, titleY + idx * 40)
    })

    const subtitleX = subtitlePos.x * CANVAS_W
    const subtitleY = subtitlePos.y * CANVAS_H
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    const dateText = metrics?.date ? `• ${metrics.date}` : ''
    ctx.fillText(`RELATÓRIO DO TREINO ${dateText}`.trim(), subtitleX, subtitleY)

    const cards = [
      { label: 'VOLUME', value: `${Math.round(Number(metrics?.volume) || 0).toLocaleString('pt-BR')} kg` },
      { label: 'TEMPO', value: formatDuration(metrics?.totalTime) },
      { label: 'KCAL', value: String(metrics?.kcal || 0) },
    ]

    const cardFill = 'rgba(0,0,0,0.62)'
    const cardStroke = 'rgba(255,255,255,0.18)'

    const drawCard = (box, c) => {
      if (!box || !c) return
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
    }

    const cardW = Math.floor((CANVAS_W - SAFE_SIDE * 2 - gap * 2) / 3)
    const cardsBoxes = [
      { x: cardVolumePos.x * CANVAS_W, y: cardVolumePos.y * CANVAS_H, w: cardW, h: cardH },
      { x: cardTempoPos.x * CANVAS_W, y: cardTempoPos.y * CANVAS_H, w: cardW, h: cardH },
      { x: cardKcalPos.x * CANVAS_W, y: cardKcalPos.y * CANVAS_H, w: cardW, h: cardH },
    ]

    cards.forEach((c, idx) => drawCard(cardsBoxes[idx], c))
    return
  }

  ctx.textBaseline = 'top'

  const brandY = SAFE_TOP + 24
  ctx.font = 'italic 900 56px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
  ctx.fillStyle = '#ffffff'
  ctx.fillText('IRON', left, brandY)
  const ironW = ctx.measureText('IRON').width
  ctx.fillStyle = '#facc15'
  ctx.fillText('TRACKS', left + ironW, brandY)

  const title = safeString(metrics?.title).toUpperCase()
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'

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

  let titleY = 0
  let subtitleY = 0
  let cardsBoxes = []

  if (layoutId === 'top-row') {
    titleY = Math.max(brandY + 92, SAFE_TOP + 130)
    subtitleY = titleY + lines.length * 40 + 12
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
    titleY = Math.max(brandY + 92, subtitleY - 24 - lines.length * 40)
  } else {
    const cardY = safeBottomY - 24 - cardH
    subtitleY = cardY - 56
    titleY = Math.max(brandY + 92, subtitleY - 24 - lines.length * 40)
    const cardW = Math.floor((right - left - gap * 2) / 3)
    cardsBoxes = cards.map((_, idx) => ({
      x: left + idx * (cardW + gap),
      y: cardY,
      w: cardW,
      h: cardH,
    }))
  }

  lines.forEach((l, idx) => {
    ctx.fillText(l, left, titleY + idx * 40)
  })

  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
  const dateText = metrics?.date ? `• ${metrics.date}` : ''
  ctx.fillText(`RELATÓRIO DO TREINO ${dateText}`.trim(), left, subtitleY)

  const cardFill = 'rgba(0,0,0,0.62)'
  const cardStroke = 'rgba(255,255,255,0.18)'

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

}

export default function StoryComposer({ open, session, onClose }) {
  const overlayRef = useRef(null)
  const previewRef = useRef(null)
  const previewCanvasRef = useRef(null)
  const inputRef = useRef(null)
  const scrollAreaRef = useRef(null)

  const [backgroundUrl, setBackgroundUrl] = useState('')
  const [backgroundImage, setBackgroundImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showSafeGuide, setShowSafeGuide] = useState(true)
  const [layout, setLayout] = useState('bottom-row')
  const [livePositions, setLivePositions] = useState(defaultLivePositions)
  const [draggingKey, setDraggingKey] = useState(null)
  const dragRef = useRef({ key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } })

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

  const liveSizes = useMemo(() => {
    try {
      if (typeof window === 'undefined') return computeLiveSizes({ ctx: null, metrics })
      const c = document.createElement('canvas')
      const ctx = c.getContext('2d')
      if (!ctx) return computeLiveSizes({ ctx: null, metrics })
      return computeLiveSizes({ ctx, metrics })
    } catch {
      return computeLiveSizes({ ctx: null, metrics })
    }
  }, [metrics])

  useEffect(() => {
    if (!open) return
    setError('')
    setBusy(false)
    setShowSafeGuide(true)
    setLivePositions(defaultLivePositions)
    setDraggingKey(null)
    dragRef.current = { key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } }
  }, [open])

  useEffect(() => {
    if (!open) return

    const scrollY = window.scrollY
    const originalStyle = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    }

    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.position = originalStyle.position
      document.body.style.top = originalStyle.top
      document.body.style.width = originalStyle.width
      document.body.style.overflow = originalStyle.overflow
      window.scrollTo(0, scrollY)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const prevent = (e) => {
      try {
        e.preventDefault()
      } catch {
      }
    }
    document.addEventListener('gesturestart', prevent, { passive: false })
    document.addEventListener('gesturechange', prevent, { passive: false })
    document.addEventListener('gestureend', prevent, { passive: false })
    return () => {
      document.removeEventListener('gesturestart', prevent)
      document.removeEventListener('gesturechange', prevent)
      document.removeEventListener('gestureend', prevent)
    }
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
    } catch {
      setError('Não foi possível carregar a imagem.')
    }
  }

  const getSizeForKey = (key) => {
    if (key === 'brand') return liveSizes?.brand ?? { w: 0.5, h: 0.05 }
    if (key === 'title') return liveSizes?.title ?? { w: 0.7, h: 0.08 }
    if (key === 'subtitle') return liveSizes?.subtitle ?? { w: 0.8, h: 0.05 }
    return liveSizes?.card ?? { w: 0.26, h: 0.08 }
  }

  const onPiecePointerDown = (key, e) => {
    try {
      if (layout !== 'live') return
      if (!key) return
      if (!e?.currentTarget) return
      if (typeof e?.pointerId !== 'number') return
      e.preventDefault?.()
      e.stopPropagation?.()
      const startPos = livePositions?.[key] ?? defaultLivePositions?.[key] ?? { x: 0.1, y: 0.1 }
      dragRef.current = { key, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startPos }
      setDraggingKey(key)
      e.currentTarget?.setPointerCapture?.(e.pointerId)
    } catch {
    }
  }

  const onPiecePointerMove = (key, e) => {
    try {
      if (layout !== 'live') return
      const activeKey = dragRef.current?.key
      const activePointerId = dragRef.current?.pointerId
      if (!activeKey || activeKey !== key) return
      if (typeof activePointerId !== 'number') return
      if (e?.pointerId !== activePointerId) return
      const preview = previewRef.current
      const rect = preview?.getBoundingClientRect?.()
      if (!rect?.width || !rect?.height) return
      e.preventDefault?.()
      e.stopPropagation?.()
      const dxPct = (Number(e.clientX) - Number(dragRef.current?.startX || 0)) / rect.width
      const dyPct = (Number(e.clientY) - Number(dragRef.current?.startY || 0)) / rect.height
      const startPos = dragRef.current?.startPos ?? { x: 0, y: 0 }
      const nextPos = { x: (Number(startPos.x) || 0) + dxPct, y: (Number(startPos.y) || 0) + dyPct }
      const size = getSizeForKey(key)
      const clamped = clampPctWithSize({ pos: nextPos, size })
      setLivePositions((prev) => ({ ...(prev ?? defaultLivePositions), [key]: clamped }))
    } catch {
    }
  }

  const onPiecePointerUp = (key, e) => {
    try {
      const activeKey = dragRef.current?.key
      const activePointerId = dragRef.current?.pointerId
      if (!activeKey || activeKey !== key) return
      if (typeof activePointerId !== 'number') return
      if (e?.pointerId !== activePointerId) return
      e.preventDefault?.()
      e.stopPropagation?.()
      e.currentTarget?.releasePointerCapture?.(activePointerId)
      dragRef.current = { key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } }
      setDraggingKey(null)
    } catch {
    }
  }

  const livePieces = useMemo(() => {
    return [
      { key: 'brand', label: 'IRONTRACKS' },
      { key: 'title', label: 'TREINO' },
      { key: 'subtitle', label: 'RELATÓRIO' },
      { key: 'cardVolume', label: 'VOLUME' },
      { key: 'cardTempo', label: 'TEMPO' },
      { key: 'cardKcal', label: 'KCAL' },
    ]
  }, [])

  const onSelectLayout = (nextLayout) => {
    try {
      const value = safeString(nextLayout)
      setLayout(value || 'bottom-row')
      setDraggingKey(null)
      dragRef.current = { key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } }
    } catch {
      setLayout('bottom-row')
    }
  }

  const renderToCanvas = async () => {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no_ctx')
    drawStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage, metrics, layout, livePositions })
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
      drawStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage, metrics, layout, livePositions })
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [open, backgroundImage, metrics, layout, livePositions])

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
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[2500] bg-black/80 backdrop-blur-sm"
      onMouseDown={() => {
        if (!busy) onClose?.()
      }}
    >
      <div
        className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center pt-safe"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="w-full sm:max-w-5xl bg-neutral-950 sm:bg-neutral-900 border-t sm:border border-neutral-800 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl max-h-[calc(100vh-24px)] flex flex-col min-h-0">
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-widest text-yellow-500">Foto</div>
              <div className="text-white font-black truncate">{metrics.title || 'Treino'}</div>
              <div className="text-[11px] text-neutral-400 font-semibold truncate">
                Escolha uma foto de fundo
              </div>
            </div>
            <button
              type="button"
              onClick={() => onClose?.()}
              className="w-11 h-11 rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-200 hover:bg-neutral-800 inline-flex items-center justify-center"
              aria-label="Fechar"
              disabled={busy}
            >
              <X size={18} />
            </button>
          </div>

          <div ref={scrollAreaRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="flex flex-col items-center gap-3">
              <div
                ref={previewRef}
                className="relative w-full max-w-[380px] aspect-[9/16] rounded-3xl overflow-hidden border border-neutral-800 bg-black"
              >
                <canvas
                  ref={previewCanvasRef}
                  width={CANVAS_W}
                  height={CANVAS_H}
                  className="absolute inset-0 w-full h-full"
                />

                {showSafeGuide ? (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55" />
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

                {layout === 'live' ? (
                  <div className="absolute inset-0 pointer-events-none">
                    {livePieces.map((p) => {
                      const pos = livePositions?.[p.key] ?? defaultLivePositions?.[p.key] ?? { x: 0.1, y: 0.1 }
                      const isDragging = draggingKey === p.key
                      return (
                        <button
                          key={p.key}
                          type="button"
                          className={[
                            'absolute pointer-events-auto select-none touch-none',
                            'px-2 py-1 rounded-xl border text-[10px] font-black uppercase tracking-widest',
                            isDragging
                              ? 'bg-yellow-500 text-black border-yellow-500'
                              : 'bg-neutral-900/80 text-white border-neutral-700',
                          ].join(' ')}
                          style={{
                            left: `${clamp01(pos.x) * 100}%`,
                            top: `${clamp01(pos.y) * 100}%`,
                          }}
                          onPointerDown={(e) => onPiecePointerDown(p.key, e)}
                          onPointerMove={(e) => onPiecePointerMove(p.key, e)}
                          onPointerUp={(e) => onPiecePointerUp(p.key, e)}
                          onPointerCancel={(e) => onPiecePointerUp(p.key, e)}
                        >
                          {p.label}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              <div className="w-full max-w-[380px] flex items-center gap-2">
                <label
                  htmlFor="irontracks-story-bg"
                  className={[
                    'flex-1 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 text-white font-black uppercase tracking-widest text-xs hover:bg-neutral-800 inline-flex items-center justify-center',
                    busy ? 'opacity-60 pointer-events-none' : '',
                  ].join(' ')}
                >
                  Escolher Foto
                </label>
                <input
                  id="irontracks-story-bg"
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => loadBackground(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => setShowSafeGuide((v) => !v)}
                  className="h-12 px-4 rounded-2xl bg-neutral-900 border border-neutral-800 text-white font-black uppercase tracking-widest text-xs hover:bg-neutral-800"
                  disabled={busy}
                >
                  {showSafeGuide ? 'Guia On' : 'Guia Off'}
                </button>
              </div>

              {error ? (
                <div className="w-full max-w-[380px] rounded-2xl border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Layout</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {storyLayouts.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => onSelectLayout(l.id)}
                      className={[
                        'h-11 rounded-2xl border text-xs font-black uppercase tracking-widest',
                        layout === l.id
                          ? 'bg-yellow-500 text-black border-yellow-500'
                          : 'bg-neutral-900 text-white border-neutral-800 hover:bg-neutral-800',
                      ].join(' ')}
                      disabled={busy}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                {layout === 'live' ? (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-neutral-400 font-semibold">
                      Toque e arraste as tags no preview
                    </div>
                    <button
                      type="button"
                      onClick={() => setLivePositions(defaultLivePositions)}
                      className="h-9 px-3 rounded-2xl bg-neutral-900 border border-neutral-800 text-white font-black uppercase tracking-widest text-[10px] hover:bg-neutral-800"
                      disabled={busy}
                    >
                      Reset LIVE
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={shareImage}
                className="h-12 rounded-2xl bg-yellow-500 text-black font-black uppercase tracking-widest text-xs hover:bg-yellow-400 inline-flex items-center justify-center gap-2 disabled:opacity-60"
                disabled={busy}
              >
                <Share2 size={16} /> Compartilhar (JPG)
              </button>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
