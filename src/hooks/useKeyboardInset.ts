'use client'

import { useEffect, useState } from 'react'

/**
 * Altura (px) que o teclado virtual ocupa, medida pela VisualViewport.
 *
 * Funciona nos dois modos do WKWebView: quando a layout viewport encolhe E
 * quando NÃO encolhe (iOS) — em ambos `innerHeight - visualViewport.height` dá
 * a altura do teclado.
 *
 * ⚠️ NÃO subtrair `vv.offsetTop`: quando o iOS rola a página pra revelar o input,
 * offsetTop fica > 0 e zerava o inset (a barra colava atrás do teclado).
 * offsetTop é o scroll do visual viewport, não a altura do teclado.
 */
export function computeKeyboardInset(innerHeight: unknown, visualViewportHeight: unknown): number {
  const ih = Number(innerHeight) || 0
  const vh = Number(visualViewportHeight) || 0
  const next = Math.max(0, ih - vh)
  // < 1px é ruído de arredondamento, não teclado.
  return next > 1 ? next : 0
}

/** True quando o inset medido caracteriza teclado aberto (não só barra do browser). */
export function isKeyboardOpenInset(inset: unknown, thresholdPx = 120): boolean {
  return (Number(inset) || 0) > thresholdPx
}

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const update = () => {
      const val = computeKeyboardInset(window.innerHeight, vv.height)
      setInset((prev) => (prev === val ? prev : val))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return inset
}

/**
 * True quando o teclado está aberto. O limiar evita falso positivo de barras
 * do browser/URL (que também encolhem a viewport, mas por poucos px).
 */
export function useKeyboardOpen(thresholdPx = 120): boolean {
  const inset = useKeyboardInset()
  return isKeyboardOpenInset(inset, thresholdPx)
}
