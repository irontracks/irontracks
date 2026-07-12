'use client'

import { useEffect, useRef } from 'react'
import { isNativePlatform } from '@/utils/platform'
import { logWarn } from '@/lib/logger'
import { savePendingRestDayAnswer, flushPendingRestDayIntent } from '@/lib/nutrition/restDayIntent'

// IDs das ações do push "vai treinar hoje?" (registradas na categoria
// REST_DAY_PROMPT no plugin nativo). Devem casar com os identifiers do Swift.
const REST_DAY_ACTIONS: Record<string, boolean> = { WILL_TRAIN: true, WILL_REST: false }

type ListenerHandle = { remove: () => void }
type PushPermission = { receive: string }
type PushToken = { value: string }
type DeviceId = { identifier: string }

// TTL para dedupe do mesmo action ID (ms). Em iOS, WKWebView pode re-entregar
// o mesmo `pushNotificationActionPerformed` durante cold-launch + warm-launch.
const ACTION_DEDUPE_TTL_MS = 5000

export function usePushNotifications(userId?: string | null) {
  // Persiste entre re-mounts (hot reload em dev / re-execução do effect): se
  // o último action ID for igual ao recebido dentro do TTL, ignorar o dispatch
  // pra evitar navegação duplicada.
  const lastActionRef = useRef<{ id: string; at: number } | null>(null)

  useEffect(() => {
    if (!isNativePlatform()) return
    if (!userId) return

    let alive = true
    const handles: ListenerHandle[] = []

    const run = async () => {
      try {
        const [{ PushNotifications }, { Capacitor }, { Device }] = await Promise.all([
          import('@capacitor/push-notifications'),
          import('@capacitor/core'),
          import('@capacitor/device'),
        ])

        if (!alive) return

        // Grava resposta pendente do push (caso o app tenha aberto a frio pelo
        // toque antes da sessão carregar).
        void flushPendingRestDayIntent(String(userId || ''))

        try {
          await PushNotifications.removeAllDeliveredNotifications()
        } catch (e) {
          logWarn('usePushNotifications', 'removeAllDeliveredNotifications failed', e)
        }

        if (!alive) return

        const platform = String(Capacitor.getPlatform?.() || 'ios').toLowerCase()
        const deviceId = await Device.getId()
          .then((x: DeviceId) => String(x?.identifier || '').trim())
          .catch(() => '')

        const perm = await PushNotifications.checkPermissions()
          .catch((): PushPermission => ({ receive: 'prompt' }))

        if (!alive) return

        if (perm?.receive !== 'granted') {
          const res = await PushNotifications.requestPermissions()
            .catch((): PushPermission => ({ receive: 'denied' }))
          if (!alive) return
          if (res?.receive !== 'granted') {
            logWarn('usePushNotifications', 'Push permission denied', { status: res?.receive })
            return
          }
        }

        // Helper: registra um listener cuidando da race entre await e cleanup.
        // Se !alive logo após o await (ex: SIGNED_OUT durante setup), remove o
        // handle imediatamente em vez de deixar listener órfão disparando callbacks.
        const registerListener = async (
          fn: () => Promise<ListenerHandle | null>,
        ): Promise<ListenerHandle | null> => {
          const handle = await fn().catch(() => null)
          if (!handle) return null
          if (!alive) {
            try { handle.remove() } catch { /* ignore */ }
            return null
          }
          handles.push(handle)
          return handle
        }

        await registerListener(() =>
          PushNotifications.addListener('registration', async (token: PushToken) => {
            try {
              if (!alive) return
              const value = String(token?.value || '').trim()
              if (!value) return

              await fetch('/api/push/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: value, platform, deviceId }),
                credentials: 'include',
                cache: 'no-store',
              }).catch((e) => logWarn('usePushNotifications', 'register fetch failed', e))
            } catch (e) {
              logWarn('usePushNotifications', 'registration handler error', e)
            }
          }),
        )
        if (!alive) return

        await registerListener(() =>
          PushNotifications.addListener('registrationError', (err: unknown) => {
            logWarn('usePushNotifications', 'APNs token registration failed', err)
          }),
        )
        if (!alive) return

        await registerListener(() =>
          PushNotifications.addListener('pushNotificationActionPerformed', (action: unknown) => {
            try {
              if (!alive) return
              const act = action && typeof action === 'object' ? (action as Record<string, unknown>) : null

              // Ação "vai treinar hoje?" (botões WILL_TRAIN / WILL_REST no push).
              // Salva a resposta e leva o usuário pra nutrição ver a meta ajustada.
              const tappedAction = act ? String(act.actionId || '').trim() : ''
              if (tappedAction in REST_DAY_ACTIONS) {
                const willTrain = REST_DAY_ACTIONS[tappedAction]
                savePendingRestDayAnswer(willTrain)
                void flushPendingRestDayIntent(String(userId || ''))
                if (!willTrain) {
                  window.dispatchEvent(new CustomEvent('irontracks:push:navigate', { detail: { link: '/dashboard/nutrition', type: 'rest_day' } }))
                }
                return
              }

              const notification = act?.notification && typeof act.notification === 'object'
                ? (act.notification as Record<string, unknown>) : null
              const data = notification?.data && typeof notification.data === 'object'
                ? (notification.data as Record<string, unknown>) : null
              const link = data ? String(data.link || '').trim() : ''
              const type = data ? String(data.type || '').trim() : ''
              const senderId = data ? String(data.sender_id || '').trim() : ''
              const senderName = data ? String(data.sender_name || '').trim() : ''

              // Ação "Assumir treino" (botão do push quando um aluno inicia — só professor).
              // Dispara o request de controle com o studentId do payload e abre o app.
              if (tappedAction === 'ASSUME_CONTROL') {
                const studentId = data ? String(data.studentId ?? data.student_id ?? '').trim() : ''
                if (studentId) {
                  void fetch(`/api/teacher/control/${studentId}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ action: 'request' }),
                  }).catch(() => { })
                  window.dispatchEvent(new CustomEvent('irontracks:push:navigate', { detail: { link: '/dashboard', type: 'student_workout_start' } }))
                }
                return
              }

              if (link || type) {
                // Dedupe: iOS WKWebView pode re-entregar o mesmo action durante
                // cold-launch + warm-launch. Se o mesmo action ID chegou nos
                // últimos 5s, skip o dispatch pra evitar navegação duplicada.
                // Se ID for falsy (raro), pular dedupe e dispatchar sempre.
                const actionId = notification ? String(notification.id || '').trim() : ''
                const now = Date.now()
                const last = lastActionRef.current
                if (
                  actionId &&
                  last &&
                  last.id === actionId &&
                  now - last.at < ACTION_DEDUPE_TTL_MS
                ) {
                  return
                }
                window.dispatchEvent(new CustomEvent('irontracks:push:navigate', { detail: { link, type, senderId, senderName } }))
                if (actionId) {
                  lastActionRef.current = { id: actionId, at: now }
                }
              }
            } catch (e) {
              logWarn('usePushNotifications', 'pushNotificationActionPerformed error', e)
            }
          }),
        )

        if (!alive) return

        await PushNotifications.register().catch((e: unknown) => {
          logWarn('usePushNotifications', 'PushNotifications.register() failed', e)
        })
      } catch (e) {
        logWarn('usePushNotifications', 'Unexpected error in push setup', e)
      }
    }

    void run()

    return () => {
      alive = false
      handles.forEach((h) => {
        try { h.remove() } catch { /* ignore */ }
      })
    }
  }, [userId])
}
