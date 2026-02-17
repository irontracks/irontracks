export const isPwaStandalone = (): boolean => {
  try {
    if (typeof window === 'undefined') return false
    const nav: any = window.navigator as any
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
    const cap: any = (window as unknown as { Capacitor?: unknown })?.Capacitor
    if (!cap) return false
    const getPlatform = typeof cap.getPlatform === 'function' ? cap.getPlatform.bind(cap) : null
    if (!getPlatform) return false
    const platform = String(getPlatform() || '').toLowerCase()
    if (platform !== 'ios') return false
    const isNative =
      typeof cap.isNativePlatform === 'function'
        ? Boolean(cap.isNativePlatform())
        : typeof cap.isNative === 'boolean'
          ? Boolean(cap.isNative)
          : true
    return isNative
  } catch {
    return false
  }
}
