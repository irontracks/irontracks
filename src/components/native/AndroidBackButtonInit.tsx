'use client'

import { useEffect } from 'react'
import { initAndroidBackButton } from '@/lib/native/backButton'

/**
 * Headless — inicializa o handler do botão Voltar nativo do Android uma única vez.
 * Montado na árvore de providers do dashboard. No-op fora de Android. Auditoria M11.
 */
export function AndroidBackButtonInit(): null {
  useEffect(() => {
    initAndroidBackButton()
  }, [])
  return null
}
