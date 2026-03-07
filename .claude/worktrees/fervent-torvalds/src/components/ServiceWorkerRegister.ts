'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister(): null {
  useEffect(() => {
    try {
      if (!('serviceWorker' in navigator)) return
      const isLocal = (() => {
        try {
          const h = String(window.location.hostname || '')
          return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')
        } catch {
          return false
        }
      })()
      if (isLocal) return
      navigator.serviceWorker.register('/sw.js').catch((): any => null)
    } catch {}
  }, [])
  return null
}
