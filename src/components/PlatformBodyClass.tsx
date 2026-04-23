'use client'
/**
 * PlatformBodyClass
 *
 * Runs once on mount and adds a `data-platform` attribute to <body> so that
 * CSS can target platform-specific overrides without any JS conditional per
 * component. Currently only sets "android" (iOS WebKit needs no overrides).
 *
 * This is intentionally a no-op on SSR (no body access) and on web/iOS.
 */
import { useEffect } from 'react'
import { isAndroidNative } from '@/utils/platform'

export default function PlatformBodyClass() {
  useEffect(() => {
    if (isAndroidNative()) {
      document.body.setAttribute('data-platform', 'android')
    }
  }, [])

  return null
}
