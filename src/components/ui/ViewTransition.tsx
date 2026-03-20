'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface ViewTransitionProps {
  /** Key that triggers the transition animation (e.g. view name) */
  viewKey: string
  /** Children to render */
  children: ReactNode
  /** Animation duration in ms */
  duration?: number
  /** Additional className */
  className?: string
}

/**
 * Lightweight CSS fade transition wrapper.
 * Fades out old content and fades in new content when `viewKey` changes.
 * No external dependencies — pure CSS animation.
 */
export function ViewTransition({ viewKey, children, duration = 200, className = '' }: ViewTransitionProps) {
  const [rendered, setRendered] = useState(children)
  const [phase, setPhase] = useState<'visible' | 'fading-out' | 'fading-in'>('visible')
  const prevKey = useRef(viewKey)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (viewKey === prevKey.current) {
      // Same view — just update content without animation
      setRendered(children)
      return
    }

    prevKey.current = viewKey

    // Phase 1: fade out
    setPhase('fading-out')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      // Phase 2: swap content + fade in
      setRendered(children)
      setPhase('fading-in')
      timerRef.current = setTimeout(() => {
        setPhase('visible')
      }, duration)
    }, duration)

    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, duration])

  // Also update on children change within same view
  useEffect(() => {
    if (viewKey === prevKey.current && phase === 'visible') {
      setRendered(children)
    }
  }, [children, viewKey, phase])

  const opacity = phase === 'fading-out' ? 0 : 1
  const translate = phase === 'fading-out' ? 'translateY(8px)' : phase === 'fading-in' ? 'translateY(0)' : 'translateY(0)'

  return (
    <div
      className={className}
      style={{
        opacity,
        transform: translate,
        transition: `opacity ${duration}ms ease, transform ${duration}ms ease`,
        willChange: phase !== 'visible' ? 'opacity, transform' : 'auto',
      }}
    >
      {rendered}
    </div>
  )
}
