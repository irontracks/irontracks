'use client'
import { logWarn } from '@/lib/logger'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isIosNative } from '@/utils/platform'

const toInternalPath = (rawUrl: string) => {
  const url = String(rawUrl || '').trim()
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      const path = `${u.pathname || ''}${u.search || ''}${u.hash || ''}`
      return path.startsWith('/') ? path : `/${path}`
    }
    const p = `${u.pathname || ''}${u.search || ''}${u.hash || ''}`
    return p.startsWith('/') ? p : `/${p}`
  } catch {
    if (url.startsWith('/')) return url
    return null
  }
}

export function useNativeDeepLinks() {
  const router = useRouter()

  useEffect(() => {
    if (!isIosNative()) return
    let alive = true
    const handles: { remove: () => void }[] = []

      ; (async () => {
        try {
          const mod = require('@capacitor/app')
          const App = mod?.App
          if (!App) return

          const launch = (await App.getLaunchUrl?.().catch(() => null)) as unknown
          const launchObj = launch && typeof launch === 'object' ? (launch as Record<string, unknown>) : null
          const launchUrl = launchObj ? String(launchObj.url ?? '').trim() : ''
          if (alive && launchUrl) {
            const path = toInternalPath(launchUrl)
            if (path) router.push(path)
          }

          const h = await App.addListener('appUrlOpen', (data: unknown) => {
            try {
              if (!alive) return
              const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
              const url = obj ? String(obj.url ?? '').trim() : ''
              // Handle action deeplinks from Live Activity buttons
              if (url.includes('://action/')) {
                try {
                  const u = new URL(url)
                  const action = u.pathname.replace(/^\/+/, '').toUpperCase().replace(/-/g, '_')
                  window.dispatchEvent(new CustomEvent('irontracks:action', { detail: { action } }))
                } catch { }
                return
              }
              const path = toInternalPath(url)
              if (path) router.push(path)
            } catch (e) { logWarn('useNativeDeepLinks', 'silenced error', e) }
          })
          if (h?.remove) handles.push(h)
        } catch (e) { logWarn('useNativeDeepLinks', 'silenced error', e) }
      })()

    return () => {
      alive = false
      handles.forEach((h) => {
        try {
          h.remove()
        } catch (e) { logWarn('useNativeDeepLinks', 'silenced error', e) }
      })
    }
  }, [router])
}
