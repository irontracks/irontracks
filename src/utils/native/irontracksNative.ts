import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import { isIosNative, isNativePlatform } from '@/utils/platform'

// ─── Plugin type ────────────────────────────────────────────────────────────

type IronTracksNativePlugin = {
  // Screen
  setIdleTimerDisabled: (opts: { enabled: boolean }) => Promise<void>
  openAppSettings: () => Promise<{ ok: boolean }>
  // Notifications
  requestNotificationPermission: () => Promise<{ granted: boolean }>
  checkNotificationPermission: () => Promise<{ status: string; timeSensitiveStatus?: string }>
  setupNotificationActions: () => Promise<void>
  scheduleRestTimer: (opts: { id: string; seconds: number; title?: string; body?: string; repeatCount?: number; repeatEverySeconds?: number }) => Promise<void>
  cancelRestTimer: (opts: { id: string }) => Promise<void>
  // Live Activity
  startRestLiveActivity: (opts: { id: string; seconds: number; title?: string; workoutStartMs?: number }) => Promise<void>
  updateRestLiveActivity: (opts: { id: string; isFinished: boolean; secondsRemaining?: number; targetSeconds?: number; endDateMs?: number }) => Promise<void>
  endRestLiveActivity: (opts: { id: string }) => Promise<void>
  endAllRestLiveActivities: () => Promise<void>
  // Generic app notification
  scheduleAppNotification: (opts: { id?: string; title: string; body: string; delaySeconds?: number }) => Promise<{ id: string }>
  // Alarm sound
  playAlarmSound: () => Promise<{ played?: boolean }>
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
  getHeartRate: () => Promise<{ bpm: number; timestamp: number }>
  getRestingHeartRate: () => Promise<{ bpm: number; timestamp: number }>
  getHRV: () => Promise<{ sdnn: number; timestamp: number }>
  getActiveCalories: () => Promise<{ calories: number }>
  // Photos
  saveImageToPhotos: (opts: { base64: string }) => Promise<{ saved: boolean; error: string }>
  saveFileToPhotos: (opts: { path: string; isVideo: boolean }) => Promise<{ saved: boolean; error: string }>
  // Voice
  requestVoicePermissions: () => Promise<{ microphone: string; speechRecognition: string }>
  startSpeechRecognition: (opts: { lang?: string }, callback: (result: { transcript?: string; isFinal?: boolean; error?: string; message?: string; code?: number }) => void) => Promise<string>
  stopSpeechRecognition: () => Promise<{ ok: boolean }>
  // Widget intent bridge
  checkPendingWidgetAction: () => Promise<{ action: string }>
  addListener(eventName: 'widgetStartSet', listenerFunc: () => void): Promise<PluginListenerHandle>
  // Story video composition (AVFoundation, iOS only — hardware H.264 via VideoToolbox)
  composeStoryVideo: (opts: {
    videoPath: string
    overlayPath: string
    outputWidth: number
    outputHeight: number
    trimStartSec: number
    trimEndSec: number
  }) => Promise<{ outputPath: string; durationSec: number; mime: string; error: string }>
  cancelStoryCompose: () => Promise<{ ok: boolean }>
  addListener(eventName: 'storyComposeProgress', listenerFunc: (data: { progress: number }) => void): Promise<PluginListenerHandle>
  // App Store review prompt (SKStoreReviewController — iOS enforces 3/year limit)
  requestStoreReview: () => Promise<void>
  // HealthKit sleep data (last 24 h window)
  getSleepData: () => Promise<{
    totalMinutes: number
    asleepMinutes: number
    inBedMinutes: number
    startMs: number
    endMs: number
  }>
  // Workout-session Live Activity (Dynamic Island + Lock Screen)
  startWorkoutLiveActivity: (opts: {
    workoutName: string
    workoutStartMs: number
    currentExerciseName?: string
    currentSetIndex?: number
    totalSetsForExercise?: number
    totalSetsCompleted?: number
    totalVolumeKg?: number
  }) => Promise<{ activityId: string }>
  updateWorkoutLiveActivity: (opts: {
    currentExerciseName?: string
    currentSetIndex?: number
    totalSetsForExercise?: number
    totalSetsCompleted?: number
    totalVolumeKg?: number
  }) => Promise<void>
  updateWorkoutRestCountdown: (opts: { restEndMs: number }) => Promise<void>
  endWorkoutLiveActivity: () => Promise<void>
  // App Intents (Siri shortcuts) — pending action triggered by Siri/Shortcuts
  checkPendingIntentAction: () => Promise<{ action: string }>
  addListener(eventName: 'intentAction', listenerFunc: (data: { action: string }) => void): Promise<PluginListenerHandle>
  // Geofencing — gym auto check-in
  startGymGeofence: (opts: { lat: number; lng: number; radius?: number; name: string }) => Promise<{ ok: boolean; error?: string }>
  stopGymGeofence: () => Promise<{ ok: boolean }>
  checkGeofenceStatus: () => Promise<{ active: boolean; authorization: string; gymName: string }>
  requestAlwaysLocationPermission: () => Promise<{ status: string }>
  addListener(eventName: 'gymGeofenceEntered', listenerFunc: (data: { gymName: string }) => void): Promise<PluginListenerHandle>
  // Cardio GPS — continuous background location (run/bike tracking)
  startCardioLocation: () => Promise<{ ok: boolean; authorization?: string }>
  stopCardioLocation: () => Promise<{ points: NativeCardioFix[] }>
  drainCardioLocations: () => Promise<{ points: NativeCardioFix[] }>
  // BGTaskScheduler — schedule next refresh / sync windows
  scheduleBackgroundTasks: () => Promise<{ ok: boolean }>
  addListener(eventName: 'backgroundRefresh', listenerFunc: (data: { kind: 'refresh' | 'sync' }) => void): Promise<PluginListenerHandle>
  // Live Activity push tokens (Feature 11)
  getLiveActivityPushTokens: () => Promise<{ tokens: Array<{ kind: string; token: string }> }>
  addListener(eventName: 'liveActivityPushToken', listenerFunc: (data: { kind: string; activityId: string; token: string }) => void): Promise<PluginListenerHandle>
  // SQLite3 native cache (Feature 16)
  kvGet: (opts: { key: string }) => Promise<{ value: string | null; exists: boolean }>
  kvSet: (opts: { key: string; value: string }) => Promise<{ ok: boolean }>
  kvDelete: (opts: { key: string }) => Promise<{ ok: boolean }>
  kvKeys: (opts?: { prefix?: string; limit?: number }) => Promise<{ keys: string[] }>
  queuePut: (opts: {
    id: string
    payload: string
    status?: string
    attempts?: number
    nextAttemptAt?: number
  }) => Promise<{ ok: boolean }>
  queueGetAll: (opts?: { limit?: number }) => Promise<{ payloads: string[] }>
  queueDelete: (opts: { id: string }) => Promise<{ ok: boolean }>
  queueClear: () => Promise<{ ok: boolean }>
  kvStoreStats: () => Promise<{ available: boolean; kvCount?: number; queueCount?: number; sizeBytes?: number }>
  // Watch (WatchConnectivity)
  watchGetState: () => Promise<{ isPaired: boolean | string; isReachable: boolean | string; isWatchAppInstalled: boolean | string; isSupported: boolean | string }>
  watchSendDashboard: (opts: { json: string }) => Promise<{ ok: boolean }>
  watchSendWorkout: (opts: { json: string }) => Promise<{ ok: boolean }>
  watchSendNearestGyms: (opts: { json: string }) => Promise<{ ok: boolean }>
  addListener(eventName: 'watchSetLogged', listenerFunc: (data: { payload: string }) => void): Promise<PluginListenerHandle>
  addListener(eventName: 'watchCardioFinished', listenerFunc: (data: { payload: string }) => void): Promise<PluginListenerHandle>
  addListener(eventName: 'watchRefreshRequested', listenerFunc: () => void): Promise<PluginListenerHandle>
  addListener(eventName: 'watchCheckinRequested', listenerFunc: (data: { payload: string }) => void): Promise<PluginListenerHandle>
  addListener(eventName: 'watchReachabilityChanged', listenerFunc: (data: Record<string, string>) => void): Promise<PluginListenerHandle>
}

export type HapticStyle =
  | 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
  | 'success' | 'warning' | 'error' | 'selection'

/** A single GPS fix as delivered by the native cardio location manager. */
export interface NativeCardioFix {
  lat: number
  lng: number
  /** Horizontal accuracy in meters (lower is better). */
  accuracy: number
  /** Altitude in meters. */
  altitude: number
  /** Speed in m/s (-1 when unavailable). */
  speed: number
  /** Course/heading in degrees (-1 when unavailable). */
  heading: number
  /** Unix ms the fix was produced. */
  timestamp: number
}

// ─── Web / fallback implementation ───────────────────────────────────────────

const webFallback: IronTracksNativePlugin = {
  setIdleTimerDisabled: async () => { },
  openAppSettings: async () => ({ ok: false }),
  requestNotificationPermission: async () => ({ granted: false }),
  checkNotificationPermission: async () => ({ status: 'notDetermined', timeSensitiveStatus: undefined }),
  setupNotificationActions: async () => { },
  scheduleRestTimer: async () => { },
  cancelRestTimer: async () => { },
  startRestLiveActivity: async () => { },
  updateRestLiveActivity: async () => { },
  endRestLiveActivity: async () => { },
  endAllRestLiveActivities: async () => { },
  scheduleAppNotification: async () => ({ id: '' }),
  playAlarmSound: async () => ({ played: false }),
  stopAlarmSound: async () => { },
  triggerHaptic: async () => { },
  checkBiometricsAvailable: async () => ({ available: false, biometryType: 'none' as const }),
  authenticateWithBiometrics: async () => ({ success: false, error: 'Not available on web' }),
  indexWorkout: async () => { },
  removeWorkoutIndex: async () => { },
  clearAllWorkoutIndexes: async () => { },
  startAccelerometer: async () => { },
  stopAccelerometer: async () => { },
  isHealthKitAvailable: async () => ({ available: false }),
  requestHealthKitPermission: async () => ({ granted: false, error: 'Not available on web' }),
  saveWorkoutToHealth: async () => ({ saved: false, error: 'Not available on web' }),
  getHealthSteps: async () => ({ steps: 0 }),
  getHeartRate: async () => ({ bpm: 0, timestamp: 0 }),
  getRestingHeartRate: async () => ({ bpm: 0, timestamp: 0 }),
  getHRV: async () => ({ sdnn: 0, timestamp: 0 }),
  getActiveCalories: async () => ({ calories: 0 }),
  saveImageToPhotos: async () => ({ saved: false, error: 'Not available on web' }),
  saveFileToPhotos: async () => ({ saved: false, error: 'Not available on web' }),
  requestVoicePermissions: async () => ({ microphone: 'granted', speechRecognition: 'granted' }),
  startSpeechRecognition: async () => '',
  stopSpeechRecognition: async () => ({ ok: false }),
  checkPendingWidgetAction: async () => ({ action: '' }),
  addListener: async () => ({ remove: async () => {} }),
  composeStoryVideo: async () => ({ outputPath: '', durationSec: 0, mime: '', error: 'Not available on web' }),
  cancelStoryCompose: async () => ({ ok: false }),
  requestStoreReview: async () => { },
  getSleepData: async () => ({ totalMinutes: 0, asleepMinutes: 0, inBedMinutes: 0, startMs: 0, endMs: 0 }),
  startWorkoutLiveActivity: async () => ({ activityId: '' }),
  updateWorkoutLiveActivity: async () => { },
  updateWorkoutRestCountdown: async () => { },
  endWorkoutLiveActivity: async () => { },
  checkPendingIntentAction: async () => ({ action: '' }),
  startGymGeofence: async () => ({ ok: false }),
  stopGymGeofence: async () => ({ ok: false }),
  checkGeofenceStatus: async () => ({ active: false, authorization: 'denied', gymName: '' }),
  requestAlwaysLocationPermission: async () => ({ status: 'denied' }),
  startCardioLocation: async () => ({ ok: false }),
  stopCardioLocation: async () => ({ points: [] }),
  drainCardioLocations: async () => ({ points: [] }),
  scheduleBackgroundTasks: async () => ({ ok: false }),
  getLiveActivityPushTokens: async () => ({ tokens: [] }),
  kvGet: async () => ({ value: null, exists: false }),
  kvSet: async () => ({ ok: false }),
  kvDelete: async () => ({ ok: false }),
  kvKeys: async () => ({ keys: [] }),
  queuePut: async () => ({ ok: false }),
  queueGetAll: async () => ({ payloads: [] }),
  queueDelete: async () => ({ ok: false }),
  queueClear: async () => ({ ok: false }),
  kvStoreStats: async () => ({ available: false }),
  // Watch (WatchConnectivity) — sem-op no web/Android
  watchGetState: async () => ({ isPaired: false, isReachable: false, isWatchAppInstalled: false, isSupported: false }),
  watchSendDashboard: async () => ({ ok: false }),
  watchSendWorkout: async () => ({ ok: false }),
  watchSendNearestGyms: async () => ({ ok: false }),
}

// ─── Register plugin ─────────────────────────────────────────────────────────
// Wrapped in try/catch: on iOS, registerPlugin can throw synchronously if the
// native bridge isn't ready yet, which would cause an unhandled rejection and
// crash module initialisation. Falling back to webFallback keeps all callers safe.

let Native: IronTracksNativePlugin
try {
  Native = registerPlugin<IronTracksNativePlugin>('IronTracksNative', {
    web: webFallback,
  })
} catch {
  Native = webFallback
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export const setIdleTimerDisabled = async (enabled: boolean) => {
  try {
    if (!isNativePlatform()) return
    await Native.setIdleTimerDisabled({ enabled: Boolean(enabled) })
  } catch { }
}

export const openAppSettings = async () => {
  try {
    if (!isNativePlatform()) return { ok: false }
    return await Native.openAppSettings()
  } catch {
    return { ok: false }
  }
}

// ─── Cardio GPS (continuous background location — iOS + Android native) ───────
//
// iOS: CLLocationManager em background (IronTracksNativePlugin.swift).
// Android: CardioLocationService (foreground service + FusedLocationProvider).
// No web, estas funções são no-op e o cardio cai no fallback @capacitor/geolocation.

/** True quando o tracker nativo de cardio está disponível (iOS ou Android nativo). */
export const isNativeCardioLocationAvailable = (): boolean => isNativePlatform()

/** Inicia o tracking nativo (background). Resolve ok:false se indisponível/negado. */
export const startNativeCardioLocation = async (): Promise<{ ok: boolean; authorization?: string }> => {
  try {
    if (!isNativePlatform()) return { ok: false }
    return await Native.startCardioLocation()
  } catch {
    return { ok: false }
  }
}

/** Para o tracking nativo e devolve os pontos ainda em buffer. */
export const stopNativeCardioLocation = async (): Promise<NativeCardioFix[]> => {
  try {
    if (!isNativePlatform()) return []
    const res = await Native.stopCardioLocation()
    return Array.isArray(res?.points) ? res.points : []
  } catch {
    return []
  }
}

/** Drena (retorna + limpa) os fixes bufferizados nativamente desde a última chamada. */
export const drainNativeCardioLocations = async (): Promise<NativeCardioFix[]> => {
  try {
    if (!isNativePlatform()) return []
    const res = await Native.drainCardioLocations()
    return Array.isArray(res?.points) ? res.points : []
  } catch {
    return []
  }
}

// ─── Notifications ────────────────────────────────────────────────────────────

export const requestNativeNotifications = async () => {
  try {
    if (!isNativePlatform()) return { granted: false }
    return await Native.requestNotificationPermission()
  } catch {
    return { granted: false }
  }
}

export const checkNativeNotificationPermission = async (): Promise<{ status: string; timeSensitiveStatus?: string }> => {
  try {
    if (!isNativePlatform()) return { status: 'notDetermined' }
    return await Native.checkNotificationPermission()
  } catch {
    return { status: 'notDetermined' }
  }
}

export const setupNativeNotificationActions = async () => {
  try {
    if (!isNativePlatform()) return
    await Native.setupNotificationActions()
  } catch { }
}

export const onNativeNotificationAction = (handler: (actionId: string) => void) => {
  if (!isNativePlatform()) return () => { }
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
    } catch { }
  })
  return () => {
    try {
      if (!listener) return
      if (isPromise(listener)) {
        listener.then((x) => x?.remove?.()).catch(() => { })
      } else {
        listener.remove()
      }
    } catch { }
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
    if (!isNativePlatform()) return
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
  } catch { }
}

export const cancelRestNotification = async (id: string) => {
  try {
    if (!isNativePlatform()) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    await Native.cancelRestTimer({ id: safeId })
  } catch { }
}

// ─── Live Activity ────────────────────────────────────────────────────────────

export const startRestLiveActivity = async (id: string, seconds: number, title?: string, workoutStartMs?: number) => {
  try {
    if (!isIosNative()) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    const safeSeconds = Math.max(1, Math.round(Number(seconds) || 0))
    if (!safeSeconds) return
    await Native.startRestLiveActivity({ id: safeId, seconds: safeSeconds, title, workoutStartMs: workoutStartMs ?? 0 })
  } catch { }
}

export const updateRestLiveActivity = async (
  id: string,
  isFinished: boolean,
  secondsRemaining?: number,
  targetSeconds?: number,
  endDateMs?: number,
) => {
  try {
    if (!isIosNative()) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    await Native.updateRestLiveActivity({ id: safeId, isFinished, secondsRemaining, targetSeconds, endDateMs })
  } catch { }
}

export const endRestLiveActivity = async (id: string) => {
  try {
    if (!isIosNative()) return
    const safeId = String(id || 'rest_timer').trim() || 'rest_timer'
    await Native.endRestLiveActivity({ id: safeId })
  } catch { }
}

export const endAllRestLiveActivities = async () => {
  try {
    if (!isIosNative()) return
    await Native.endAllRestLiveActivities()
  } catch { }
}

// ─── Workout Live Activity (session-level) ────────────────────────────────────

export interface WorkoutLiveActivityState {
  workoutName: string
  workoutStartMs: number
  currentExerciseName?: string
  currentSetIndex?: number
  totalSetsForExercise?: number
  totalSetsCompleted?: number
  totalVolumeKg?: number
}

/** Start the workout Live Activity. Returns the activityId or empty string on failure. */
export const startWorkoutLiveActivity = async (state: WorkoutLiveActivityState): Promise<string> => {
  try {
    if (!isIosNative()) return ''
    const safeName = String(state.workoutName || 'Treino').slice(0, 60)
    const startMs = Math.max(0, Math.round(Number(state.workoutStartMs) || Date.now()))
    const result = await Native.startWorkoutLiveActivity({
      workoutName: safeName,
      workoutStartMs: startMs,
      currentExerciseName: String(state.currentExerciseName ?? '').slice(0, 50),
      currentSetIndex: Math.max(1, Math.round(Number(state.currentSetIndex) || 1)),
      totalSetsForExercise: Math.max(0, Math.round(Number(state.totalSetsForExercise) || 0)),
      totalSetsCompleted: Math.max(0, Math.round(Number(state.totalSetsCompleted) || 0)),
      totalVolumeKg: Math.max(0, Number(state.totalVolumeKg) || 0),
    })
    return String(result?.activityId || '')
  } catch {
    return ''
  }
}

/** Update the workout Live Activity. No-op when there isn't one running. */
export const updateWorkoutLiveActivity = async (
  patch: Omit<WorkoutLiveActivityState, 'workoutName' | 'workoutStartMs'>,
): Promise<void> => {
  try {
    if (!isIosNative()) return
    await Native.updateWorkoutLiveActivity({
      currentExerciseName: String(patch.currentExerciseName ?? '').slice(0, 50),
      currentSetIndex: Math.max(1, Math.round(Number(patch.currentSetIndex) || 1)),
      totalSetsForExercise: Math.max(0, Math.round(Number(patch.totalSetsForExercise) || 0)),
      totalSetsCompleted: Math.max(0, Math.round(Number(patch.totalSetsCompleted) || 0)),
      totalVolumeKg: Math.max(0, Number(patch.totalVolumeKg) || 0),
    })
  } catch { /* swallow */ }
}

/** Liga/desliga o countdown de descanso na ilha do TREINO (compact leading).
 *  restEndMs = timestamp epoch (ms) do fim do descanso; 0 limpa. No-op na web. */
export const updateWorkoutRestCountdown = async (restEndMs: number): Promise<void> => {
  try {
    if (!isIosNative()) return
    await Native.updateWorkoutRestCountdown({ restEndMs: Math.max(0, Number(restEndMs) || 0) })
  } catch { /* swallow */ }
}

export const endWorkoutLiveActivity = async (): Promise<void> => {
  try {
    if (!isIosNative()) return
    await Native.endWorkoutLiveActivity()
  } catch { /* swallow */ }
}

// ─── App Intents (Siri Shortcuts) ─────────────────────────────────────────────

export type IntentAction = 'startWorkout' | 'openLastWorkout' | 'checkStreak' | 'openHistory' | ''

/**
 * Reads and clears the pending App Intent action set by Siri / Shortcuts.
 * Call on app bootstrap as a cold-start fallback (the listener below catches
 * warm-start cases automatically).
 */
export const checkPendingIntentAction = async (): Promise<IntentAction> => {
  try {
    if (!isIosNative()) return ''
    const r = await Native.checkPendingIntentAction()
    const a = String(r?.action || '')
    if (a === 'startWorkout' || a === 'openLastWorkout' || a === 'checkStreak' || a === 'openHistory') {
      return a
    }
    return ''
  } catch {
    return ''
  }
}

/** Subscribes to "intentAction" events fired when an App Intent runs while the
 * app is already in memory. Returns an unsubscribe function. */
export const addIntentActionListener = (handler: (action: IntentAction) => void): (() => void) => {
  if (!isIosNative()) return () => { }
  try {
    const listenerPromise = Native.addListener('intentAction', (data: { action: string }) => {
      try {
        const a = String(data?.action ?? '')
        if (a === 'startWorkout' || a === 'openLastWorkout' || a === 'checkStreak' || a === 'openHistory') {
          handler(a)
        }
      } catch { /* swallow */ }
    })
    listenerPromise.catch(() => { }) // neutraliza rejeição solta (ex.: plugin ausente em binário nativo antigo)
    return () => { listenerPromise.then((l: PluginListenerHandle) => l.remove()).catch(() => { }) }
  } catch {
    return () => { }
  }
}

// ─── Generic App Notification ────────────────────────────────────────────────

export const scheduleAppNotification = async (opts: {
  id?: string
  title: string
  body: string
  delaySeconds?: number
}) => {
  try {
    if (!isNativePlatform()) return null
    const result = await Native.scheduleAppNotification(opts)
    return result?.id || null
  } catch {
    return null
  }
}

// ─── Alarm Sound ─────────────────────────────────────────────────────────────

export const playAlarmSound = async (): Promise<boolean> => {
  try {
    if (!isNativePlatform()) return false
    const res = await Native.playAlarmSound()
    return !!(res && (res as { played?: boolean }).played)
  } catch {
    return false // build sem o método → fallback pro beep in-JS
  }
}

export const stopAlarmSound = async () => {
  try {
    if (!isNativePlatform()) return
    await Native.stopAlarmSound()
  } catch { }
}

// ─── Haptics ──────────────────────────────────────────────────────────────────

export const triggerHaptic = async (style: HapticStyle = 'medium') => {
  try {
    if (!isNativePlatform()) return
    await Native.triggerHaptic({ style })
  } catch { }
}

// ─── Biometrics ───────────────────────────────────────────────────────────────

export const checkBiometricsAvailable = async () => {
  try {
    if (!isNativePlatform()) return { available: false, biometryType: 'none' as const }
    return await Native.checkBiometricsAvailable()
  } catch {
    return { available: false, biometryType: 'none' as const }
  }
}

export const authenticateWithBiometrics = async (reason?: string) => {
  try {
    if (!isNativePlatform()) return { success: false, error: 'Not available' }
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
  } catch { }
}

export const removeWorkoutFromSpotlight = async (id: string) => {
  try {
    if (!isIosNative()) return
    await Native.removeWorkoutIndex({ id })
  } catch { }
}

export const clearAllWorkoutsFromSpotlight = async () => {
  try {
    if (!isIosNative()) return
    await Native.clearAllWorkoutIndexes()
  } catch { }
}

// ─── Accelerometer ────────────────────────────────────────────────────────────

export const startAccelerometer = async (intervalMs = 100) => {
  try {
    if (!isNativePlatform()) return
    await Native.startAccelerometer({ intervalMs })
  } catch { }
}

export const stopAccelerometer = async () => {
  try {
    if (!isNativePlatform()) return
    await Native.stopAccelerometer()
  } catch { }
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

export const getHeartRate = async () => {
  try {
    if (!isIosNative()) return { bpm: 0, timestamp: 0 }
    return await Native.getHeartRate()
  } catch {
    return { bpm: 0, timestamp: 0 }
  }
}

export const getRestingHeartRate = async () => {
  try {
    if (!isIosNative()) return { bpm: 0, timestamp: 0 }
    return await Native.getRestingHeartRate()
  } catch {
    return { bpm: 0, timestamp: 0 }
  }
}

export const getHRV = async () => {
  try {
    if (!isIosNative()) return { sdnn: 0, timestamp: 0 }
    return await Native.getHRV()
  } catch {
    return { sdnn: 0, timestamp: 0 }
  }
}

export const getActiveCalories = async () => {
  try {
    if (!isIosNative()) return 0
    const { calories } = await Native.getActiveCalories()
    return calories
  } catch {
    return 0
  }
}

// ─── Photos ───────────────────────────────────────────────────────────────────

export const saveImageToPhotos = async (base64: string) => {
  try {
    if (!isNativePlatform()) return { saved: false, error: 'Not native' }
    return await Native.saveImageToPhotos({ base64 })
  } catch {
    return { saved: false, error: 'Save failed' }
  }
}

// ─── Voice ────────────────────────────────────────────────────────────────────

/**
 * Requests microphone AND speech recognition permissions from iOS.
 * Both are required for webkitSpeechRecognition to work in WKWebView.
 * On non-native platforms returns 'granted' so the web path is unblocked.
 */
export const requestVoicePermissions = async () => {
  try {
    if (!isIosNative()) return { microphone: 'granted', speechRecognition: 'granted' }
    return await Native.requestVoicePermissions()
  } catch {
    return { microphone: 'undetermined', speechRecognition: 'undetermined' }
  }
}

/**
 * Start native speech recognition via SFSpeechRecognizer on iOS.
 * Returns partial/final transcripts via callback. Falls back to false on non-native.
 */
export const startNativeSpeechRecognition = async (
  lang: string,
  onResult: (transcript: string, isFinal: boolean) => void,
  onError: (error: string) => void,
): Promise<boolean> => {
  try {
    if (!isIosNative()) return false
    await Native.startSpeechRecognition({ lang }, (result) => {
      if (result.error) {
        onError(result.message || result.error)
        return
      }
      if (result.transcript !== undefined) {
        onResult(result.transcript, !!result.isFinal)
      }
    })
    return true
  } catch {
    return false
  }
}

export const stopNativeSpeechRecognition = async () => {
  try {
    if (!isIosNative()) return
    await Native.stopSpeechRecognition()
  } catch { /* silent */ }
}

// ─── Photos ───────────────────────────────────────────────────────────────────

/** Write a Blob to a temp file via Capacitor Filesystem and save to camera roll.
 *  Avoids base64 round-trip through JS — significantly faster for large files. */
export const saveBlobToPhotos = async (blob: Blob, filename: string, isVideo: boolean): Promise<{ saved: boolean; error: string }> => {
  try {
    if (!isNativePlatform()) return { saved: false, error: 'Not native' }

    const { Filesystem, Directory } = await import('@capacitor/filesystem')

    // Convert Blob → base64 in chunks via ArrayBuffer (faster than FileReader for the FS write)
    const buffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    const base64Data = btoa(binary)

    // Write to Cache directory (auto-cleaned by iOS)
    const tempPath = `irontracks_temp_${Date.now()}_${filename}`
    const writeResult = await Filesystem.writeFile({
      path: tempPath,
      data: base64Data,
      directory: Directory.Cache,
    })

    // Extract the native file path from the URI
    let nativePath = writeResult.uri
    if (nativePath.startsWith('file://')) {
      nativePath = nativePath.replace('file://', '')
    }

    // Call native Swift to save from file path (no JS base64 bridge overhead)
    const result = await Native.saveFileToPhotos({ path: nativePath, isVideo })

    // Cleanup temp file (Swift also cleans up, but belt-and-suspenders)
    try { await Filesystem.deleteFile({ path: tempPath, directory: Directory.Cache }) } catch { /* already deleted by Swift */ }

    return result
  } catch {
    return { saved: false, error: 'Save via file failed' }
  }
}

// ─── Widget intent bridge ─────────────────────────────────────────────────────

/**
 * Reads and clears the UserDefaults flag written by StartSetIntent.perform().
 * Returns "startSet" if the user tapped "PULAR DESCANSO" / "INICIAR SÉRIE"
 * on the lock screen and the event hasn't been consumed yet.
 * Call this on RestTimerOverlay mount as a cold-start fallback.
 */
export const checkPendingWidgetAction = async (): Promise<string> => {
  try {
    if (!isIosNative()) return ''
    const result = await Native.checkPendingWidgetAction()
    return String(result?.action || '')
  } catch { return '' }
}

/**
 * Subscribes to the "widgetStartSet" Capacitor event emitted when
 * IronTracksNativePlugin receives the NotificationCenter notification from
 * StartSetIntent.perform() (background→foreground path).
 * Returns an unsubscribe function.
 */
export const addWidgetStartSetListener = (callback: () => void): (() => void) => {
  if (!isIosNative()) return () => {}
  try {
    const listenerPromise = Native.addListener('widgetStartSet', callback)
    listenerPromise.catch(() => {}) // neutraliza rejeição solta (ex.: plugin ausente em binário nativo antigo)
    return () => { listenerPromise.then((l: PluginListenerHandle) => l.remove()).catch(() => {}) }
  } catch { return () => {} }
}

// ─── Story Video Composition (iOS native, AVFoundation) ───────────────────────

/**
 * Composites a transparent overlay PNG onto a source video using AVFoundation.
 * Runs entirely outside WKWebView via VideoToolbox (hardware H.264).
 * iOS native only — caller must check `isIosNative()` and provide a fallback.
 */
export const composeStoryVideoNative = async (opts: {
  videoPath: string
  overlayPath: string
  outputWidth: number
  outputHeight: number
  trimStartSec: number
  trimEndSec: number
}): Promise<{ outputPath: string; durationSec: number; mime: string; error: string }> => {
  if (!isIosNative()) {
    return { outputPath: '', durationSec: 0, mime: '', error: 'Not iOS native' }
  }
  try {
    return await Native.composeStoryVideo(opts)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'compose_failed'
    return { outputPath: '', durationSec: 0, mime: '', error: msg }
  }
}

export const cancelStoryComposeNative = async () => {
  try {
    if (!isIosNative()) return { ok: false }
    return await Native.cancelStoryCompose()
  } catch {
    return { ok: false }
  }
}

// ─── App Store Review ─────────────────────────────────────────────────────────

/**
 * Requests an in-app App Store review via SKStoreReviewController.
 * Apple limits this to 3 prompts per 365 days — safe to call at key milestones.
 * No-op on web / Android / sandbox builds (Apple silently suppresses there too).
 */
export const requestNativeReview = async (): Promise<void> => {
  try {
    if (!isIosNative()) return
    await Native.requestStoreReview()
  } catch { /* swallow — non-critical */ }
}

// ─── HealthKit Sleep ──────────────────────────────────────────────────────────

export interface SleepData {
  /** Total minutes actually asleep (sum of Core/Deep/REM/Unspecified stages). */
  totalMinutes: number
  /** Same as totalMinutes for watchOS 9+ multi-stage breakdown. */
  asleepMinutes: number
  /** Total minutes recorded as "in bed" (older watch firmware). */
  inBedMinutes: number
  /** Unix-ms of first sleep sample start. */
  startMs: number
  /** Unix-ms of last sleep sample end. */
  endMs: number
}

const EMPTY_SLEEP: SleepData = { totalMinutes: 0, asleepMinutes: 0, inBedMinutes: 0, startMs: 0, endMs: 0 }

export const getSleepData = async (): Promise<SleepData> => {
  try {
    if (!isIosNative()) return EMPTY_SLEEP
    return await Native.getSleepData()
  } catch {
    return EMPTY_SLEEP
  }
}

// ─── Geofencing — gym auto check-in (Feature 6) ───────────────────────────────

export interface GeofenceStatus {
  active: boolean
  authorization: 'authorizedAlways' | 'authorizedWhenInUse' | 'denied' | 'restricted' | 'notDetermined' | 'unknown'
  gymName: string
}

/** Requests CLAuthorizationStatus.authorizedAlways. Two-prompt flow on iOS. */
export const requestAlwaysLocationPermission = async (): Promise<string> => {
  try {
    if (!isIosNative()) return 'denied'
    const r = await Native.requestAlwaysLocationPermission()
    return String(r?.status || 'denied')
  } catch { return 'denied' }
}

export const startGymGeofence = async (opts: {
  lat: number
  lng: number
  radius?: number
  name: string
}): Promise<{ ok: boolean; error?: string }> => {
  try {
    if (!isIosNative()) return { ok: false, error: 'not_ios' }
    if (!Number.isFinite(opts.lat) || !Number.isFinite(opts.lng) || !opts.lat || !opts.lng) {
      return { ok: false, error: 'invalid_coords' }
    }
    return await Native.startGymGeofence({
      lat: Number(opts.lat),
      lng: Number(opts.lng),
      radius: Math.max(50, Math.min(500, Number(opts.radius) || 120)),
      name: String(opts.name || 'Academia').slice(0, 60),
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

export const stopGymGeofence = async (): Promise<boolean> => {
  try {
    if (!isIosNative()) return false
    const r = await Native.stopGymGeofence()
    return !!r?.ok
  } catch { return false }
}

export const checkGeofenceStatus = async (): Promise<GeofenceStatus> => {
  try {
    if (!isIosNative()) return { active: false, authorization: 'denied', gymName: '' }
    const r = await Native.checkGeofenceStatus()
    return {
      active: !!r?.active,
      authorization: (r?.authorization as GeofenceStatus['authorization']) || 'unknown',
      gymName: String(r?.gymName || ''),
    }
  } catch { return { active: false, authorization: 'denied', gymName: '' } }
}

/** Subscribes to didEnterRegion firings. Fires only when app is in memory — when
 * the app is killed iOS shows the local notification scheduled by the plugin. */
export const addGymGeofenceListener = (callback: (gymName: string) => void): (() => void) => {
  if (!isIosNative()) return () => { }
  try {
    const listenerPromise = Native.addListener('gymGeofenceEntered', (data: { gymName: string }) => {
      try { callback(String(data?.gymName || '')) } catch { /* swallow */ }
    })
    listenerPromise.catch(() => { }) // neutraliza rejeição solta (ex.: plugin ausente em binário nativo antigo)
    return () => { listenerPromise.then((l: PluginListenerHandle) => l.remove()).catch(() => { }) }
  } catch { return () => { } }
}

// ─── BGTaskScheduler (Feature 15) ─────────────────────────────────────────────

/** Schedules the next opportunistic background refresh + sync. Call when the
 *  app goes to background (visibilitychange) so iOS knows when we want a slot. */
export const scheduleBackgroundTasks = async (): Promise<boolean> => {
  try {
    if (!isIosNative()) return false
    const r = await Native.scheduleBackgroundTasks()
    return !!r?.ok
  } catch { return false }
}

/** Fires when iOS gives us a BGAppRefresh / BGProcessing slot. Use to flush the
 *  offline queue, refetch streak data, etc. Returns unsubscribe function. */
export const addBackgroundRefreshListener = (
  callback: (kind: 'refresh' | 'sync') => void,
): (() => void) => {
  if (!isIosNative()) return () => { }
  try {
    const listenerPromise = Native.addListener('backgroundRefresh', (data: { kind: 'refresh' | 'sync' }) => {
      try { callback(data?.kind === 'sync' ? 'sync' : 'refresh') } catch { /* swallow */ }
    })
    listenerPromise.catch(() => { }) // neutraliza rejeição solta (ex.: plugin ausente em binário nativo antigo)
    return () => { listenerPromise.then((l: PluginListenerHandle) => l.remove()).catch(() => { }) }
  } catch { return () => { } }
}

// ─── Live Activity push tokens (Feature 11) ───────────────────────────────────

export interface LiveActivityPushToken {
  kind: string         // 'rest' | 'workout' | …
  activityId?: string
  token: string        // hex string ready for APNs apns-topic header
}

/** Snapshot of all currently active LA push tokens. Useful on resume. */
export const getLiveActivityPushTokens = async (): Promise<LiveActivityPushToken[]> => {
  try {
    if (!isIosNative()) return []
    const r = await Native.getLiveActivityPushTokens()
    return Array.isArray(r?.tokens) ? r.tokens : []
  } catch { return [] }
}

/** Subscribe to push-token rotation events (Apple rotates these periodically). */
export const addLiveActivityPushTokenListener = (
  callback: (token: LiveActivityPushToken) => void,
): (() => void) => {
  if (!isIosNative()) return () => { }
  try {
    const listenerPromise = Native.addListener(
      'liveActivityPushToken',
      (data: { kind: string; activityId: string; token: string }) => {
        try {
          if (data?.token) {
            callback({
              kind: String(data.kind || ''),
              activityId: String(data.activityId || ''),
              token: String(data.token),
            })
          }
        } catch { /* swallow */ }
      },
    )
    listenerPromise.catch(() => { }) // neutraliza rejeição solta (ex.: plugin ausente em binário nativo antigo)
    return () => { listenerPromise.then((l: PluginListenerHandle) => l.remove()).catch(() => { }) }
  } catch { return () => { } }
}

// ─── Native SQLite3 cache (Feature 16) ────────────────────────────────────────
//
// Thin promise-returning wrappers around the IronTracksNative plugin's KV +
// queue methods. These are LOW-LEVEL — most callers go through the higher-level
// `nativeKVStore.ts` / `nativeQueue.ts` modules which handle JSON encoding,
// fallbacks and write-through to the existing IDB / Filesystem paths.

export interface NativeKVStoreStats {
  available: boolean
  kvCount: number
  queueCount: number
  sizeBytes: number
}

export const nativeKvGet = async (key: string): Promise<string | null> => {
  try {
    if (!isIosNative()) return null
    const r = await Native.kvGet({ key })
    return r?.exists ? (r.value ?? null) : null
  } catch { return null }
}

export const nativeKvSet = async (key: string, value: string): Promise<boolean> => {
  try {
    if (!isIosNative()) return false
    const r = await Native.kvSet({ key, value })
    return !!r?.ok
  } catch { return false }
}

export const nativeKvDelete = async (key: string): Promise<boolean> => {
  try {
    if (!isIosNative()) return false
    const r = await Native.kvDelete({ key })
    return !!r?.ok
  } catch { return false }
}

export const nativeKvKeys = async (opts?: { prefix?: string; limit?: number }): Promise<string[]> => {
  try {
    if (!isIosNative()) return []
    const r = await Native.kvKeys(opts)
    return Array.isArray(r?.keys) ? r.keys : []
  } catch { return [] }
}

export const nativeQueuePut = async (job: {
  id: string
  payload: string
  status?: string
  attempts?: number
  nextAttemptAt?: number
}): Promise<boolean> => {
  try {
    if (!isIosNative()) return false
    if (!job?.id || !job?.payload) return false
    const r = await Native.queuePut(job)
    return !!r?.ok
  } catch { return false }
}

export const nativeQueueGetAll = async (limit = 1000): Promise<string[]> => {
  try {
    if (!isIosNative()) return []
    const r = await Native.queueGetAll({ limit })
    return Array.isArray(r?.payloads) ? r.payloads : []
  } catch { return [] }
}

export const nativeQueueDelete = async (id: string): Promise<boolean> => {
  try {
    if (!isIosNative()) return false
    const r = await Native.queueDelete({ id })
    return !!r?.ok
  } catch { return false }
}

export const nativeQueueClear = async (): Promise<boolean> => {
  try {
    if (!isIosNative()) return false
    const r = await Native.queueClear()
    return !!r?.ok
  } catch { return false }
}

export const nativeKvStoreStats = async (): Promise<NativeKVStoreStats> => {
  const empty: NativeKVStoreStats = { available: false, kvCount: 0, queueCount: 0, sizeBytes: 0 }
  try {
    if (!isIosNative()) return empty
    const r = await Native.kvStoreStats()
    return {
      available: !!r?.available,
      kvCount: Number(r?.kvCount) || 0,
      queueCount: Number(r?.queueCount) || 0,
      sizeBytes: Number(r?.sizeBytes) || 0,
    }
  } catch { return empty }
}

/**
 * Subscribes to story-compose progress events (0–1 float).
 * Returns an unsubscribe function. No-op on non-iOS.
 */
export const addStoryComposeProgressListener = (callback: (progress: number) => void): (() => void) => {
  if (!isIosNative()) return () => {}
  try {
    const listenerPromise = Native.addListener('storyComposeProgress', (data: { progress: number }) => {
      try {
        const n = Number(data?.progress)
        if (Number.isFinite(n)) callback(Math.max(0, Math.min(1, n)))
      } catch { /* swallow */ }
    })
    listenerPromise.catch(() => {}) // neutraliza rejeição solta (ex.: plugin ausente em binário nativo antigo)
    return () => { listenerPromise.then((l: PluginListenerHandle) => l.remove()).catch(() => {}) }
  } catch {
    return () => {}
  }
}

// ─── Watch (WatchConnectivity) ───────────────────────────────────────────────
// Pequenos wrappers que aceitam objetos JS e serializam pra JSON antes de
// mandar pro Native. O lado iOS reentregar como Data pro Watch via WCSession.

export interface WatchState {
  isPaired: boolean
  isReachable: boolean
  isWatchAppInstalled: boolean
  isSupported: boolean
}

const coerceBool = (v: unknown): boolean => v === true || v === 'true'

export const watchGetState = async (): Promise<WatchState> => {
  if (!isIosNative()) {
    return { isPaired: false, isReachable: false, isWatchAppInstalled: false, isSupported: false }
  }
  try {
    const r = await Native.watchGetState()
    return {
      isPaired: coerceBool(r.isPaired),
      isReachable: coerceBool(r.isReachable),
      isWatchAppInstalled: coerceBool(r.isWatchAppInstalled),
      isSupported: coerceBool(r.isSupported),
    }
  } catch {
    return { isPaired: false, isReachable: false, isWatchAppInstalled: false, isSupported: false }
  }
}

export const watchSendDashboard = async (dashboard: unknown): Promise<boolean> => {
  if (!isIosNative()) return false
  try {
    const json = JSON.stringify(dashboard)
    const r = await Native.watchSendDashboard({ json })
    return !!r?.ok
  } catch {
    return false
  }
}

export const watchSendWorkout = async (workout: unknown): Promise<boolean> => {
  if (!isIosNative()) return false
  try {
    const json = JSON.stringify(workout)
    const r = await Native.watchSendWorkout({ json })
    return !!r?.ok
  } catch {
    return false
  }
}

export const watchSendNearestGyms = async (gyms: unknown[]): Promise<boolean> => {
  if (!isIosNative()) return false
  try {
    const json = JSON.stringify(gyms)
    const r = await Native.watchSendNearestGyms({ json })
    return !!r?.ok
  } catch {
    return false
  }
}

const safeAddListener = <T>(
  event: 'watchSetLogged' | 'watchCardioFinished' | 'watchRefreshRequested' | 'watchCheckinRequested' | 'watchReachabilityChanged',
  cb: (data: T) => void,
): (() => void) => {
  if (!isIosNative()) return () => {}
  try {
    // @ts-expect-error — addListener overloads exigem a string literal
    const listenerPromise = Native.addListener(event, cb)
    listenerPromise.catch(() => {}) // neutraliza rejeição solta (ex.: plugin ausente em binário nativo antigo)
    return () => { listenerPromise.then((l: PluginListenerHandle) => l.remove()).catch(() => {}) }
  } catch {
    return () => {}
  }
}

export const onWatchSetLogged = (cb: (payload: string) => void) =>
  safeAddListener<{ payload: string }>('watchSetLogged', (d) => cb(d.payload || ''))

export const onWatchCardioFinished = (cb: (payload: string) => void) =>
  safeAddListener<{ payload: string }>('watchCardioFinished', (d) => cb(d.payload || ''))

export const onWatchRefreshRequested = (cb: () => void) =>
  safeAddListener<undefined>('watchRefreshRequested', () => cb())

export const onWatchCheckinRequested = (cb: (payload: string) => void) =>
  safeAddListener<{ payload: string }>('watchCheckinRequested', (d) => cb(d.payload || ''))

export const onWatchReachabilityChanged = (cb: (state: WatchState) => void) =>
  safeAddListener<Record<string, string>>('watchReachabilityChanged', (d) => cb({
    isPaired: coerceBool(d.isPaired),
    isReachable: coerceBool(d.isReachable),
    isWatchAppInstalled: coerceBool(d.isWatchAppInstalled),
    isSupported: coerceBool(d.isSupported),
  }))
