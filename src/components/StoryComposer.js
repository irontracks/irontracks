'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Share2, X } from 'lucide-react'

const CANVAS_W = 1080
const CANVAS_H = 1920

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

export default function StoryComposer({ open, session, onClose }) {
  const previewRef = useRef(null)
  const inputRef = useRef(null)

  const [backgroundUrl, setBackgroundUrl] = useState('')
  const [backgroundImage, setBackgroundImage] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

      setOffset((prev) => ({ x: prev.x + dx * scaleX, y: prev.y + dy * scaleY }))
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

    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    if (backgroundImage) {
      const iw = Number(backgroundImage.naturalWidth) || 0
      const ih = Number(backgroundImage.naturalHeight) || 0

      if (iw > 0 && ih > 0) {
        const coverScale = Math.max(CANVAS_W / iw, CANVAS_H / ih)
        const scale = coverScale * (Number(zoom) || 1)
        const dw = iw * scale
        const dh = ih * scale

        const cx = (CANVAS_W - dw) / 2 + (Number(offset.x) || 0)
        const cy = (CANVAS_H - dh) / 2 + (Number(offset.y) || 0)

        ctx.drawImage(backgroundImage, cx, cy, dw, dh)
      }
    } else {
      const g = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H)
      g.addColorStop(0, '#0a0a0a')
      g.addColorStop(1, '#111827')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    }

    const overlay = ctx.createLinearGradient(0, CANVAS_H * 0.35, 0, CANVAS_H)
    overlay.addColorStop(0, 'rgba(0,0,0,0)')
    overlay.addColorStop(1, 'rgba(0,0,0,0.75)')
    ctx.fillStyle = overlay
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    ctx.fillStyle = '#facc15'
    ctx.font = '900 56px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    ctx.textBaseline = 'top'
    ctx.fillText('IRONTRACKS', 72, 64)

    const title = safeString(metrics.title).toUpperCase()
    ctx.fillStyle = '#ffffff'
    ctx.font = '900 74px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    const lines = []
    const words = title.split(/\s+/).filter(Boolean)
    let line = ''
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w
      if (ctx.measureText(candidate).width <= CANVAS_W - 144) line = candidate
      else {
        if (line) lines.push(line)
        line = w
      }
      if (lines.length >= 2) break
    }
    if (line && lines.length < 2) lines.push(line)

    let y = CANVAS_H - 520
    lines.forEach((l) => {
      ctx.fillText(l, 72, y)
      y += 86
    })

    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    const dateText = metrics.date ? `• ${metrics.date}` : ''
    ctx.fillText(`RELATÓRIO DO TREINO ${dateText}`.trim(), 72, CANVAS_H - 320)

    const cards = [
      { label: 'VOLUME', value: `${Math.round(metrics.volume).toLocaleString('pt-BR')} kg` },
      { label: 'TEMPO', value: formatDuration(metrics.totalTime) },
      { label: 'KCAL', value: String(metrics.kcal || 0) },
    ]

    const cardY = CANVAS_H - 240
    const gap = 18
    const cardW = Math.floor((CANVAS_W - 144 - gap * 2) / 3)
    const cardH = 130

    cards.forEach((c, idx) => {
      const x = 72 + idx * (cardW + gap)
      ctx.save()
      drawRoundedRect(ctx, x, cardY, cardW, cardH, 26)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.stroke()
      ctx.restore()

      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      ctx.font = '900 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      ctx.fillText(c.label, x + 22, cardY + 18)

      ctx.fillStyle = '#ffffff'
      ctx.font = '900 42px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      ctx.fillText(c.value, x + 22, cardY + 54)
    })

    return canvas
  }

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
    const mime = type === 'jpg' ? 'image/jpeg' : 'image/png'
    const quality = type === 'jpg' ? 0.92 : undefined
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no_blob'))), mime, quality)
    })
    const base = safeString(metrics.title).replace(/[^\w\d-_]+/g, '-').slice(0, 48) || 'treino'
    const filename = `irontracks-story-${base}.${type}`
    return { blob, filename, mime }
  }

  const exportImage = async ({ type }) => {
    setBusy(true)
    setError('')
    try {
      const result = await createImageBlob({ type })
      downloadBlob(result.blob, result.filename)
    } catch {
      setError('Não foi possível exportar o Story.')
    } finally {
      setBusy(false)
    }
  }

  const shareImage = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await createImageBlob({ type: 'png' })
      const file = new File([result.blob], result.filename, { type: result.mime })
      const canShareFile = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }))
      if (canShareFile) await navigator.share({ files: [file], title: 'Story IronTracks' })
      else downloadBlob(result.blob, result.filename)
    } catch {
      setError('Não foi possível compartilhar. Tente baixar em PNG ou JPG.')
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
            <div className="text-[11px] font-black uppercase tracking-widest text-yellow-500">Story</div>
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
              {backgroundUrl ? (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${backgroundUrl})`,
                    backgroundSize: `${zoom * 110}%`,
                    backgroundPosition: `calc(50% + ${(offset.x / 10).toFixed(2)}px) calc(50% + ${(offset.y / 10).toFixed(2)}px)`,
                    backgroundRepeat: 'no-repeat',
                    filter: 'contrast(1.05) saturate(1.1)',
                  }}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-neutral-950 to-neutral-800" />
              )}

              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/0 to-black/70" />

              <div className="absolute top-4 left-4">
                <div className="text-yellow-500 font-black italic tracking-tighter text-lg leading-none">
                  IRON<span className="text-white">TRACKS</span>
                </div>
              </div>

              <div className="absolute bottom-4 left-4 right-4">
                <div className="text-white font-black text-2xl leading-tight drop-shadow">
                  {safeString(metrics.title).toUpperCase()}
                </div>
                <div className="mt-2 text-white/80 text-xs font-black uppercase tracking-widest">
                  RELATÓRIO DO TREINO{metrics.date ? ` • ${metrics.date}` : ''}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl border border-white/10 bg-black/50 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/60">Volume</div>
                    <div className="text-white font-black text-sm">{Math.round(metrics.volume).toLocaleString('pt-BR')} kg</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/50 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/60">Tempo</div>
                    <div className="text-white font-black text-sm">{formatDuration(metrics.totalTime)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/50 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/60">Kcal</div>
                    <div className="text-white font-black text-sm">{metrics.kcal || 0}</div>
                  </div>
                </div>
              </div>
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

            {error ? (
              <div className="rounded-2xl border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => exportImage({ type: 'png' })}
                className="h-11 rounded-2xl bg-neutral-950 border border-neutral-800 text-white font-black uppercase tracking-widest text-xs hover:bg-neutral-800 inline-flex items-center justify-center gap-2"
                disabled={busy}
              >
                <Download size={16} /> PNG
              </button>
              <button
                type="button"
                onClick={() => exportImage({ type: 'jpg' })}
                className="h-11 rounded-2xl bg-neutral-950 border border-neutral-800 text-white font-black uppercase tracking-widest text-xs hover:bg-neutral-800 inline-flex items-center justify-center gap-2"
                disabled={busy}
              >
                <Download size={16} /> JPG
              </button>
              <button
                type="button"
                onClick={shareImage}
                className="h-11 rounded-2xl bg-yellow-500 text-black font-black uppercase tracking-widest text-xs hover:bg-yellow-400 inline-flex items-center justify-center gap-2"
                disabled={busy}
              >
                <Share2 size={16} /> Compartilhar
              </button>
            </div>

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
