'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { trackUserEvent } from '@/lib/telemetry/userActivity'

const isLocalhost = () => {
  try {
    const h = String(window.location.hostname || '')
    return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')
  } catch {
    return false
  }
}

export default function ServiceWorkerRegister() {
  const appVersion = useMemo(() => {
    try {
      return String(process.env.NEXT_PUBLIC_APP_VERSION || 'dev')
    } catch {
      return 'dev'
    }
  }, [])

  const [updateReady, setUpdateReady] = useState(false)
  const [updating, setUpdating] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const refreshRef = useRef(false)

  useEffect(() => {
    try {
      if (!('serviceWorker' in navigator)) return
      if (isLocalhost()) return

      const onControllerChange = () => {
        if (refreshRef.current) return
        refreshRef.current = true
        setUpdating(true)
        trackUserEvent('sw_update_applied', { type: 'sw', metadata: { version: appVersion } })
        try {
          window.location.reload()
        } catch {}
      }

      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

      const register = async () => {
        const swUrl = `/sw.js?v=${encodeURIComponent(appVersion)}`
        const reg = await navigator.serviceWorker.register(swUrl)
        registrationRef.current = reg

        if (reg.waiting) {
          setUpdateReady(true)
          trackUserEvent('sw_update_available', { type: 'sw', metadata: { version: appVersion } })
        }

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateReady(true)
              trackUserEvent('sw_update_available', { type: 'sw', metadata: { version: appVersion } })
            }
          })
        })
      }

      register().catch((): null => null)

      const interval = window.setInterval(() => {
        try {
          registrationRef.current?.update()
        } catch {}
      }, 15 * 60 * 1000)

      const onVisible = () => {
        if (document.visibilityState !== 'visible') return
        try {
          registrationRef.current?.update()
        } catch {}
      }
      document.addEventListener('visibilitychange', onVisible)

      return () => {
        try {
          navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
          document.removeEventListener('visibilitychange', onVisible)
          window.clearInterval(interval)
        } catch {}
      }
    } catch {}
  }, [appVersion])

  const applyUpdate = () => {
    const reg = registrationRef.current
    const waiting = reg?.waiting
    if (!waiting) return
    setUpdating(true)
    try {
      waiting.postMessage({ type: 'SKIP_WAITING' })
    } catch {}
  }

  if (!updateReady && !updating) return null

  return (
    <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-5 text-center shadow-2xl">
        <div className="text-sm uppercase tracking-[0.25em] text-neutral-500 font-bold">Atualização</div>
        <div className="mt-2 text-lg font-black text-white">Nova versão pronta</div>
        <div className="mt-2 text-sm text-neutral-400">Atualize para continuar com a melhor experiência.</div>
        <button
          type="button"
          onClick={applyUpdate}
          className="mt-4 w-full min-h-[44px] rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 transition-colors"
        >
          {updating ? 'Atualizando...' : 'Atualizar agora'}
        </button>
      </div>
    </div>
  )
}
