'use client'

import { useEffect } from 'react'

/**
 * Trava o scroll do body enquanto `active` for true (modais/overlays).
 *
 * Motivo (iOS/WKWebView): sem o @capacitor/keyboard, ao focar um input o
 * WKWebView rola o scrollView da PÁGINA pra revelar o campo — e isso arrasta
 * overlays `position: fixed` junto, causando o jitter clássico (o modal fica
 * "subindo e descendo" sem deixar tocar em nada). Congelando o body com
 * position:fixed a página não tem mais o que rolar, então o WebView não mexe
 * no overlay; só o container de scroll INTERNO do modal rola pra revelar o
 * input. Restaura a posição exata ao fechar.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return
    const scrollY = window.scrollY
    const body = document.body
    const orig = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    return () => {
      body.style.position = orig.position
      body.style.top = orig.top
      body.style.width = orig.width
      body.style.overflow = orig.overflow
      window.scrollTo(0, scrollY)
    }
  }, [active])
}
