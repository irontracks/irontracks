/**
 * DashboardProviders — agrupa os 3 providers que envolvem a UI do dashboard.
 * Refactor PR#1 do IronTracksAppClientImpl.
 *
 * Cadeia (de fora pra dentro):
 *   InAppNotificationsProvider
 *     ├── InAppNotifyBinder (binda fn `notify` num ref externo)
 *     ├── WatchSyncProvider (push pro Apple Watch)
 *     └── TeamWorkoutProvider (treinos em grupo)
 *
 * Inner-most envolve children (a UI propriamente dita).
 */
'use client'

import { useEffect } from 'react'
import { InAppNotificationsProvider, useInAppNotifications } from '@/contexts/InAppNotificationsContext'
import { TeamWorkoutProvider } from '@/contexts/TeamWorkoutContext'
import WatchSyncProvider from '@/components/WatchSyncProvider'
import { AndroidBackButtonInit } from '@/components/native/AndroidBackButtonInit'
import type { WatchDashboard, WatchGym } from '@/hooks/useWatchBridge'

interface DashboardProvidersProps {
  children: React.ReactNode
  userId?: string
  /** UserSettings normalizado. Repassado pros 2 providers que dependem dele. */
  settings: Record<string, unknown> | null
  /** Handler chamado quando o usuário toca em uma notificação in-app. */
  onOpenNotifications: () => void
  /** Recebe a função `notify` do context — pra IronTracksApp expor via ref. */
  bindInAppNotify: (notify: ((payload: unknown) => void) | null) => void
  /** Payload do dashboard pro Apple Watch. */
  watchDashboard: WatchDashboard | null
  /** Lista de academias pra Watch checkin view. */
  watchGyms: WatchGym[]
  /** Callback de refresh disparado pelo Watch. */
  onWatchRefresh: () => void
  /** User mínimo aceito pelo TeamWorkoutProvider. */
  teamUser: { id: string; email: string | null } | null
  /** Iniciar sessão a partir de invite/team. */
  onStartSession: (workout: Record<string, unknown>) => void | Promise<void>
}

export function DashboardProviders({
  children,
  userId,
  settings,
  onOpenNotifications,
  bindInAppNotify,
  watchDashboard,
  watchGyms,
  onWatchRefresh,
  teamUser,
  onStartSession,
}: DashboardProvidersProps) {
  return (
    <InAppNotificationsProvider
      userId={userId || undefined}
      settings={settings ?? undefined}
      onOpenNotifications={onOpenNotifications}
    >
      <InAppNotifyBinder bind={bindInAppNotify} />
      {/* Botão Voltar nativo do Android — headless, fecha overlays em vez de minimizar */}
      <AndroidBackButtonInit />
      {/* Apple Watch sync — headless, sem output visual */}
      <WatchSyncProvider
        dashboard={watchDashboard}
        nearestGyms={watchGyms}
        onRefresh={onWatchRefresh}
      />
      <TeamWorkoutProvider user={teamUser} settings={settings ?? undefined} onStartSession={onStartSession}>
        {children}
      </TeamWorkoutProvider>
    </InAppNotificationsProvider>
  )
}

// ─── Bridge interno: binda a fn `notify` do context num ref externo ─────────
// Permite que o god component leia `inAppNotifyRef.current(payload)` sem ter
// que consumir o context diretamente (que forçaria todo IronTracksApp a re-renderizar
// quando o context value mudasse).
function InAppNotifyBinder({ bind }: { bind: (notify: ((payload: unknown) => void) | null) => void }): null {
  const { notify } = useInAppNotifications()
  useEffect(() => {
    bind(notify as (payload: unknown) => void)
    return () => {
      try { bind(null) } catch { /* ignore */ }
    }
  }, [notify, bind])
  return null
}
