export const isPwaStandalone = (): boolean => {
  try {
    if (typeof window === 'undefined') return false
    const nav = window.navigator as Navigator & Record<string, unknown>
    if (typeof nav?.standalone === 'boolean' && nav.standalone) return true
    const mq = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null
    return Boolean(mq && mq.matches)
  } catch {
    return false
  }
}

type CapacitorLike = {
  getPlatform?: () => string
  isNativePlatform?: () => boolean
  isNative?: boolean
}

const getCapacitorPlatform = (
  cap: CapacitorLike,
): { platform: string; isNative: boolean } | null => {
  const getPlatform = typeof cap.getPlatform === 'function' ? cap.getPlatform.bind(cap) : null
  if (!getPlatform) return null
  const platform = String(getPlatform() || '').toLowerCase()
  const isNative =
    typeof cap.isNativePlatform === 'function'
      ? Boolean(cap.isNativePlatform())
      : typeof cap.isNative === 'boolean'
        ? Boolean(cap.isNative)
        : true
  return { platform, isNative }
}

export const isIosNative = (): boolean => {
  try {
    if (typeof window === 'undefined') return false
    const cap = (window as unknown as { Capacitor?: CapacitorLike })?.Capacitor
    if (!cap) return false
    const result = getCapacitorPlatform(cap)
    if (!result) return false
    return result.platform === 'ios' && result.isNative
  } catch {
    return false
  }
}

/**
 * Returns true when running inside a Capacitor Android WebView.
 * Use for Android-specific native feature detection.
 */
export const isAndroidNative = (): boolean => {
  try {
    if (typeof window === 'undefined') return false
    const cap = (window as unknown as { Capacitor?: CapacitorLike })?.Capacitor
    if (!cap) return false
    const result = getCapacitorPlatform(cap)
    if (!result) return false
    return result.platform === 'android' && result.isNative
  } catch {
    return false
  }
}

/**
 * Returns true on either iOS or Android native Capacitor.
 * Use when a feature is available on both platforms.
 */
export const isNativePlatform = (): boolean => isIosNative() || isAndroidNative()
