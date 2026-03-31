'use client'

import { useEffect, useState } from 'react'
import { isIosNative } from '@/utils/platform'

/**
 * SSR-safe hook that returns true when running inside the iOS Capacitor WebView.
 * Always returns false on the first (server) render to avoid hydration mismatches,
 * then updates to the real value after mount.
 */
export function useIsIosNative(): boolean {
  const [value, setValue] = useState(false)
  useEffect(() => { setValue(isIosNative()) }, [])
  return value
}
