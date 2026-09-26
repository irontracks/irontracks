/**
 * DashboardEffects — componente "headless" (retorna null) que agrupa hooks
 * side-effect do dashboard. Refactor PR#1 do IronTracksAppClientImpl.
 *
 * Hooks aqui são "fire and forget" — não retornam estado consumido pelo
 * pai. Centralizar facilita raciocinar sobre o que dispara no boot e
 * mantém o componente raiz enxuto.
 *
 * Hooks que retornam estado (useUserSettings, useVipAccess, etc) NÃO entram
 * aqui — virão pro UserDataContext em PR#3.
 */
'use client'

import { useNativeAppSetup } from '@/hooks/useNativeAppSetup'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useNativeIntentRouter } from '@/hooks/useNativeIntentRouter'
import { useBackgroundRefresh } from '@/hooks/useBackgroundRefresh'
import { useLiveActivityPushSync } from '@/hooks/useLiveActivityPushSync'
import { usePresencePing } from '@/hooks/usePresencePing'
import { useUtmAcquisition } from '@/hooks/useUtmAcquisition'

interface DashboardEffectsProps {
  userId?: string | null
  /** Chamado quando uma Siri/Shortcuts intent dispara (todos roteiam pro dashboard hoje). */
  onIntent?: (action: string) => void
}

export function DashboardEffects({ userId, onIntent }: DashboardEffectsProps): null {
  // ─ Native iOS setup (push permission, biometric lock prep)
  useNativeAppSetup(userId)
  // ─ Push notifications (registration + handlers)
  usePushNotifications(userId)

  // ─ Siri / Shortcuts intents (App Intents). Voice triggers como "Iniciar treino
  //   no IronTracks" caem aqui. Atualmente todos roteiam pro dashboard — futuros
  //   deep-links podem branchar via onIntent.
  useNativeIntentRouter({
    onAction: (action) => onIntent?.(action),
  })

  // ─ BGTaskScheduler — opportunistic offline-queue flush + widget refresh
  useBackgroundRefresh()

  // ─ Live Activity push tokens — forwarded to backend for APNs updates
  useLiveActivityPushSync()

  // ─ Presence ping — marca usuário como "online" pra recursos sociais
  usePresencePing(userId)

  // ─ First-touch UTM attribution — captura utm_* na primeira visita e POSTa
  //   após auth resolver
  useUtmAcquisition(userId)

  return null
}
