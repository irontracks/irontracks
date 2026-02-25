import { registerPlugin } from '@capacitor/core'
import { isIosNative } from '@/utils/platform'

// ─── Plugin type ────────────────────────────────────────────────────────────

type IronTracksNativePlugin = {
  // Screen
  setIdleTimerDisabled: (opts: { enabled: boolean }) => Promise<void>
  // Notifications
  requestNotificationPermission: () => Promise<{ granted: boolean }>
  checkNotificationPermission: () => Promise<{ status: string }>
  setupNotificationActions: () => Promise<void>
  scheduleRestTimer: (opts: { id: string; seconds: number; title?: string; body?: string }) => Promise<void>
  cancelRestTimer: (opts: { id: string }) => Promise<void>
  // Live Activity
  startRestLiveActivity: (opts: { id: string; seconds: number; title?: string }) => Promise<void>
  endRestLiveActivity: (opts: { id: string }) => Promise<void>
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
    endRestLiveActivity: async () => {},
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
  },
})

// ─── Screen ──────────────────────────────────────────────────────────────────

export const setIdleTimerDisabled = async (enabled: boolean) => {
  try {
    if (!isIosNative()) return
    await Native.setIdleTimerDisabled({ enabled: Boolean(enabled) })
  } catch {}
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

export const endRestLiveActivity = async (id: string) => {
  try {
    if (!isIosNative()) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    await Native.endRestLiveActivity({ id: safeId })
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
