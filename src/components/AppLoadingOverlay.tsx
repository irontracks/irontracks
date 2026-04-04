'use client'

/**
 * AppLoadingOverlay
 *
 * Persistent loading overlay rendered in the root layout. Because it lives
 * ABOVE the router, it survives client-side navigations (e.g. / → /dashboard)
 * and never unmounts between route changes. This prevents the "IRONTRACKS
 * appears twice" double-blink on iOS Capacitor caused by multiple LoadingScreen
 * instances mounting in separate React trees.
 *
 * Lifecycle:
 *  1. SSR renders this at opacity 1 — covers the page instantly.
 *  2. Client hydrates — same opacity 1, no flash.
 *  3. When the destination page is ready it dispatches 'irontracks:app:ready'.
 *  4. Overlay fades out (0.4s) and is then removed from the DOM.
 *  5. A 12 s safety timeout ensures it never gets stuck.
 */

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import LoadingScreen from './LoadingScreen'

export default function AppLoadingOverlay() {
  const pathname = usePathname()
  const [phase, setPhase] = useState<'visible' | 'fading' | 'done'>('visible')
  const dismissedRef = useRef(false)

  const dismiss = () => {
    if (dismissedRef.current) return
    dismissedRef.current = true
    setPhase('fading')
    setTimeout(() => setPhase('done'), 400)
  }

  useEffect(() => {
    // Auto-dismiss immediately for pages that never fire the ready event
    const skipPaths = ['/auth/', '/wait-', '/offline', '/privacy', '/marketplace']
    if (pathname && skipPaths.some((p) => pathname.startsWith(p))) {
      dismiss()
      return
    }

    window.addEventListener('irontracks:app:ready', dismiss)
    // Safety: never block the UI for more than 12 s
    const safety = setTimeout(dismiss, 12000)
    return () => {
      window.removeEventListener('irontracks:app:ready', dismiss)
      clearTimeout(safety)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase === 'done') return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        opacity: phase === 'fading' ? 0 : 1,
        transition: phase === 'fading' ? 'opacity 0.4s ease-out' : 'none',
        pointerEvents: phase !== 'visible' ? 'none' : 'auto',
      }}
    >
      <LoadingScreen />
    </div>
  )
}
