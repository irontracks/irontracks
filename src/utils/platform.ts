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

export const isIosNative = (): boolean => {
  try {
    if (typeof window === 'undefined') return false
    const cap = (window as unknown as { Capacitor?: unknown })?.Capacitor
    if (!cap) return false
    const getPlatform = typeof (cap as any).getPlatform === 'function' ? (cap as any).getPlatform.bind(cap) : null
    if (!getPlatform) return false
    const platform = String(getPlatform() || '').toLowerCase()
    if (platform !== 'ios') return false
    const isNative =
      typeof (cap as any).isNativePlatform === 'function'
        ? Boolean((cap as any).isNativePlatform())
        : typeof (cap as any).isNative === 'boolean'
          ? Boolean((cap as any).isNative)
          : true
    return isNative
  } catch {
    return false
  }
}
