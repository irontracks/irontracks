/**
 * @module usePushNotifications
 *
 * Registers the device for push notifications on iOS native.
 * Requests permission, obtains the FCM/APNs token, and POSTs it
 * to `/api/push/register`. Listens for incoming push events and
 * dispatches them as in-app notifications. No-ops on web.
 */
'use client'
import { logWarn } from '@/lib/logger'

import { useEffect } from 'react'
import { isNativePlatform } from '@/utils/platform'

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

      ; (async () => {
        try {
          const capCore = require('@capacitor/core')
          const pushMod = require('@capacitor/push-notifications')
          const deviceMod = require('@capacitor/device')
          const Capacitor = capCore?.Capacitor
          const PushNotifications = pushMod?.PushNotifications
          const Device = deviceMod?.Device
          if (!Capacitor || !PushNotifications) return

          // Clear badge count and delivered notifications when app opens
          try {
            const badgeMod = require('@capawesome/capacitor-badge')
            if (badgeMod?.Badge?.set) {
              await badgeMod.Badge.set({ count: 0 }).catch(() => { })
            }
          } catch {
            // Badge plugin not installed — skip
          }
          try {
            await PushNotifications.removeAllDeliveredNotifications().catch(() => { })
          } catch (e) { logWarn('usePushNotifications', 'silenced error', e) }

          const platform = String(Capacitor.getPlatform?.() || 'ios').toLowerCase()
          const deviceId =
            (await Device?.getId?.()
              .then((x: unknown) => String((x as DeviceId | null)?.identifier || '').trim())
              .catch(() => '')) || ''

          const perm = (await PushNotifications.checkPermissions().catch((): PushPermission => ({ receive: 'prompt' }))) as PushPermission
          if (!alive) return
          if (perm?.receive !== 'granted') {
            const res = (await PushNotifications.requestPermissions().catch((): PushPermission => ({ receive: 'denied' }))) as PushPermission
            if (!alive) return
            if (res?.receive !== 'granted') return
          }

          const registration = await PushNotifications.addListener('registration', async (token: unknown) => {
            try {
              if (!alive) return
              const value = String((token as PushToken | null)?.value || '').trim()
              if (!value) return
              await fetch('/api/push/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: value, platform, deviceId }),
                credentials: 'include',
                cache: 'no-store',
              }).catch(() => { })
            } catch (e) { logWarn('usePushNotifications', 'silenced error', e) }
          })
          if (registration?.remove) handles.push(registration)

          const regError = await PushNotifications.addListener('registrationError', (err: unknown) => {
            logWarn('usePushNotifications', '[APNs] Token registration failed', err)
          })
          if (regError?.remove) handles.push(regError)

          // Deep link: navigate when user taps a push notification
          const tapHandler = await PushNotifications.addListener('pushNotificationActionPerformed', (action: unknown) => {
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
                // Dispatch event so the app shell can navigate without a direct router dependency here
                try {
                  window.dispatchEvent(new CustomEvent('irontracks:push:navigate', { detail: { link, type } }))
                } catch { /* not in browser context */ }
              }
            } catch (e) { logWarn('usePushNotifications', 'pushNotificationActionPerformed error', e) }
          }).catch(() => null)
          if (tapHandler?.remove) handles.push(tapHandler)

          await PushNotifications.register().catch(() => { })
        } catch (e) { logWarn('usePushNotifications', 'silenced error', e) }
      })()

    return () => {
      alive = false
      handles.forEach((h) => {
        try {
          h.remove()
        } catch (e) { logWarn('usePushNotifications', 'silenced error', e) }
      })
    }
  }, [userId])
}
