'use client'

import { useEffect } from 'react'
import { isIosNative } from '@/utils/platform'

type ListenerHandle = { remove: () => void }
type PushPermission = { receive: string }
type PushToken = { value: string }
type DeviceId = { identifier: string }

export function usePushNotifications(userId?: string | null) {
  useEffect(() => {
    if (!isIosNative()) return
    if (!userId) return
    let alive = true
    const handles: ListenerHandle[] = []

    ;(async () => {
      try {
        const capCore = require('@capacitor/core')
        const pushMod = require('@capacitor/push-notifications')
        const deviceMod = require('@capacitor/device')
        const Capacitor = capCore?.Capacitor
        const PushNotifications = pushMod?.PushNotifications
        const Device = deviceMod?.Device
        if (!Capacitor || !PushNotifications) return

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
            }).catch(() => {})
          } catch {}
        })
        if (registration?.remove) handles.push(registration)

        const regError = await PushNotifications.addListener('registrationError', () => {})
        if (regError?.remove) handles.push(regError)

        await PushNotifications.register().catch(() => {})
      } catch {}
    })()

    return () => {
      alive = false
      handles.forEach((h) => {
        try {
          h.remove()
        } catch {}
      })
    }
  }, [userId])
}
