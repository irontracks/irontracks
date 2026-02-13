import { Capacitor } from '@capacitor/core'

export const isIosNative = () => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
  } catch {
    return false
  }
}

