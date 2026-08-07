/**
 * @module useBadgeSeen
 *
 * Avisa o servidor que o usuário ABRIU o app, para o número do ícone (badge
 * iOS) não voltar cheio no próximo push.
 *
 * Divisão de trabalho:
 *   • nativo (`SceneDelegate.clearIconBadge`) zera o número NO DEVICE, na hora,
 *     mesmo sem rede;
 *   • este hook grava `user_settings.badge_cleared_at` para o cálculo do badge
 *     no servidor (`countUnreadSinceCleared`) passar a contar só o que chegar
 *     DEPOIS desta abertura.
 *
 * NÃO marca notificação como lida — o sino dentro do app continua sinalizando
 * as não lidas até o usuário abrir a central de notificações.
 *
 * Só roda em app nativo: na web não existe badge de ícone para zerar.
 */
'use client'

import { useEffect, useRef } from 'react'
import { isAndroidNative, isIosNative } from '@/utils/platform'
import { logWarn } from '@/lib/logger'

/** Janela mínima entre dois avisos — evita rajada de POST quando o iOS manda
 *  `appStateChange` repetido (alternar app, sheet do sistema, etc). */
const MIN_INTERVAL_MS = 30_000

export function useBadgeSeen(userId?: string | null): void {
  const lastSentAtRef = useRef(0)

  useEffect(() => {
    if (!userId) return
    if (!isIosNative() && !isAndroidNative()) return

    let cancelled = false

    const markSeen = () => {
      const now = Date.now()
      if (now - lastSentAtRef.current < MIN_INTERVAL_MS) return
      lastSentAtRef.current = now
      // Best-effort: falhar aqui só significa que o badge volta com a contagem
      // antiga — não vale quebrar nada na tela por causa disso.
      fetch('/api/push/badge-seen', { method: 'POST', credentials: 'include' }).catch(() => { })
    }

    // Boot (cold start) — o app já está na frente quando este efeito roda.
    markSeen()

    let capListenerHandle: { remove: () => void } | null = null
    import('@capacitor/app').then(({ App }) => {
      if (cancelled) return
      App.addListener('appStateChange', (state: { isActive?: boolean }) => {
        if (state?.isActive) markSeen()
      })
        .then((h) => {
          if (cancelled) { h.remove(); return }
          capListenerHandle = h
        })
        .catch((e) => logWarn('useBadgeSeen', 'capacitor listener add failed', { error: String(e) }))
    }).catch((e) => logWarn('useBadgeSeen', 'capacitor import failed', { error: String(e) }))

    return () => {
      cancelled = true
      try { capListenerHandle?.remove() } catch { /* noop */ }
    }
  }, [userId])
}
