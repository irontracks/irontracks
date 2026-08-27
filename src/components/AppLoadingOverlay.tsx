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
    /**
     * Cobre só quem ANUNCIA prontidão — antes era o contrário.
     *
     * A regra era uma lista de exceções (`skipPaths`) sobre um overlay que
     * cobria TUDO, e só duas telas do app disparam `irontracks:app:ready`: a
     * raiz (`login-gate`) e o dashboard. Toda página pública fora daquela lista
     * ficava coberta até o timeout de 12 s — e aos 8 s o `LoadingScreen` acende
     * "Voltar ao início", ou seja, o app anuncia que travou numa página que
     * carregou na hora.
     *
     * Estavam de fora, medido em 27/08/2026: `/terms` e `/excluir-conta`, as
     * duas server components ESTÁTICAS, sem nada para anunciar. A segunda é o
     * caminho de exclusão de conta que a App Store exige acessível.
     *
     * Invertido, o defeito não volta pela porta que o criou: página pública
     * nova nasce dispensando o overlay, em vez de nascer presa por 12 s até
     * alguém lembrar de acrescentá-la a uma lista.
     */
    const anunciaProntidao = (p: string) => p === '/' || p.startsWith('/dashboard')
    if (pathname && !anunciaProntidao(pathname)) {
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
