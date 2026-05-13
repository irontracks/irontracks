'use client'

import { useEffect } from 'react'
import { isNativePlatform } from '@/utils/platform'
import { logWarn } from '@/lib/logger'

type ListenerHandle = { remove: () => void }
type PushPermission = { receive: string }
type PushToken = { value: string }
type DeviceId = { identifier: string }

export function usePushNotifications(userId?: string | null) {
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
              const notification = act?.notification && typeof act.notification === 'object'
                ? (act.notification as Record<string, unknown>) : null
              const data = notification?.data && typeof notification.data === 'object'
                ? (notification.data as Record<string, unknown>) : null
              const link = data ? String(data.link || '').trim() : ''
              const type = data ? String(data.type || '').trim() : ''
              if (link || type) {
                window.dispatchEvent(new CustomEvent('irontracks:push:navigate', { detail: { link, type } }))
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
