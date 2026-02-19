import React, { useEffect, useMemo, useState } from 'react'
import { Play, Pause } from 'lucide-react'

type Range = [number, number]

type Props = {
  duration: number
  value: Range
  onChange: (value: Range) => void
  onPreview?: (play: boolean) => void
  currentTime?: number
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const fmt = (seconds: number) => {
  const s = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

export default function VideoTrimmerImpl({ duration, value, onChange, onPreview, currentTime }: Props) {
  const safeDuration = Math.max(0, Number(duration) || 0)

  const safeValue = useMemo<Range>(() => {
    const start = clamp(Number(value?.[0] ?? 0) || 0, 0, safeDuration)
    const end = clamp(Number(value?.[1] ?? safeDuration) || safeDuration, 0, safeDuration)
    if (end < start) return [end, start]
    return [start, end]
  }, [safeDuration, value])

  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    if (!onPreview) return
    if (!isPlaying) return
    const t = Number(currentTime ?? 0) || 0
    if (t >= safeValue[1]) {
      onPreview(false)
      setTimeout(() => setIsPlaying(false), 0)
    }
  }, [currentTime, isPlaying, onPreview, safeValue])

  const startPct = safeDuration > 0 ? (safeValue[0] / safeDuration) * 100 : 0
  const endPct = safeDuration > 0 ? (safeValue[1] / safeDuration) * 100 : 0
  const curPct = safeDuration > 0 ? (clamp(Number(currentTime ?? 0) || 0, 0, safeDuration) / safeDuration) * 100 : 0

  const setStart = (v: number) => {
    const nextStart = clamp(v, 0, safeValue[1])
    const next: Range = [nextStart, safeValue[1]]
    onChange(next)
  }

  const setEnd = (v: number) => {
    const nextEnd = clamp(v, safeValue[0], safeDuration)
    const next: Range = [safeValue[0], nextEnd]
    onChange(next)
  }

  const togglePreview = () => {
    if (!onPreview) return
    const next = !isPlaying
    setIsPlaying(next)
    onPreview(next)
  }

  return (
    <div className="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-yellow-500/80">
          <span>Corte do vídeo</span>
          <span className="text-neutral-500 font-mono normal-case">
            {fmt(safeValue[0])}–{fmt(safeValue[1])}
          </span>
        </div>
        <button
          type="button"
          onClick={togglePreview}
          disabled={!onPreview || safeDuration <= 0}
          className="h-9 px-3 rounded-lg bg-neutral-800 text-neutral-200 hover:bg-neutral-700 disabled:opacity-50 flex items-center gap-2 text-xs font-bold"
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          {isPlaying ? 'Pausar' : 'Preview'}
        </button>
      </div>

      <div className="relative h-10 rounded-lg bg-neutral-900 border border-neutral-800 overflow-hidden">
        <div
          className="absolute inset-y-0 bg-yellow-500/20 border-y border-yellow-500/40"
          style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
        />
        <div className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${curPct}%` }} />

        <input
          type="range"
          min={0}
          max={safeDuration}
          step={0.05}
          value={safeValue[0]}
          onChange={(e) => setStart(Number(e.target.value))}
          aria-label="Início"
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
        />
        <input
          type="range"
          min={0}
          max={safeDuration}
          step={0.05}
          value={safeValue[1]}
          onChange={(e) => setEnd(Number(e.target.value))}
          aria-label="Fim"
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
        />

        <div className="absolute top-0 bottom-0 w-1.5 bg-yellow-500" style={{ left: `calc(${startPct}% - 3px)` }} />
        <div className="absolute top-0 bottom-0 w-1.5 bg-yellow-500" style={{ left: `calc(${endPct}% - 3px)` }} />
      </div>

      <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
        <span>0:00</span>
        <span>{fmt(safeDuration)}</span>
      </div>
    </div>
  )
}
