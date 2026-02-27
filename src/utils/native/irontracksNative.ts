import { registerPlugin } from '@capacitor/core'
import { isIosNative } from '@/utils/platform'

// ─── Plugin type ────────────────────────────────────────────────────────────

type IronTracksNativePlugin = {
  // Screen
  setIdleTimerDisabled: (opts: { enabled: boolean }) => Promise<void>
  openAppSettings: () => Promise<{ ok: boolean }>
  // Notifications
  requestNotificationPermission: () => Promise<{ granted: boolean }>
  checkNotificationPermission: () => Promise<{ status: string }>
  setupNotificationActions: () => Promise<void>
  scheduleRestTimer: (opts: { id: string; seconds: number; title?: string; body?: string; repeatCount?: number; repeatEverySeconds?: number }) => Promise<void>
  cancelRestTimer: (opts: { id: string }) => Promise<void>
  // Live Activity
  startRestLiveActivity: (opts: { id: string; seconds: number; title?: string }) => Promise<void>
  updateRestLiveActivity: (opts: { id: string; isFinished: boolean }) => Promise<void>
  endRestLiveActivity: (opts: { id: string }) => Promise<void>
  // Generic app notification
  scheduleAppNotification: (opts: { id?: string; title: string; body: string; delaySeconds?: number }) => Promise<{ id: string }>
  // Alarm sound
  stopAlarmSound: () => Promise<void>
  // Haptics
  triggerHaptic: (opts: { style: HapticStyle }) => Promise<void>
  // Biometrics
  checkBiometricsAvailable: () => Promise<{ available: boolean; biometryType: 'faceID' | 'touchID' | 'none' }>
  authenticateWithBiometrics: (opts: { reason?: string }) => Promise<{ success: boolean; error: string }>
  // Spotlight
  indexWorkout: (opts: { id: string; title: string; subtitle?: string; dateMs?: number }) => Promise<void>
  removeWorkoutIndex: (opts: { id: string }) => Promise<void>
  clearAllWorkoutIndexes: () => Promise<void>
  // Accelerometer
  startAccelerometer: (opts?: { intervalMs?: number }) => Promise<void>
  stopAccelerometer: () => Promise<void>
  // HealthKit
  isHealthKitAvailable: () => Promise<{ available: boolean }>
  requestHealthKitPermission: () => Promise<{ granted: boolean; error: string }>
  saveWorkoutToHealth: (opts: { startMs: number; endMs: number; calories?: number }) => Promise<{ saved: boolean; error: string }>
  getHealthSteps: () => Promise<{ steps: number }>
  // Photos
  saveImageToPhotos: (opts: { base64: string }) => Promise<{ saved: boolean; error: string }>
}

export type HapticStyle =
  | 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
  | 'success' | 'warning' | 'error' | 'selection'

// ─── Register plugin ─────────────────────────────────────────────────────────

const Native = registerPlugin<IronTracksNativePlugin>('IronTracksNative', {
  web: {
    setIdleTimerDisabled: async () => {},
    requestNotificationPermission: async () => ({ granted: false }),
    checkNotificationPermission: async () => ({ status: 'notDetermined' }),
    setupNotificationActions: async () => {},
    scheduleRestTimer: async () => {},
    cancelRestTimer: async () => {},
    startRestLiveActivity: async () => {},
    updateRestLiveActivity: async () => {},
    endRestLiveActivity: async () => {},
    scheduleAppNotification: async () => ({ id: '' }),
    stopAlarmSound: async () => {},
    triggerHaptic: async () => {},
    checkBiometricsAvailable: async () => ({ available: false, biometryType: 'none' as const }),
    authenticateWithBiometrics: async () => ({ success: false, error: 'Not available on web' }),
    indexWorkout: async () => {},
    removeWorkoutIndex: async () => {},
    clearAllWorkoutIndexes: async () => {},
    startAccelerometer: async () => {},
    stopAccelerometer: async () => {},
    isHealthKitAvailable: async () => ({ available: false }),
    requestHealthKitPermission: async () => ({ granted: false, error: 'Not available on web' }),
    saveWorkoutToHealth: async () => ({ saved: false, error: 'Not available on web' }),
    getHealthSteps: async () => ({ steps: 0 }),
    saveImageToPhotos: async () => ({ saved: false, error: 'Not available on web' }),
  },
})

// ─── Screen ──────────────────────────────────────────────────────────────────

export const setIdleTimerDisabled = async (enabled: boolean) => {
  try {
    if (!isIosNative()) return
    await Native.setIdleTimerDisabled({ enabled: Boolean(enabled) })
  } catch {}
}

export const openAppSettings = async () => {
  try {
    if (!isIosNative()) return { ok: false }
    return await Native.openAppSettings()
  } catch {
    return { ok: false }
  }
}

// ─── Notifications ────────────────────────────────────────────────────────────

export const requestNativeNotifications = async () => {
  try {
    if (!isIosNative()) return { granted: false }
    return await Native.requestNotificationPermission()
  } catch {
    return { granted: false }
  }
}

export const checkNativeNotificationPermission = async () => {
  try {
    if (!isIosNative()) return { status: 'notDetermined' }
    return await Native.checkNotificationPermission()
  } catch {
    return { status: 'notDetermined' }
  }
}

export const setupNativeNotificationActions = async () => {
  try {
    if (!isIosNative()) return
    await Native.setupNotificationActions()
  } catch {}
}

export const onNativeNotificationAction = (handler: (actionId: string) => void) => {
  if (!isIosNative()) return () => {}
  type ListenerHandle = { remove: () => void }
  type MaybePromise<T> = T | Promise<T>
  const isPromise = (v: unknown): v is Promise<ListenerHandle> => {
    if (!v || typeof v !== 'object') return false
    const then = (v as { then?: unknown }).then
    return typeof then === 'function'
  }
  const plugin = Native as unknown as {
    addListener?: (name: string, cb: (data: unknown) => void) => MaybePromise<ListenerHandle>
  }
  const listener = plugin.addListener?.('notificationAction', (payload: unknown) => {
    try {
      const obj = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
      const actionId = String(obj.actionId ?? '').trim()
      if (actionId) handler(actionId)
    } catch {}
  })
  return () => {
    try {
      if (!listener) return
      if (isPromise(listener)) {
        listener.then((x) => x?.remove?.()).catch(() => {})
      } else {
        listener.remove()
      }
    } catch {}
  }
}

export const scheduleRestNotification = async (
  id: string,
  seconds: number,
  title?: string,
  body?: string,
  repeatCount?: number,
  repeatEverySeconds?: number
) => {
  try {
    if (!isIosNative()) return
    const safeSeconds = Math.max(1, Math.round(Number(seconds) || 0))
    if (!safeSeconds) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    const safeRepeatCount = Math.max(0, Math.min(120, Math.round(Number(repeatCount) || 0)))
    const safeRepeatEverySeconds = Math.max(2, Math.min(30, Math.round(Number(repeatEverySeconds) || 5)))
    await Native.scheduleRestTimer({
      id: safeId,
      seconds: safeSeconds,
      title,
      body,
      repeatCount: safeRepeatCount,
      repeatEverySeconds: safeRepeatEverySeconds,
    })
  } catch {}
}

export const cancelRestNotification = async (id: string) => {
  try {
    if (!isIosNative()) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    await Native.cancelRestTimer({ id: safeId })
  } catch {}
}

// ─── Live Activity ────────────────────────────────────────────────────────────

export const startRestLiveActivity = async (id: string, seconds: number, title?: string) => {
  try {
    if (!isIosNative()) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    const safeSeconds = Math.max(1, Math.round(Number(seconds) || 0))
    if (!safeSeconds) return
    await Native.startRestLiveActivity({ id: safeId, seconds: safeSeconds, title })
  } catch {}
}

export const updateRestLiveActivity = async (id: string, isFinished: boolean) => {
  try {
    if (!isIosNative()) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    await Native.updateRestLiveActivity({ id: safeId, isFinished })
  } catch {}
}

export const endRestLiveActivity = async (id: string) => {
  try {
    if (!isIosNative()) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    await Native.endRestLiveActivity({ id: safeId })
  } catch {}
}

// ─── Generic App Notification ────────────────────────────────────────────────

export const scheduleAppNotification = async (opts: {
  id?: string
  title: string
  body: string
  delaySeconds?: number
}) => {
  try {
    if (!isIosNative()) return null
    const result = await Native.scheduleAppNotification(opts)
    return result?.id || null
  } catch {
    return null
  }
}

// ─── Alarm Sound ─────────────────────────────────────────────────────────────

export const stopAlarmSound = async () => {
  try {
    if (!isIosNative()) return
    await Native.stopAlarmSound()
  } catch {}
}

// ─── Haptics ──────────────────────────────────────────────────────────────────

export const triggerHaptic = async (style: HapticStyle = 'medium') => {
  try {
    if (!isIosNative()) return
    await Native.triggerHaptic({ style })
  } catch {}
}

// ─── Biometrics ───────────────────────────────────────────────────────────────

export const checkBiometricsAvailable = async () => {
  try {
    if (!isIosNative()) return { available: false, biometryType: 'none' as const }
    return await Native.checkBiometricsAvailable()
  } catch {
    return { available: false, biometryType: 'none' as const }
  }
}

export const authenticateWithBiometrics = async (reason?: string) => {
  try {
    if (!isIosNative()) return { success: false, error: 'Not available' }
    return await Native.authenticateWithBiometrics({ reason })
  } catch {
    return { success: false, error: 'Authentication failed' }
  }
}

// ─── Spotlight ────────────────────────────────────────────────────────────────

export const indexWorkoutInSpotlight = async (opts: {
  id: string
  title: string
  subtitle?: string
  dateMs?: number
}) => {
  try {
    if (!isIosNative()) return
    await Native.indexWorkout(opts)
  } catch {}
}

export const removeWorkoutFromSpotlight = async (id: string) => {
  try {
    if (!isIosNative()) return
    await Native.removeWorkoutIndex({ id })
  } catch {}
}

export const clearAllWorkoutsFromSpotlight = async () => {
  try {
    if (!isIosNative()) return
    await Native.clearAllWorkoutIndexes()
  } catch {}
}

// ─── Accelerometer ────────────────────────────────────────────────────────────

export const startAccelerometer = async (intervalMs = 100) => {
  try {
    if (!isIosNative()) return
    await Native.startAccelerometer({ intervalMs })
  } catch {}
}

export const stopAccelerometer = async () => {
  try {
    if (!isIosNative()) return
    await Native.stopAccelerometer()
  } catch {}
}

// ─── HealthKit ────────────────────────────────────────────────────────────────

export const isHealthKitAvailable = async () => {
  try {
    if (!isIosNative()) return false
    const { available } = await Native.isHealthKitAvailable()
    return available
  } catch {
    return false
  }
}

export const requestHealthKitPermission = async () => {
  try {
    if (!isIosNative()) return { granted: false, error: 'Not iOS native' }
    return await Native.requestHealthKitPermission()
  } catch {
    return { granted: false, error: 'Request failed' }
  }
}

export const saveWorkoutToHealth = async (opts: {
  startMs: number
  endMs: number
  calories?: number
}) => {
  try {
    if (!isIosNative()) return { saved: false, error: 'Not iOS native' }
    return await Native.saveWorkoutToHealth(opts)
  } catch {
    return { saved: false, error: 'Save failed' }
  }
}

export const getHealthSteps = async () => {
  try {
    if (!isIosNative()) return 0
    const { steps } = await Native.getHealthSteps()
    return steps
  } catch {
    return 0
  }
}

// ─── Photos ───────────────────────────────────────────────────────────────────

export const saveImageToPhotos = async (base64: string) => {
  try {
    if (!isIosNative()) return { saved: false, error: 'Not iOS native' }
    return await Native.saveImageToPhotos({ base64 })
  } catch {
    return { saved: false, error: 'Save failed' }
  }
}
