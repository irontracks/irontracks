'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

interface Rect {
  top: number
  left: number
  width: number
  height: number
  raw: DOMRect
}

const getRect = (el: Element | null): Rect | null => {
  try {
    if (!el?.getBoundingClientRect) return null
    const r = el.getBoundingClientRect()
    if (!Number.isFinite(r?.top)) return null
    const pad = 8
    const top = r.top - pad
    const left = r.left - pad
    const width = r.width + pad * 2
    const height = r.height + pad * 2
    const maxW = Math.max(0, window.innerWidth - clamp(left, 0, window.innerWidth))
    const maxH = Math.max(0, window.innerHeight - clamp(top, 0, window.innerHeight))
    return {
      top: clamp(top, 0, window.innerHeight),
      left: clamp(left, 0, window.innerWidth),
      width: clamp(width, 0, maxW),
      height: clamp(height, 0, maxH),
      raw: r,
    }
  } catch {
    return null
  }
}

const findTarget = (selector: string | null): Element | null => {
  try {
    const s = String(selector || '').trim()
    if (!s) return null
    const list = Array.from(document.querySelectorAll(s))
    for (const el of list) {
      if (!el?.getBoundingClientRect) continue
      const r = el.getBoundingClientRect()
      const visible = Number(r.width) > 0 && Number(r.height) > 0
      if (!visible) continue
      return el
    }
    return list[0] || null
  } catch {
    return null
  }
}

interface TourAction {
  name?: string
  args?: unknown[]
}

interface TourStep {
  id?: string | number
  title?: string
  body?: string
  action?: TourAction | (() => Promise<void> | void)
  route?: string
  selector?: string
}

interface GuidedTourProps {
  open: boolean
  steps: TourStep[]
  actions?: Record<string, (...args: unknown[]) => Promise<void> | void>
  onComplete?: () => void
  onSkip?: () => void
  onCancel?: () => void
  onEvent?: (name: string, payload: unknown) => void
}

export default function GuidedTour({
  open,
  steps,
  actions,
  onComplete,
  onSkip,
  onCancel,
  onEvent,
}: GuidedTourProps) {
  const router = useRouter()
  const pathname = usePathname()
  const safeSteps = Array.isArray(steps) ? steps : []
  const [idx, setIdx] = useState(0)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const lastStepIdRef = useRef('')
  const pollRef = useRef<number | null>(null)
  const scrollRafRef = useRef<number | null>(null)
  const lastActionStepIdRef = useRef('')

  const step = safeSteps[idx] || null
  const stepId = String(step?.id || idx)

  const emit = useCallback((name: string, payload: unknown) => {
    try {
      onEvent?.(name, payload)
    } catch { }
  }, [onEvent])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => setIdx(0), 0)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!safeSteps.length) return
    const id = String(stepId)
    if (lastStepIdRef.current === id) return
    lastStepIdRef.current = id
    emit('tour_step', { stepId: id, index: idx })
  }, [emit, idx, open, safeSteps.length, stepId])

  useEffect(() => {
    if (!open) return
    if (!step) return
    const action = step?.action
    if (!action) return
    const id = String(stepId)
    if (lastActionStepIdRef.current === id) return
    lastActionStepIdRef.current = id
    const run = async () => {
      try {
        if (typeof action === 'function') {
          await Promise.resolve(action())
          return
        }
        const a = action && typeof action === 'object' ? action : null
        const name = String(a?.name || '').trim()
        const args = Array.isArray(a?.args) ? a.args : []
        if (!name) return
        const map = actions && typeof actions === 'object' ? actions : null
        const fn = map && typeof map[name] === 'function' ? map[name] : null
        if (!fn) return
        await Promise.resolve(fn(...args))
      } catch { }
    }
    run()
  }, [actions, open, step, stepId])

  useEffect(() => {
    if (!open) return
    if (!step) return
    const route = String(step?.route || '').trim()
    if (!route) return
    if (route === pathname) return
    try {
      router.push(route)
    } catch { }
  }, [open, pathname, router, step])

  useEffect(() => {
    if (!open) return
    if (!step) return
    let cancelled = false
    const clearT = window.setTimeout(() => setTargetRect(null), 0)

    const selector = String(step?.selector || '').trim()
    const route = String(step?.route || '').trim()
    let hasScrolled = false

    const updateRect = () => {
      if (cancelled) return
      if (route && route !== pathname) return
      const el = findTarget(selector)
      if (!el) return
      if (!hasScrolled) {
        hasScrolled = true
        try {
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
        } catch { }
      }
      const rect = getRect(el)
      setTargetRect(rect)
      if (rect && pollRef.current) {
        try {
          window.clearInterval(pollRef.current)
        } catch { }
        pollRef.current = null
      }
    }

    const start = Date.now()
    pollRef.current = window.setInterval(() => {
      if (cancelled) return
      updateRect()
      const elapsed = Date.now() - start
      if (elapsed > 2500) {
        try {
          if (pollRef.current) window.clearInterval(pollRef.current)
        } catch { }
        pollRef.current = null
      }
    }, 120)

    const onScrollOrResize = () => {
      if (cancelled) return
      if (scrollRafRef.current) return
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null
        updateRect()
      })
    }

    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)

    return () => {
      cancelled = true
      try {
        window.clearTimeout(clearT)
      } catch { }
      try {
        if (pollRef.current) window.clearInterval(pollRef.current)
      } catch { }
      pollRef.current = null
      try {
        window.removeEventListener('scroll', onScrollOrResize, true)
        window.removeEventListener('resize', onScrollOrResize)
      } catch { }
      try {
        if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current)
      } catch { }
      scrollRafRef.current = null
    }
  }, [open, pathname, step])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        try {
          onCancel?.()
        } catch { }
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (idx < safeSteps.length - 1) setIdx((v) => v + 1)
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (idx > 0) setIdx((v) => v - 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [idx, onCancel, open, safeSteps.length])

  const tooltip = useMemo(() => {
    const r = targetRect
    const margin = 12
    const w = 380
    const maxW = Math.min(w, Math.max(280, (typeof window !== 'undefined' ? window.innerWidth : 360) - 24))
    const leftBase = r ? r.left + r.width / 2 - maxW / 2 : (typeof window !== 'undefined' ? (window.innerWidth - maxW) / 2 : 20)
    const left = clamp(leftBase, 12, (typeof window !== 'undefined' ? window.innerWidth : 360) - maxW - 12)
    const spaceBelow = r && typeof window !== 'undefined' ? window.innerHeight - (r.top + r.height) : 9999
    const preferAbove = spaceBelow < 240
    const top = r ? (preferAbove ? r.top - margin - 210 : r.top + r.height + margin) : 120
    const topClamped = clamp(top, 12, (typeof window !== 'undefined' ? window.innerHeight : 800) - 240)
    return { left, top: topClamped, width: maxW, placement: preferAbove ? 'top' : 'bottom' }
  }, [targetRect])

  if (!open || !step) return null

  const isLast = idx >= safeSteps.length - 1

  return (
    <div className="fixed inset-0 z-[2000]">
      {!targetRect ? <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" /> : null}
      {targetRect ? (
        <div
          className="absolute rounded-2xl border-2 border-yellow-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] pointer-events-none"
          style={{ top: targetRect.top, left: targetRect.left, width: targetRect.width, height: targetRect.height }}
        />
      ) : null}

      <div
        className="absolute rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl p-4 pointer-events-auto max-h-[calc(100vh-24px)] overflow-auto"
        style={{ top: tooltip.top, left: tooltip.left, width: tooltip.width, maxWidth: 'calc(100vw - 24px)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Tour"
      >
        {targetRect ? (
          <div
            className="absolute w-3 h-3 bg-neutral-900 border border-neutral-800 rotate-45"
            style={{
              left: clamp((targetRect.left + targetRect.width / 2) - tooltip.left, 20, tooltip.width - 20),
              top: tooltip.placement === 'top' ? 'auto' : -6,
              bottom: tooltip.placement === 'top' ? -6 : 'auto',
            }}
          />
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Tour</div>
            <div className="mt-1 text-white font-black text-base leading-snug">{String(step?.title || '')}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              emit('tour_cancelled', { stepId })
              onCancel?.()
            }}
            className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
            aria-label="Cancelar"
          >
            <X size={18} />
          </button>
        </div>

        {String(step?.body || '').trim() ? (
          <div className="mt-3 text-sm text-neutral-200 leading-snug whitespace-pre-wrap">{String(step.body)}</div>
        ) : null}

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              emit('tour_skipped', { stepId })
              onSkip?.()
            }}
            className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 w-full sm:w-auto"
          >
            Pular
          </button>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto sm:justify-end">
            <button
              type="button"
              onClick={() => setIdx((v) => Math.max(0, v - 1))}
              disabled={idx === 0}
              className="min-h-[44px] px-4 py-3 rounded-xl bg-black border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-950 disabled:opacity-60 inline-flex items-center justify-center gap-2 flex-1 sm:flex-none"
            >
              <ChevronLeft size={16} />
              Voltar
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isLast) {
                  setIdx((v) => Math.min(safeSteps.length - 1, v + 1))
                  return
                }
                emit('tour_completed', { stepId })
                onComplete?.()
              }}
              className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center justify-center gap-2 flex-1 sm:flex-none"
            >
              {!isLast ? (
                <>
                  Próximo
                  <ChevronRight size={16} />
                </>
              ) : (
                'Concluir'
              )}
            </button>
          </div>
        </div>

        <div className="mt-3 text-[11px] text-neutral-500 font-mono">
          {idx + 1}/{safeSteps.length}
        </div>
      </div>
    </div>
  )
}