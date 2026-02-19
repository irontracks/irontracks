'use client'

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Share2, X, Upload, Layout, Move, Info, AlertCircle, CheckCircle2, RotateCcw, Scissors, Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { getKcalEstimate } from '@/utils/calories/kcalClient'
import { motion, AnimatePresence } from 'framer-motion'
import VideoTrimmer from '@/components/stories/VideoTrimmer'
import { VideoCompositor } from '@/lib/video/VideoCompositor'

// --- Types ---


// --- Types ---

interface StoryComposerProps {
  open: boolean
  session: SessionLite
  onClose: () => void
}

interface SessionLite {
  id?: string
  name?: string
  date?: string
  exercises?: unknown[]
  logs?: Record<string, unknown>
  elapsedSeconds?: number
  [key: string]: unknown
}

interface Metrics {
  title: string
  date: string
  volume: number
  totalTime: number
  kcal: number
  teamCount: number
}

interface LivePosition {
  x: number
  y: number
}

interface LivePositions {
  [key: string]: LivePosition
}

interface LayoutOption {
  id: string
  label: string
}

// --- Constants ---

const CANVAS_W = 1080
const CANVAS_H = 1920
const SAFE_TOP = 250
const SAFE_BOTTOM = 420
const SAFE_SIDE = 90

const STORY_LAYOUTS: LayoutOption[] = [
  { id: 'bottom-row', label: 'Normal' },
  { id: 'right-stack', label: 'Direita' },
  { id: 'left-stack', label: 'Esquerda' },
  { id: 'top-row', label: 'Topo' },
  { id: 'live', label: 'LIVE' },
]

const DEFAULT_LIVE_POSITIONS: LivePositions = {
  brand: { x: 0.083, y: 0.14 },
  title: { x: 0.083, y: 0.245 },
  subtitle: { x: 0.083, y: 0.365 },
  cardVolume: { x: 0.083, y: 0.66 },
  cardTempo: { x: 0.37, y: 0.66 },
  cardKcal: { x: 0.657, y: 0.66 },
}

// --- Helpers ---

const safeString = (v: unknown): string => {
  try {
    return String(v ?? '').trim()
  } catch {
    return ''
  }
}

const isIOSUserAgent = (ua: string): boolean => {
  const s = String(ua || '')
  if (/(iPad|iPhone|iPod)/i.test(s)) return true
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null
    if (nav && nav.platform === 'MacIntel' && Number(nav.maxTouchPoints || 0) > 1) return true
  } catch {
  }
  return false
}

const pickFirstSupportedMime = (candidates: string[]): string => {
  try {
    return (Array.isArray(candidates) ? candidates : []).find((t) => {
      try {
        return !!(t && typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t))
      } catch {
        return false
      }
    }) || ''
  } catch {
    return ''
  }
}

const parseExt = (rawName: string): string => {
  const n = safeString(rawName).toLowerCase()
  const i = n.lastIndexOf('.')
  if (i < 0) return ''
  const ext = n.slice(i)
  return ['.jpeg', '.jpg', '.png', '.mp4', '.mov', '.webm'].includes(ext) ? ext : ''
}

const extFromMime = (mime: string): string => {
  const t = safeString(mime).toLowerCase()
  if (t === 'image/png') return '.png'
  if (t === 'image/jpeg') return '.jpg'
  if (t === 'video/mp4') return '.mp4'
  if (t === 'video/quicktime') return '.mov'
  if (t === 'video/webm') return '.webm'
  return ''
}

const guessMediaKind = (mime: string, ext: string): 'video' | 'image' | 'unknown' => {
  const t = safeString(mime).toLowerCase()
  if (t.startsWith('video/')) return 'video'
  if (t.startsWith('image/')) return 'image'
  const e = safeString(ext).toLowerCase()
  if (['.mp4', '.mov', '.webm'].includes(e)) return 'video'
  if (['.jpg', '.jpeg', '.png'].includes(e)) return 'image'
  return 'unknown'
}

const formatDatePt = (v: unknown): string => {
  try {
    if (!v) return ''
    const vObj = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
    const raw = vObj?.toDate && typeof vObj.toDate === 'function' ? (vObj.toDate as () => unknown)() : v
    const d = raw instanceof Date ? raw : new Date(raw as string | number | Date)
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

const formatDuration = (totalSeconds: unknown): string => {
  const sec = Number(totalSeconds) || 0
  if (sec <= 0) return '0min'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

const calculateTotalVolume = (logs: Record<string, unknown>): number => {
  try {
    let total = 0
    Object.values(logs).forEach((log: unknown) => {
      const l = log && typeof log === 'object' ? (log as Record<string, unknown>) : {}
      const w = Number(String(l?.weight ?? '').replace(',', '.'))
      const r = Number(String(l?.reps ?? '').replace(',', '.'))
      if (Number.isFinite(w) && w > 0 && Number.isFinite(r) && r > 0) {
        total += w * r
      }
    })
    return total
  } catch {
    return 0
  }
}

const computeKcal = ({ session, volume }: { session: SessionLite; volume: number }): number => {
  try {
    const existing = Number(session?.calories) || Number(session?.kcal)
    if (Number.isFinite(existing) && existing > 0) return Math.round(existing)

    const durationMin = (Number(session?.totalTime) || 0) / 60
    if (durationMin <= 0) return 0

    // Simple heuristic fallback
    // Volume factor: 0.05 kcal per kg moved (very rough estimate)
    // Time factor: 4 kcal per minute (moderate intensity)
    let k = durationMin * 4
    if (volume > 0) {
      k += volume * 0.01
    }
    return Math.round(k)
  } catch {
    return 0
  }
}

const fitCover = ({ canvasW, canvasH, imageW, imageH }: { canvasW: number; canvasH: number; imageW: number; imageH: number }) => {
  const iw = Number(imageW) || 0
  const ih = Number(imageH) || 0
  if (iw <= 0 || ih <= 0) return { scale: 1, dw: 0, dh: 0 }
  const coverScale = Math.max(canvasW / iw, canvasH / ih)
  const dw = iw * coverScale
  const dh = ih * coverScale
  return { scale: coverScale, dw, dh }
}

const clamp01 = (n: unknown): number => Math.max(0, Math.min(1, Number(n) || 0))

const clampPctWithSize = ({ pos, size }: { pos: LivePosition; size: { w: number; h: number } }) => {
  const px = clamp01(pos?.x)
  const py = clamp01(pos?.y)
  const sw = clamp01(size?.w)
  const sh = clamp01(size?.h)
  return {
    x: Math.max(0, Math.min(1 - sw, px)),
    y: Math.max(0, Math.min(1 - sh, py)),
  }
}

const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  if (w < 2 * r) r = w / 2
  if (h < 2 * r) r = h / 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// --- Canvas Logic ---

const computeLiveSizes = ({ ctx, metrics }: { ctx: CanvasRenderingContext2D | null; metrics: Metrics }) => {
  try {
    // Default sizes if no context
    if (!ctx) {
      return {
        brand: { w: 0.5, h: 0.04 },
        title: { w: 0.7, h: 0.08 },
        subtitle: { w: 0.8, h: 0.04 },
        card: { w: 0.26, h: 0.07 },
        titleLines: [],
      }
    }

    const left = SAFE_SIDE
    const right = CANVAS_W - SAFE_SIDE
    const title = safeString(metrics?.title).toUpperCase()
    const words = title.split(/\s+/).filter(Boolean)
    const lines: string[] = []
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
  transparentBg = false,
  skipClear = false,
}: {
  ctx: CanvasRenderingContext2D
  canvasW: number
  canvasH: number
  backgroundImage: HTMLImageElement | null
  metrics: Metrics
  layout: string
  livePositions: LivePositions
  transparentBg?: boolean
  skipClear?: boolean
}) => {
  if (!skipClear) ctx.clearRect(0, 0, canvasW, canvasH)
  
  // Background
  if (!transparentBg) {
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
  }

  // Gradient Overlay (Always draw for readability, or maybe lighter if transparentBg?)
  // If video, we definitely want the gradient to make text pop.
  const baseOverlay = ctx.createLinearGradient(0, canvasH * 0.35, 0, canvasH)
  baseOverlay.addColorStop(0, 'rgba(0,0,0,0)')
  baseOverlay.addColorStop(1, 'rgba(0,0,0,0.78)')
  ctx.fillStyle = baseOverlay
  ctx.fillRect(0, 0, canvasW, canvasH)

  const left = SAFE_SIDE
  const right = canvasW - SAFE_SIDE
  const safeBottomY = canvasH - SAFE_BOTTOM

  // Team Badge
  const teamCount = Number(metrics?.teamCount) || 0
  if (teamCount >= 2) {
    const label = `EQUIPE • ${teamCount}`
    ctx.save()
    ctx.textBaseline = 'top'
    ctx.font = '900 24px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    const padX = 18
    const padY = 12
    const textW = ctx.measureText(label).width
    const w = Math.ceil(textW + padX * 2)
    const h = 46
    const x = Math.max(left, right - w)
    const y = SAFE_TOP
    drawRoundedRect(ctx, x, y, w, h, 18)
    ctx.fillStyle = 'rgba(250,204,21,0.16)'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(250,204,21,0.28)'
    ctx.stroke()
    ctx.fillStyle = '#facc15'
    ctx.fillText(label, x + padX, y + padY)
    ctx.restore()
  }

  const gap = 18
  const cardH = 130
  
  // Helper to draw card
  const drawCard = (box: { x: number; y: number; w: number; h: number }, card: { label: string; value: string }) => {
    drawRoundedRect(ctx, box.x, box.y, box.w, box.h, 24)
    ctx.fillStyle = 'rgba(0,0,0,0.62)'
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.stroke()

    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = '800 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    ctx.textBaseline = 'top'
    const labelW = ctx.measureText(card.label).width
    const labelX = box.x + (box.w - labelW) / 2
    ctx.fillText(card.label, labelX, box.y + 24)

    ctx.fillStyle = '#ffffff'
    // Dynamic font size for value to fit
    let valFont = 48
    ctx.font = `800 ${valFont}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`
    let valW = ctx.measureText(card.value).width
    while (valW > box.w - 20 && valFont > 24) {
      valFont -= 2
      ctx.font = `800 ${valFont}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`
      valW = ctx.measureText(card.value).width
    }
    const valX = box.x + (box.w - valW) / 2
    ctx.fillText(card.value, valX, box.y + 64)
  }

  const layoutId = STORY_LAYOUTS.some((l) => l.id === layout) ? layout : 'bottom-row'

  if (layoutId === 'live') {
    const safe = livePositions && typeof livePositions === 'object' ? livePositions : DEFAULT_LIVE_POSITIONS
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

    const cardW = Math.floor((CANVAS_W - SAFE_SIDE * 2 - gap * 2) / 3)
    const cardsBoxes = [
      { x: cardVolumePos.x * CANVAS_W, y: cardVolumePos.y * CANVAS_H, w: cardW, h: cardH },
      { x: cardTempoPos.x * CANVAS_W, y: cardTempoPos.y * CANVAS_H, w: cardW, h: cardH },
      { x: cardKcalPos.x * CANVAS_W, y: cardKcalPos.y * CANVAS_H, w: cardW, h: cardH },
    ]

    cards.forEach((c, idx) => drawCard(cardsBoxes[idx], c))
    return
  }

  // Standard Layouts
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

  const lines: string[] = []
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
  let cardsBoxes: { x: number; y: number; w: number; h: number }[] = []

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
    // bottom-row
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

  cards.forEach((c, idx) => drawCard(cardsBoxes[idx], c))
}

// --- Component ---

export default function StoryComposer({ open, session, onClose }: StoryComposerProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [mediaKind, setMediaKind] = useState<'image' | 'video'>('image')
  const [backgroundUrl, setBackgroundUrl] = useState('')
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyAction, setBusyAction] = useState<'post' | 'share' | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [showSafeGuide, setShowSafeGuide] = useState(true)
  const [layout, setLayout] = useState('bottom-row')
  const [livePositions, setLivePositions] = useState<LivePositions>(DEFAULT_LIVE_POSITIONS)
  const [kcalEstimate, setKcalEstimate] = useState(0)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const dragRef = useRef({ key: null as string | null, pointerId: null as number | null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } })
  const [mediaLoadIdRef] = useState({ current: 0 })
  const backgroundUrlRef = useRef('')
  
  // Trimming State
  const [showTrimmer, setShowTrimmer] = useState(false)
  const [videoDuration, setVideoDuration] = useState(0)
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 60])
  const [previewTime, setPreviewTime] = useState(0)

  useEffect(() => {
    backgroundUrlRef.current = backgroundUrl
  }, [backgroundUrl])

  // Compute Metrics
  const metrics: Metrics = useMemo(() => {
    const title = safeString(session?.workoutTitle || session?.name || 'Treino')
    const date = formatDatePt(session?.date || session?.completed_at || session?.completedAt || session?.created_at)
    const logs = session?.logs && typeof session.logs === 'object' ? (session.logs as Record<string, unknown>) : {}
    const volume = calculateTotalVolume(logs)
    const totalTime = Number(session?.totalTime) || 0
    const kcal = Number.isFinite(Number(kcalEstimate)) && Number(kcalEstimate) > 0 ? Number(kcalEstimate) : computeKcal({ session, volume })
    const teamObj = session?.team && typeof session.team === 'object' ? (session.team as Record<string, unknown>) : null
    const teamCountRaw = teamObj?.participantsCount ?? session?.teamParticipantsCount ?? session?.teamSessionParticipantsCount
    const teamCount = Number(teamCountRaw)
    return {
      title,
      date,
      volume,
      totalTime,
      kcal,
      teamCount: Number.isFinite(teamCount) ? teamCount : 0,
    }
  }, [session, kcalEstimate])

  // Fetch Kcal if needed
  useEffect(() => {
    if (!open) return
    if (!session) return
    let cancelled = false
    ;(async () => {
      try {
        const kcal = await getKcalEstimate({ session, workoutId: session?.id ?? null })
        if (cancelled) return
        if (Number.isFinite(Number(kcal)) && Number(kcal) > 0) setKcalEstimate(Math.round(Number(kcal)))
      } catch {
        // silent fail
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, session])

  // Pre-calculate sizes for LIVE layout interaction
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

  // Compositor Ref
  const compositorRef = useRef<VideoCompositor | null>(null)

  // Reset state on open/close
  useEffect(() => {
    if (!open) {
      if (compositorRef.current) {
        compositorRef.current.cancel()
        compositorRef.current = null
      }
      try {
        const url = String(backgroundUrlRef.current || '')
        if (url) URL.revokeObjectURL(url)
      } catch {}
      setBackgroundUrl('')
      setBackgroundImage(null)
      setSelectedFile(null)
      setMediaKind('image')
      setError('')
      setInfo('')
      setBusy(false)
      setBusyAction(null)
      setShowSafeGuide(true)
      setLivePositions(DEFAULT_LIVE_POSITIONS)
      setDraggingKey(null)
      dragRef.current = { key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } }
      try {
        if (inputRef?.current) inputRef.current.value = ''
      } catch {}
      return
    }
    setError('')
    setInfo('')
    setBusy(false)
    setBusyAction(null)
    setShowSafeGuide(true)
    setLivePositions(DEFAULT_LIVE_POSITIONS)
    setDraggingKey(null)
    dragRef.current = { key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } }
    setSelectedFile(null)
    setMediaKind('image')
    setBackgroundUrl('')
    setBackgroundImage(null)
    setShowTrimmer(false)
    setVideoDuration(0)
    setTrimRange([0, 60])
    try {
      if (inputRef?.current) inputRef.current.value = ''
    } catch {}
  }, [open])

  // Lock scroll
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

  // Prevent gestures
  useEffect(() => {
    if (!open) return
    const prevent = (e: Event) => {
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

  // Cleanup blob
  useEffect(() => {
    return () => {
      try {
        if (backgroundUrl) URL.revokeObjectURL(backgroundUrl)
      } catch {
      }
    }
  }, [backgroundUrl])

  const loadMedia = async (file: File | null) => {
    try {
      setError('')
      setInfo('')
      if (!file) return
      const loadId = (mediaLoadIdRef.current || 0) + 1
      mediaLoadIdRef.current = loadId
      const rawName = safeString(file?.name).toLowerCase()
      const ext = parseExt(rawName) || extFromMime(file?.type)
      const kind = guessMediaKind(file?.type, ext)
      if (kind !== 'image' && kind !== 'video') {
        setError('Formato não suportado. Use JPG/PNG ou MP4/MOV/WEBM.')
        return
      }
      if (kind === 'video' && (ext === '.webm' || String(file?.type || '').toLowerCase() === 'video/webm')) {
        setError('Formato WEBM pode não rodar no Safari. Prefira MP4/MOV.')
        return
      }
      setInfo('Carregando mídia…')
      const url = URL.createObjectURL(file)
      try {
        if (backgroundUrl) URL.revokeObjectURL(backgroundUrl)
      } catch {
      }
      setSelectedFile(file)
      setMediaKind(kind)
      setBackgroundUrl(url)
      if (kind === 'video') {
        setBackgroundImage(null)
        setInfo('')
        
        // Load video metadata to set defaults
        const v = document.createElement('video')
        v.preload = 'metadata'
        v.onloadedmetadata = () => {
             const dur = v.duration || 0
             setVideoDuration(dur)
             setTrimRange([0, Math.min(dur, 60)])
        }
        v.src = url
        return
      }
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      if (!open) return
      if (mediaLoadIdRef.current !== loadId) return
      setBackgroundImage(img)
      setInfo('')
    } catch {
      setError('Não foi possível carregar a mídia.')
      setInfo('')
    }
  }

  // --- Interaction (LIVE Layout) ---

  const getSizeForKey = (key: string) => {
    if (key === 'brand') return liveSizes?.brand ?? { w: 0.5, h: 0.05 }
    if (key === 'title') return liveSizes?.title ?? { w: 0.7, h: 0.08 }
    if (key === 'subtitle') return liveSizes?.subtitle ?? { w: 0.8, h: 0.05 }
    return liveSizes?.card ?? { w: 0.26, h: 0.08 }
  }

  const onPiecePointerDown = (key: string, e: React.PointerEvent<HTMLElement>) => {
    try {
      if (layout !== 'live') return
      if (!key) return
      if (!e?.currentTarget) return
      if (typeof e?.pointerId !== 'number') return
      e.preventDefault?.()
      e.stopPropagation?.()
      const startPos = livePositions?.[key] ?? DEFAULT_LIVE_POSITIONS?.[key] ?? { x: 0.1, y: 0.1 }
      dragRef.current = { key, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startPos }
      setDraggingKey(key)
      e.currentTarget?.setPointerCapture?.(e.pointerId)
    } catch {
    }
  }

  const onPiecePointerMove = (key: string, e: React.PointerEvent<HTMLElement>) => {
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
      setLivePositions((prev) => ({ ...(prev ?? DEFAULT_LIVE_POSITIONS), [key]: clamped }))
    } catch {
    }
  }

  const onPiecePointerUp = (key: string, e: React.PointerEvent<HTMLElement>) => {
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

  const onSelectLayout = (nextLayout: string) => {
    try {
      const value = safeString(nextLayout)
      setLayout(value || 'bottom-row')
      setDraggingKey(null)
      dragRef.current = { key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } }
    } catch {
      setLayout('bottom-row')
    }
  }

  // Draw loop
  useEffect(() => {
    if (!open) return
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // if (mediaKind === 'video') return // Removed to allow drawing overlay on video
    let raf = 0
    const draw = () => {
      drawStory({ 
        ctx, 
        canvasW: CANVAS_W, 
        canvasH: CANVAS_H, 
        backgroundImage, 
        metrics, 
        layout, 
        livePositions,
        transparentBg: mediaKind === 'video' 
      })
    }
    if (isExporting) {
        draw()
        return
    }
    // Only animate if LIVE and dragging, otherwise draw once to save battery
    if (layout === 'live' && draggingKey) {
        raf = requestAnimationFrame(draw)
    } else {
        draw()
    }
    return () => cancelAnimationFrame(raf)
  }, [open, backgroundImage, layout, livePositions, mediaKind, metrics, draggingKey, isExporting])

  const renderVideo = async (): Promise<{ blob: Blob; filename: string; mime: string }> => {
    if (!videoRef.current) throw new Error('Vídeo não disponível')
    
    // Initialize compositor
    compositorRef.current = new VideoCompositor()
    setIsExporting(true)
    
    try {
        const result = await compositorRef.current.render({
            videoElement: videoRef.current,
            trimRange,
            outputWidth: CANVAS_W,
            outputHeight: CANVAS_H,
            fps: 30,
            onDrawFrame: (ctx, video) => {
                const vw = video.videoWidth
                const vh = video.videoHeight
                if (!vw || !vh) return

                const { scale } = fitCover({ canvasW: CANVAS_W, canvasH: CANVAS_H, imageW: vw, imageH: vh })
                const dw = vw * scale
                const dh = vh * scale
                const cx = (CANVAS_W - dw) / 2
                const cy = (CANVAS_H - dh) / 2
                
                ctx.drawImage(video, cx, cy, dw, dh)
                
                drawStory({ 
                    ctx, 
                    canvasW: CANVAS_W, 
                    canvasH: CANVAS_H, 
                    backgroundImage: null, 
                    metrics, 
                    layout, 
                    livePositions, 
                    transparentBg: true, 
                    skipClear: true 
                })
            }
        })
        return result
    } catch (e) {
        console.error('Render failed', e)
        throw e
    } finally {
        compositorRef.current = null
        setIsExporting(false)
    }
  }

  const createImageBlob = async ({ type = 'jpg', quality = 0.95 }): Promise<{ blob: Blob; filename: string; mime: string }> => {
    if (mediaKind === 'video') {
      return renderVideo()
    }

    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas_error')

    // If image is loaded, use it
    if (mediaKind === 'image') {
        // drawStory already handles this
    }

    drawStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: mediaKind === 'image' ? backgroundImage : null, metrics, layout, livePositions })
    
    // If video, we tried to draw the frame above.
    
    const mime = type === 'png' ? 'image/png' : 'image/jpeg'
    const ext = type === 'png' ? 'png' : 'jpg'
    const filename = `irontracks-story-${Date.now()}.${ext}`

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve({ blob, filename, mime })
          else reject(new Error('blob_failed'))
        },
        mime,
        quality
      )
    })
  }

  const downloadBlob = (blob: Blob, filename: string) => {
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

  const shareImage = async () => {
    setBusy(true)
    setBusyAction('share')
    setError('')
    setInfo('')
    try {
      const result = await createImageBlob({ type: 'jpg' })
      const file = new File([result.blob], result.filename, { type: result.mime })
      
      let shared = false
      if (typeof navigator.share === 'function' && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Story IronTracks' })
          shared = true
        } catch (shareErr: any) {
          const name = String(shareErr?.name || '').trim()
          // If user cancelled, stop here
          if (name === 'AbortError') {
             setBusy(false)
             setBusyAction(null)
             return
          }
          // If not allowed or other error, fall through to download
          console.warn('Share API failed, falling back to download:', shareErr)
        }
      }

      if (!shared) {
        downloadBlob(result.blob, result.filename)
        setInfo('Baixado com sucesso!')
      }
    } catch (e: any) {
      const name = String(e?.name || '').trim()
      if (name === 'AbortError') return
      const msg = String(e?.message || '').trim()
      setError(msg || 'Não foi possível compartilhar.')
    } finally {
      setBusy(false)
      setBusyAction(null)
    }
  }

  const postToIronTracks = async () => {
    setBusy(true)
    setBusyAction('post')
    setError('')
    setInfo('')
    try {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      const uid = String(authData?.user?.id || '').trim()
      if (!uid) throw new Error('unauthorized')

      let path = ''
      let meta: Record<string, unknown> = {}
      
      if (mediaKind === 'video') {
        if (!selectedFile) throw new Error('Selecione um vídeo primeiro.')
        const maxBytes = 200 * 1024 * 1024
        if (Number(selectedFile.size) > maxBytes) throw new Error('Vídeo muito grande (máx 200MB).')
        
        // Renderiza vídeo com layout
        const { blob, mime } = await createImageBlob({})
        if (blob.size > maxBytes) throw new Error('Vídeo renderizado muito grande (máx 200MB).')
        if (String(mime || '').toLowerCase().includes('webm')) {
          const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : ''
          if (isIOSUserAgent(ua)) throw new Error('No iPhone, o vídeo com layout precisa ser MP4. Atualize o iOS/Safari ou poste via desktop.')
        }

        const ext = mime.includes('mp4') ? '.mp4' : '.webm'
        const storyId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
        path = `${uid}/stories/${storyId}${ext}`
        const signResp = await fetch('/api/storage/social-stories/signed-upload', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path }),
        })
        const signJson = await signResp.json().catch((): any => null)
        if (!signResp.ok || !signJson?.ok || !signJson?.token) throw new Error(String(signJson?.error || 'Falha ao preparar upload'))
        const { error: upErr } = await supabase.storage
          .from('social-stories')
          .uploadToSignedUrl(path, String(signJson.token), blob, { contentType: mime })
        if (upErr) throw upErr
        
        meta = {
            title: String(metrics?.title || ''),
            dateText: String(metrics?.date || ''),
            durationSeconds: Number(metrics?.totalTime || 0),
            totalVolumeKg: Number(metrics?.volume || 0),
            kcal: Number(metrics?.kcal || 0),
            layout: String(layout || ''),
            mediaKind: 'video',
        }
      } else {
        // Image
        const result = await createImageBlob({ type: 'jpg', quality: 0.92 })
        const storyId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
        path = `${uid}/stories/${storyId}.jpg`
        const signResp = await fetch('/api/storage/social-stories/signed-upload', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path }),
          })
          const signJson = await signResp.json().catch((): any => null)
          if (!signResp.ok || !signJson?.ok || !signJson?.token) throw new Error(String(signJson?.error || 'Falha ao preparar upload'))
          const { error: upErr } = await supabase.storage
            .from('social-stories')
            .uploadToSignedUrl(path, String(signJson.token), result.blob, { contentType: result.mime })
          if (upErr) throw upErr
          meta = {
            title: String(metrics?.title || ''),
            dateText: String(metrics?.date || ''),
            durationSeconds: Number(metrics?.totalTime || 0),
            totalVolumeKg: Number(metrics?.volume || 0),
            kcal: Number(metrics?.kcal || 0),
            layout: String(layout || ''),
            mediaKind: 'image',
          }
      }

      const createResp = await fetch('/api/social/stories/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mediaPath: path, caption: String(metrics?.title || ''), meta }),
      })
      const createJson = await createResp.json().catch((): any => null)
      if (!createResp.ok || !createJson?.ok) throw new Error(String(createJson?.error || 'Falha ao publicar'))
      
      setInfo('Publicado no IronTracks!')
      try {
        window.dispatchEvent(new Event('irontracks:stories:refresh'))
      } catch {
      }
      try {
        window.setTimeout(() => onClose?.(), 1000)
      } catch {}

    } catch (err: any) {
      console.error(err)
      const msg = String(err?.message || '').trim()
      setError(msg || 'Falha ao publicar story.')
    } finally {
      setBusy(false)
      setBusyAction(null)
    }
  }

  if (!open) return null

  const isVideo = mediaKind === 'video'

  return (
    <AnimatePresence>
    {open && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[2500] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center sm:p-4"
    >
        {/* Mobile Header / Close */}
        <div className="flex-none px-4 pb-4 pt-14 flex justify-between items-start w-full max-w-md mx-auto sm:hidden bg-transparent border-b border-neutral-800/50">
            <div className="text-white min-w-0 flex-1 mr-4">
                <h3 className="font-bold text-lg truncate leading-tight">{metrics.title || 'Story Composer'}</h3>
                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mt-1">COMPARTILHE SUA CONQUISTA</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-neutral-800 text-neutral-400 flex items-center justify-center hover:bg-neutral-700 transition-colors flex-none"
            >
              <X size={16} />
            </button>
        </div>

      <motion.div
        initial={{ y: 20, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 20, scale: 0.95 }}
        className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-5xl bg-black sm:bg-neutral-900 sm:border border-neutral-800 sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Desktop Header */}
        <div className="hidden sm:flex px-6 py-5 border-b border-neutral-800 items-center justify-between flex-none bg-neutral-900">
            <div>
                <h2 className="font-bold text-white text-xl">{metrics.title || 'Story Composer'}</h2>
                <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider mt-1">COMPARTILHE SUA CONQUISTA</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X size={18} />
            </button>
        </div>

        <div ref={scrollAreaRef} className="flex-1 overflow-y-auto overscroll-contain min-h-0 bg-black sm:bg-transparent">
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
                    controls={false}
                    playsInline
                    muted
                    autoPlay
                    loop
                  />
                )}
                
                <canvas
                    ref={previewCanvasRef}
                    width={CANVAS_W}
                    height={CANVAS_H}
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />

                {showSafeGuide && (
                  <div className="absolute inset-0 pointer-events-none z-10">
                    <div
                      className="absolute border border-yellow-500/20 rounded-3xl border-dashed"
                      style={{
                        left: `${(SAFE_SIDE / CANVAS_W) * 100}%`,
                        right: `${(SAFE_SIDE / CANVAS_W) * 100}%`,
                        top: `${(SAFE_TOP / CANVAS_H) * 100}%`,
                        bottom: `${(SAFE_BOTTOM / CANVAS_H) * 100}%`,
                      }}
                    />
                  </div>
                )}

                {layout === 'live' && (
                  <div className="absolute inset-0 pointer-events-none z-20">
                    {livePieces.map((p) => {
                      const pos = livePositions?.[p.key] ?? DEFAULT_LIVE_POSITIONS?.[p.key] ?? { x: 0.1, y: 0.1 }
                      const isDragging = draggingKey === p.key
                      return (
                        <button
                          key={p.key}
                          type="button"
                          className={[
                            'absolute pointer-events-auto select-none touch-none',
                            'px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-transform active:scale-110',
                            isDragging
                              ? 'bg-yellow-500 text-black border-yellow-500 shadow-lg scale-110 z-50'
                              : 'bg-black/60 backdrop-blur text-white border-white/20 hover:border-yellow-500/50',
                          ].join(' ')}
                          style={{
                            left: `${clamp01(pos.x) * 100}%`,
                            top: `${clamp01(pos.y) * 100}%`,
                            cursor: 'grab'
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
                )}
              </div>

              {/* Media Controls */}
              <div className="w-full max-w-[300px] sm:max-w-[340px] flex items-center gap-3">
                <label
                  className={[
                    'flex-1 h-12 rounded-xl bg-neutral-900 border border-neutral-800 text-white font-bold text-[11px] uppercase tracking-wider hover:bg-neutral-800 hover:border-neutral-700 inline-flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]',
                    busy ? 'opacity-50 pointer-events-none' : '',
                  ].join(' ')}
                >
                  <Upload size={16} className="text-yellow-500" />
                  {isVideo ? 'TROCAR' : 'TROCAR FOTO'}
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="sr-only"
                    onChange={(e) => {
                        const f = e.target.files?.[0] || null
                        if (inputRef.current) inputRef.current.value = ''
                        loadMedia(f)
                    }}
                   />
                </label>
                
                {isVideo && (
                    <button
                        type="button"
                        onClick={() => setShowTrimmer(v => !v)}
                        className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-colors active:scale-[0.98] ${
                            showTrimmer 
                            ? 'bg-yellow-500 text-black border-yellow-500' 
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                        disabled={busy}
                    >
                        <Scissors size={18} />
                    </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowSafeGuide((v) => !v)}
                  className={`w-28 h-12 rounded-xl border font-bold text-[10px] uppercase tracking-wider transition-colors active:scale-[0.98] ${
                    showSafeGuide 
                        ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500' 
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                  disabled={busy}
                >
                  GUIA {showSafeGuide ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {/* Controls Column */}
            <div className="flex-1 w-full max-w-[360px] flex flex-col gap-6">
                
                {/* Trimmer UI */}
                <AnimatePresence>
                    {showTrimmer && isVideo && (
                        <motion.div 
                            initial={{ height: 0, opacity: 0 }} 
                            animate={{ height: 'auto', opacity: 1 }} 
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <VideoTrimmer 
                                duration={videoDuration} 
                                value={trimRange} 
                                onChange={(val) => {
                                    setTrimRange(val)
                                    // Update preview frame if paused
                                    if (videoRef.current && videoRef.current.paused) {
                                        videoRef.current.currentTime = val[0]
                                    }
                                }}
                                onPreview={(play) => {
                                    if (!videoRef.current) return
                                    if (play) {
                                        videoRef.current.currentTime = trimRange[0]
                                        videoRef.current.play()
                                        const check = () => {
                                            if (!videoRef.current) return
                                            setPreviewTime(videoRef.current.currentTime)
                                            if (videoRef.current.currentTime >= trimRange[1]) {
                                                videoRef.current.pause()
                                                videoRef.current.currentTime = trimRange[0]
                                            } else if (!videoRef.current.paused) {
                                                requestAnimationFrame(check)
                                            }
                                        }
                                        requestAnimationFrame(check)
                                    } else {
                                        videoRef.current.pause()
                                    }
                                }}
                                currentTime={previewTime}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Layout Selector */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-yellow-500/80 mb-2">
                        <Layout size={14} />
                        ESCOLHA O LAYOUT
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {STORY_LAYOUTS.map((l) => (
                        <button
                            key={l.id}
                            type="button"
                            onClick={() => onSelectLayout(l.id)}
                            className={[
                            'h-12 rounded-xl border text-[11px] font-bold uppercase tracking-wider transition-all active:scale-[0.98]',
                            layout === l.id
                                ? 'bg-white text-black border-white shadow-lg scale-[1.02]'
                                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700',
                            l.id === 'live' ? 'col-span-2' : '' // LIVE spans full width
                            ].join(' ')}
                            disabled={busy}
                        >
                            {l.label}
                        </button>
                        ))}
                    </div>
                    {layout === 'live' && (
                        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3 mt-2">
                            <Move size={16} className="text-blue-400 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-xs text-blue-200 font-medium">Modo LIVE ativado</p>
                                <p className="text-[10px] text-blue-300/70 mt-1">Arraste os elementos na pré-visualização para personalizar.</p>
                            </div>
                            <button 
                                onClick={() => setLivePositions(DEFAULT_LIVE_POSITIONS)}
                                className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-300"
                                title="Resetar posições"
                            >
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

                {/* Actions */}
                <div className="space-y-3 pt-2">
                    <button
                        onClick={postToIronTracks}
                        disabled={busy}
                        className="h-14 w-full rounded-xl bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/10 transition-all active:scale-[0.98]"
                    >
                        {busyAction === 'post' ? (
                            <>
                                <Loader2 className="animate-spin" size={18} />
                                PROCESSANDO...
                            </>
                        ) : 'POSTAR NO IRONTRACKS'}
                    </button>
                    
                    <button
                        onClick={shareImage}
                        disabled={busy}
                        className="h-12 w-full rounded-xl bg-transparent hover:bg-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-400 font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 border border-transparent hover:border-neutral-800 transition-all active:scale-[0.98]"
                    >
                        {busyAction === 'share' ? (
                            <>
                                <Loader2 className="animate-spin" size={14} />
                                PROCESSANDO...
                            </>
                        ) : (
                            <>
                                <Share2 size={14} />
                                BAIXAR / COMPARTILHAR
                            </>
                        )}
                    </button>
                </div>

            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
    )}
    </AnimatePresence>
  )
}
