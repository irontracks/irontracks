'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import type { TourStep } from '@/utils/tourSteps'

interface GuidedTourProps {
  open: boolean
  steps: TourStep[]
  // kept for backward compat with parent — not used in slide-based tour
  actions?: Record<string, (...args: unknown[]) => Promise<void> | void>
  onComplete?: () => void
  onSkip?: () => void
  onCancel?: () => void
  onEvent?: (name: unknown, payload: unknown) => void
}

export default function GuidedTour({
  open,
  steps,
  onComplete,
  onSkip,
  onCancel,
  onEvent,
}: GuidedTourProps) {
  const safeSteps = useMemo(() => Array.isArray(steps) && steps.length > 0 ? steps : [], [steps])
  const [idx, setIdx] = useState(0)
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const emit = useCallback((name: string, payload: unknown) => {
    try { onEvent?.(name, payload) } catch { }
  }, [onEvent])

  // Stable refs so keyboard handler doesn't re-register when parent re-renders callbacks
  const onCancelRef = useRef(onCancel)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCancelRef.current = onCancel }, [onCancel])
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  // Mount/unmount with animation
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        setIdx(0)
        setShouldRender(true)
      }, 0)
      // Double rAF ensures DOM is ready before CSS transition kicks in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true))
      })
    } else {
      setTimeout(() => setIsVisible(false), 0)
      const t = setTimeout(() => setShouldRender(false), 350)
      return () => clearTimeout(t)
    }
  }, [open])

  // Emit step event on change
  useEffect(() => {
    if (!open || !safeSteps[idx]) return
    emit('tour_step', { stepId: safeSteps[idx].id, index: idx })
  }, [open, idx]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancelRef.current?.() }
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        if (idx < safeSteps.length - 1) setIdx(i => i + 1)
        else onCompleteRef.current?.()
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (idx > 0) setIdx(i => i - 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, idx, safeSteps.length])

  const handleNext = useCallback(() => {
    if (idx < safeSteps.length - 1) {
      setIdx(i => i + 1)
    } else {
      emit('tour_completed', { stepId: safeSteps[idx]?.id })
      onComplete?.()
    }
  }, [idx, safeSteps, emit, onComplete])

  const handleSkip = useCallback(() => {
    emit('tour_skipped', { stepId: safeSteps[idx]?.id, index: idx })
    onSkip?.()
  }, [idx, safeSteps, emit, onSkip])

  const handleCancel = useCallback(() => {
    emit('tour_cancelled', { stepId: safeSteps[idx]?.id, index: idx })
    onCancel?.()
  }, [idx, safeSteps, emit, onCancel])

  // Swipe gesture
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < 48) return
    if (dx < 0 && idx < safeSteps.length - 1) setIdx(i => i + 1)
    else if (dx > 0 && idx > 0) setIdx(i => i - 1)
  }, [idx, safeSteps.length])

  if (!shouldRender || !safeSteps.length) return null

  const isLast = idx >= safeSteps.length - 1

  return (
    <div className="fixed inset-0 z-[500] flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: isVisible ? 1 : 0 }}
        onClick={handleCancel}
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tour do IronTracks"
        className="relative z-10 transition-transform duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ transform: isVisible ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <div
          className="rounded-t-[28px] overflow-hidden select-none"
          style={{
            background: 'linear-gradient(160deg, #1a1500 0%, #0d0d0d 40%)',
            boxShadow: '0 -12px 48px rgba(0,0,0,0.85), 0 0 0 1px rgba(234,179,8,0.18), inset 0 1px 0 rgba(234,179,8,0.25)',
          }}
        >
          {/* Gold shimmer top */}
          <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/80 to-transparent" />

          {/* Header row: drag handle + close */}
          <div className="flex items-center justify-between px-5 pt-3 pb-1">
            {/* Drag handle */}
            <div className="w-8 h-1 bg-white/20 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 mt-1" />
            {/* Step counter */}
            <span className="text-[11px] font-bold text-yellow-500/70 uppercase tracking-widest">
              {idx + 1} / {safeSteps.length}
            </span>
            {/* Close */}
            <button
              type="button"
              onClick={handleCancel}
              aria-label="Fechar tour"
              className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/12 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 pb-2 pt-1">
            {safeSteps.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Ir para passo ${i + 1}`}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === idx ? 20 : 6,
                  height: 6,
                  background: i === idx
                    ? '#eab308'
                    : i < idx
                      ? 'rgba(234,179,8,0.35)'
                      : 'rgba(255,255,255,0.15)',
                }}
              />
            ))}
          </div>

          {/* Slide carousel */}
          <div
            className="overflow-hidden"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div
              className="flex transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${idx * 100}%)`, willChange: 'transform' }}
            >
              {safeSteps.map((step) => (
                <div
                  key={step.id}
                  className="w-full flex-shrink-0 px-8 pb-6 pt-4 text-center"
                >
                  {/* Emoji */}
                  <div
                    className="mb-5 leading-none"
                    style={{ fontSize: 64, filter: 'drop-shadow(0 4px 12px rgba(234,179,8,0.2))' }}
                    aria-hidden="true"
                  >
                    {step.emoji}
                  </div>

                  {/* Title */}
                  <h2 className="text-[20px] font-black text-white leading-tight mb-3">
                    {step.title}
                  </h2>

                  {/* Body */}
                  <p className="text-[14px] text-neutral-400 leading-relaxed whitespace-pre-line">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div
            className="px-6 pt-2"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}
          >
            {!isLast ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="px-4 py-3 text-sm font-medium text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  Pular
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-2xl bg-yellow-500 text-black font-black text-[15px] hover:bg-yellow-400 active:scale-95 transition-all"
                >
                  Próximo
                  <ChevronRight size={16} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="w-full py-4 rounded-2xl font-black text-[16px] text-black active:scale-95 transition-all"
                style={{
                  background: 'linear-gradient(135deg, #facc15 0%, #eab308 50%, #ca8a04 100%)',
                  boxShadow: '0 4px 20px rgba(234,179,8,0.35)',
                }}
              >
                Começar! 🚀
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
