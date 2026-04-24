'use client'

import { useEffect } from 'react'
import { isNativePlatform } from '@/utils/platform'
import { logWarn } from '@/lib/logger'

type ListenerHandle = { remove: () => void }
type PushPermission = { receive: string }
type PushToken = { value: string }
type DeviceId = { identifier: string }

const diagFetch = (stage: string, data?: Record<string, unknown>) => {
  try {
    fetch('/api/telemetry/user-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `push_diag_${stage}`, type: 'debug', metadata: data ?? {} }),
      credentials: 'include',
      cache: 'no-store',
    }).catch(() => null)
  } catch { /* ignore */ }
}

export function usePushNotifications(userId?: string | null) {
  useEffect(() => {
    diagFetch('effect_ran', { hasUserId: !!userId, isNative: isNativePlatform() })

    if (!isNativePlatform()) { diagFetch('exit_not_native'); return }
    if (!userId) { diagFetch('exit_no_userid'); return }

    diagFetch('starting', { userId: userId.slice(0, 8) })

    let alive = true
    const handles: ListenerHandle[] = []

    const run = async () => {
      try {
        diagFetch('importing')
        const [{ PushNotifications }, { Capacitor }, { Device }] = await Promise.all([
          import('@capacitor/push-notifications'),
          import('@capacitor/core'),
          import('@capacitor/device'),
        ])
        diagFetch('imports_ok')

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

        diagFetch('checking_perms')
        const perm = await PushNotifications.checkPermissions()
          .catch((): PushPermission => ({ receive: 'prompt' }))
        diagFetch('perm_result', { receive: perm?.receive })

        if (!alive) return

        if (perm?.receive !== 'granted') {
          const res = await PushNotifications.requestPermissions()
            .catch((): PushPermission => ({ receive: 'denied' }))
          if (!alive) return
          if (res?.receive !== 'granted') {
            diagFetch('perm_denied', { status: res?.receive })
            logWarn('usePushNotifications', 'Push permission denied', { status: res?.receive })
            return
          }
        }

        diagFetch('adding_listeners')
        const regHandle = await PushNotifications.addListener('registration', async (token: PushToken) => {
          try {
            if (!alive) return
            const value = String(token?.value || '').trim()
            diagFetch('token_received', { hasValue: !!value })
            if (!value) return

            await fetch('/api/push/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: value, platform, deviceId }),
              credentials: 'include',
              cache: 'no-store',
            }).then(() => {
              diagFetch('register_ok')
            }).catch((e) => {
              diagFetch('register_fetch_failed', { error: String(e) })
              logWarn('usePushNotifications', 'register fetch failed', e)
            })
          } catch (e) {
            diagFetch('registration_handler_error', { error: String(e) })
            logWarn('usePushNotifications', 'registration handler error', e)
          }
        })
        handles.push(regHandle)

        const errHandle = await PushNotifications.addListener('registrationError', (err: unknown) => {
          diagFetch('apns_error', { error: String(err) })
          logWarn('usePushNotifications', 'APNs token registration failed', err)
        })
        handles.push(errHandle)

        const tapHandle = await PushNotifications.addListener('pushNotificationActionPerformed', (action: unknown) => {
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
        }).catch(() => null)
        if (tapHandle?.remove) handles.push(tapHandle)

        if (!alive) return

        diagFetch('calling_register')
        await PushNotifications.register().catch((e: unknown) => {
          diagFetch('register_call_failed', { error: String(e) })
          logWarn('usePushNotifications', 'PushNotifications.register() failed', e)
        })
        diagFetch('register_called_ok')
      } catch (e) {
        diagFetch('catch_error', { error: String(e) })
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
