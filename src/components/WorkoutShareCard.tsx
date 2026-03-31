'use client'
/**
 * WorkoutShareCard
 *
 * Renders a visually rich card (1080×1920 Instagram/Stories ratio internally,
 * displayed at 50% scale) that the user can download as PNG or share via
 * the Web Share API.
 *
 * Props come from WorkoutReport's already-computed data, so no extra fetching.
 */
import React, { useRef, useState, useCallback } from 'react'
import { Download, Share2, X, Loader2, Check } from 'lucide-react'

type AnyObj = Record<string, unknown>

interface WorkoutShareCardProps {
  session: AnyObj | null
  /** Formatted date string, e.g. "31/03/2026" */
  dateStr: string
  /** Workout title (already cleaned) */
  workoutTitle: string
  /** Calories burned (number) */
  calories: number
  /** Total volume in kg */
  currentVolume: number
  /** Sets completed */
  setsCompleted: number
  /** Duration in seconds */
  totalTime: number
  /** Number of PRs detected */
  prCount: number
  /** Detected PRs array (name + value) */
  detectedPrs: { exerciseName?: string; name?: string; e1rm?: number; weight?: number }[]
  /** Close the modal */
  onClose: () => void
}

function formatDuration(seconds: number): string {
  const s = Math.round(Math.max(0, seconds))
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`
}

function formatVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace('.0', '')}t`
  return `${Math.round(v)}kg`
}

// ─── Card renderer (off-screen, actual pixels for export) ─────────────────────

interface CardContentProps {
  workoutTitle: string
  dateStr: string
  calories: number
  currentVolume: number
  setsCompleted: number
  totalTime: number
  prCount: number
  detectedPrs: WorkoutShareCardProps['detectedPrs']
  /** true = full-res (1080px wide) for export; false = preview (540px) */
  fullRes?: boolean
}

function CardContent({
  workoutTitle, dateStr, calories, currentVolume,
  setsCompleted, totalTime, prCount, detectedPrs,
  fullRes = false,
}: CardContentProps) {
  const scale = fullRes ? 1 : 0.5
  const w = 1080 * scale
  const h = 1350 * scale // 4:5 — fits feed + stories crop

  const prs = detectedPrs.slice(0, 3)
  const topExerciseName = (prs[0]?.exerciseName || prs[0]?.name || '').toUpperCase()

  return (
    <div
      style={{
        width: w,
        height: h,
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #0a0900 0%, #111007 35%, #0d0d0d 100%)',
        fontFamily: '"Inter", "SF Pro Display", system-ui, sans-serif',
        flexShrink: 0,
      }}
    >
      {/* Gold gradient top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 6 * scale,
        background: 'linear-gradient(90deg, #ca8a04 0%, #eab308 50%, #ca8a04 100%)',
      }} />

      {/* Decorative radial glow */}
      <div style={{
        position: 'absolute', top: -180 * scale, right: -180 * scale,
        width: 600 * scale, height: 600 * scale, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(234,179,8,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Geometric accent lines */}
      <div style={{
        position: 'absolute', bottom: 220 * scale, left: 0, right: 0,
        height: 1 * scale, background: 'rgba(234,179,8,0.15)',
      }} />
      <div style={{
        position: 'absolute', bottom: 224 * scale, left: 0, right: 0,
        height: 1 * scale, background: 'rgba(234,179,8,0.06)',
      }} />

      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 40 * scale, left: 56 * scale, right: 56 * scale }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 * scale }}>
            <div style={{ fontSize: 22 * scale, fontWeight: 900, letterSpacing: '0.06em', lineHeight: 1 }}>
              <span style={{ color: '#f5f5f5' }}>IRON</span>
              <span style={{ color: '#eab308' }}>TRACKS</span>
            </div>
            <div style={{ fontSize: 9 * scale, fontWeight: 700, letterSpacing: '0.28em', color: '#737373', textTransform: 'uppercase' }}>
              Performance Log
            </div>
          </div>
          {/* Date pill */}
          <div style={{
            padding: `${6 * scale}px ${14 * scale}px`,
            background: 'rgba(234,179,8,0.1)',
            border: '1px solid rgba(234,179,8,0.25)',
            borderRadius: 40 * scale,
            fontSize: 10 * scale, fontWeight: 700, color: '#eab308', letterSpacing: '0.08em',
          }}>
            {dateStr}
          </div>
        </div>
      </div>

      {/* ── WORKOUT NAME ──────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 160 * scale, left: 56 * scale, right: 56 * scale,
      }}>
        <div style={{
          fontSize: 11 * scale, fontWeight: 700, letterSpacing: '0.3em', color: '#eab308',
          textTransform: 'uppercase', marginBottom: 14 * scale,
        }}>
          Treino de Hoje
        </div>
        <div style={{
          fontSize: Math.min(72, 72) * scale,
          fontWeight: 900,
          color: '#ffffff',
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          textTransform: 'uppercase',
          wordBreak: 'break-word',
          maxWidth: '100%',
        }}>
          {workoutTitle || 'TREINO'}
        </div>
      </div>

      {/* ── METRICS GRID ─────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 400 * scale, left: 56 * scale, right: 56 * scale,
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 16 * scale,
      }}>
        {[
          { value: formatDuration(totalTime), label: 'Duração', accent: false },
          { value: `${Math.round(calories)} kcal`, label: 'Calorias', accent: false },
          { value: formatVolume(currentVolume), label: 'Volume Total', accent: true },
          { value: `${setsCompleted} séries`, label: 'Séries Feitas', accent: false },
        ].map(({ value, label, accent }) => (
          <div key={label} style={{
            background: accent
              ? 'linear-gradient(135deg, rgba(234,179,8,0.15) 0%, rgba(234,179,8,0.05) 100%)'
              : 'rgba(255,255,255,0.04)',
            border: accent ? '1px solid rgba(234,179,8,0.3)' : '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16 * scale,
            padding: `${24 * scale}px ${24 * scale}px`,
            display: 'flex', flexDirection: 'column', gap: 6 * scale,
          }}>
            <div style={{
              fontSize: 32 * scale, fontWeight: 900, color: accent ? '#eab308' : '#ffffff',
              letterSpacing: '-0.02em', lineHeight: 1,
            }}>
              {value}
            </div>
            <div style={{ fontSize: 11 * scale, fontWeight: 600, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ── PR SECTION ───────────────────────────────────────────── */}
      {prCount > 0 && (
        <div style={{ position: 'absolute', top: 720 * scale, left: 56 * scale, right: 56 * scale }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10 * scale, marginBottom: 16 * scale,
          }}>
            <div style={{
              background: '#eab308', color: '#000', fontSize: 9 * scale, fontWeight: 900,
              letterSpacing: '0.2em', padding: `${4 * scale}px ${10 * scale}px`,
              borderRadius: 4 * scale, textTransform: 'uppercase',
            }}>
              PR
            </div>
            <div style={{ fontSize: 13 * scale, fontWeight: 800, color: '#eab308', letterSpacing: '0.04em' }}>
              {prCount === 1 ? '1 recorde pessoal' : `${prCount} recordes pessoais`}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 * scale }}>
            {prs.map((pr, i) => {
              const name = (pr.exerciseName || pr.name || '').toUpperCase()
              const val = pr.e1rm ?? pr.weight
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.2)',
                  borderRadius: 12 * scale, padding: `${14 * scale}px ${20 * scale}px`,
                }}>
                  <div style={{ fontSize: 13 * scale, fontWeight: 700, color: '#d4d4d4', letterSpacing: '0.02em' }}>
                    {name || 'EXERCÍCIO'}
                  </div>
                  {val != null && (
                    <div style={{ fontSize: 18 * scale, fontWeight: 900, color: '#eab308' }}>
                      {Number(val).toFixed(1)}kg
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── MOTIVATIONAL TAGLINE ─────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 56 * scale, left: 56 * scale, right: 56 * scale,
        display: 'flex', flexDirection: 'column', gap: 6 * scale,
      }}>
        <div style={{
          fontSize: 11 * scale, fontWeight: 700, color: '#525252',
          letterSpacing: '0.2em', textTransform: 'uppercase',
        }}>
          Treinei hoje. E você?
        </div>
        {topExerciseName && (
          <div style={{ fontSize: 9 * scale, fontWeight: 600, color: '#404040', letterSpacing: '0.1em' }}>
            #{topExerciseName.replace(/\s+/g, '').slice(0, 20)} #irontracks #treino
          </div>
        )}
      </div>

      {/* Corner accent — bottom right */}
      <div style={{
        position: 'absolute', bottom: 0, right: 0,
        width: 120 * scale, height: 120 * scale,
        background: 'linear-gradient(225deg, rgba(234,179,8,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

// ─── Main modal component ──────────────────────────────────────────────────────

export default function WorkoutShareCard({
  session: _session,
  dateStr,
  workoutTitle,
  calories,
  currentVolume,
  setsCompleted,
  totalTime,
  prCount,
  detectedPrs,
  onClose,
}: WorkoutShareCardProps) {
  const exportRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [imgUrl, setImgUrl] = useState<string | null>(null)

  const generate = useCallback(async () => {
    if (!exportRef.current) return null
    setStatus('loading')
    try {
      const { toPng } = await import('html-to-image')
      const url = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#0a0900',
      })
      setImgUrl(url)
      setStatus('done')
      return url
    } catch {
      setStatus('error')
      return null
    }
  }, [])

  const handleDownload = async () => {
    let url = imgUrl
    if (!url) url = await generate()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `irontracks-${workoutTitle.toLowerCase().replace(/\s+/g, '-') || 'treino'}.png`
    a.click()
  }

  const handleShare = async () => {
    let url = imgUrl
    if (!url) url = await generate()
    if (!url) return
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const file = new File([blob], 'irontracks-treino.png', { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${workoutTitle} • IronTracks`,
          text: 'Treinei hoje. E você? 💪',
        })
        return
      }
    } catch { /* fallback to download */ }
    // Fallback: just download
    handleDownload()
  }

  const cardProps: CardContentProps = {
    workoutTitle, dateStr, calories, currentVolume,
    setsCompleted, totalTime, prCount, detectedPrs,
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      className="fixed inset-0 z-[1500] flex flex-col items-center justify-start bg-black/90 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 w-full max-w-lg px-4 pt-4 pb-3 flex items-center justify-between bg-neutral-950/95 backdrop-blur border-b border-neutral-800/60">
        <div>
          <p className="text-sm font-black text-white">Card para Instagram</p>
          <p className="text-xs text-neutral-500 mt-0.5">Toque em Gerar para criar a imagem</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {/* Preview (50% scale) */}
      <div className="mt-6 mb-4 overflow-hidden rounded-2xl shadow-2xl border border-neutral-800">
        <div style={{ transform: 'scale(1)', transformOrigin: 'top left' }}>
          <CardContent {...cardProps} fullRes={false} />
        </div>
      </div>

      {/* Off-screen full-res card for export */}
      <div style={{ position: 'fixed', top: -99999, left: -99999, pointerEvents: 'none' }} aria-hidden>
        <div ref={exportRef}>
          <CardContent {...cardProps} fullRes />
        </div>
      </div>

      {/* Action buttons */}
      <div className="w-full max-w-lg px-4 pb-10 flex flex-col gap-3">
        {status === 'error' && (
          <p className="text-xs text-red-400 text-center">Erro ao gerar imagem. Tente novamente.</p>
        )}

        <button
          type="button"
          onClick={handleShare}
          disabled={status === 'loading'}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-yellow-500 hover:bg-yellow-400 text-black font-black text-sm disabled:opacity-60 transition-all active:scale-[0.98]"
        >
          {status === 'loading' ? (
            <><Loader2 size={16} className="animate-spin" /> Gerando...</>
          ) : status === 'done' ? (
            <><Share2 size={16} /> Compartilhar</>
          ) : (
            <><Share2 size={16} /> Gerar e Compartilhar</>
          )}
        </button>

        <button
          type="button"
          onClick={handleDownload}
          disabled={status === 'loading'}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-sm disabled:opacity-60 transition-all"
        >
          {status === 'done'
            ? <><Check size={14} className="text-green-400" /> Salvar PNG</>
            : <><Download size={14} /> Baixar PNG</>
          }
        </button>

        <p className="text-xs text-neutral-600 text-center">
          Imagem 1080×1350px — ideal para Instagram e WhatsApp
        </p>
      </div>
    </div>
  )
}
