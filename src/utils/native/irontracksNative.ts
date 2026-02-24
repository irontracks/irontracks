import { registerPlugin } from '@capacitor/core'
import { isIosNative } from '@/utils/platform'

type IronTracksNativePlugin = {
  setIdleTimerDisabled: (opts: { enabled: boolean }) => Promise<void>
  requestNotificationPermission: () => Promise<{ granted: boolean }>
  scheduleRestTimer: (opts: { id: string; seconds: number; title?: string; body?: string }) => Promise<void>
  cancelRestTimer: (opts: { id: string }) => Promise<void>
  startRestLiveActivity: (opts: { id: string; seconds: number; title?: string }) => Promise<void>
  endRestLiveActivity: (opts: { id: string }) => Promise<void>
}

const Native = registerPlugin<IronTracksNativePlugin>('IronTracksNative', {
  web: {
    setIdleTimerDisabled: async () => {},
    requestNotificationPermission: async () => ({ granted: false }),
    scheduleRestTimer: async () => {},
    cancelRestTimer: async () => {},
    startRestLiveActivity: async () => {},
    endRestLiveActivity: async () => {},
  },
})

export const setIdleTimerDisabled = async (enabled: boolean) => {
  try {
    if (!isIosNative()) return
    await Native.setIdleTimerDisabled({ enabled: Boolean(enabled) })
  } catch {}
}

export const requestNativeNotifications = async () => {
  try {
    if (!isIosNative()) return { granted: false }
    return await Native.requestNotificationPermission()
  } catch {
    return { granted: false }
  }
}

export const scheduleRestNotification = async (id: string, seconds: number, title?: string, body?: string) => {
  try {
    if (!isIosNative()) return
    const safeSeconds = Math.max(1, Math.round(Number(seconds) || 0))
    if (!safeSeconds) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    await Native.scheduleRestTimer({ id: safeId, seconds: safeSeconds, title, body })
  } catch {}
}

export const cancelRestNotification = async (id: string) => {
  try {
    if (!isIosNative()) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    await Native.cancelRestTimer({ id: safeId })
  } catch {}
}

export const startRestLiveActivity = async (id: string, seconds: number, title?: string) => {
  try {
    if (!isIosNative()) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    const safeSeconds = Math.max(1, Math.round(Number(seconds) || 0))
    if (!safeSeconds) return
    await Native.startRestLiveActivity({ id: safeId, seconds: safeSeconds, title })
  } catch {}
}

export const endRestLiveActivity = async (id: string) => {
  try {
    if (!isIosNative()) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    await Native.endRestLiveActivity({ id: safeId })
  } catch {}
}
