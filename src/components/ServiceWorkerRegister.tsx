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
  const controlledRef = useRef(false)

  useEffect(() => {
    try {
      if (!('serviceWorker' in navigator)) return
      if (isLocalhost()) return
      controlledRef.current = Boolean(navigator.serviceWorker.controller)

      const onControllerChange = () => {
        // The first controller claim is a normal fresh install, not an update.
        // Reloading here caused Android users to see a blocking black overlay.
        if (!controlledRef.current) {
          controlledRef.current = true
          return
        }
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
        // updateViaCache: 'none' tells the browser to NEVER use its HTTP cache
        // when fetching the service worker file itself. Without this flag
        // WebKit (iOS Safari + Capacitor WKWebView) caches sw.js for up to
        // 24h, meaning deploys can take a full day to reach installed clients.
        // Combined with the dynamic /sw.js route returning fresh content per
        // deploy, this guarantees the update check actually sees changes.
        const reg = await navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' })
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
          registrationRef.current?.update().catch(() => null)
        } catch {}
      }, 15 * 60 * 1000)

      const onVisible = () => {
        if (document.visibilityState !== 'visible') return
        try {
          registrationRef.current?.update().catch(() => null)
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

  // ─── Atualização automática ──────────────────────────────────────────────
  //
  // Antes isto era um modal que COBRIA a tela inteira (fixed inset-0) e exigia
  // tocar em "Atualizar agora" pra liberar o app. Virava um pedágio a cada deploy.
  //
  // Agora aplica sozinho — mas só num momento SEGURO. Aplicar a atualização
  // dispara controllerchange, que recarrega a página; se isso acontecer no meio
  // de uma série, o usuário perde o contexto sem entender por quê. As duas
  // janelas seguras:
  //   • app em background (visibilityState hidden) — o reload é invisível;
  //   • app visível SEM treino em andamento — nada crítico na tela.
  // Com treino ativo, adia e reavalia (o hook useActiveSession marca o atributo).
  useEffect(() => {
    if (!updateReady || updating) return

    const workoutInProgress = () => {
      try {
        return document.documentElement.dataset.workoutActive === '1'
      } catch {
        return false
      }
    }

    const applyIfSafe = () => {
      const waiting = registrationRef.current?.waiting
      if (!waiting) return
      const hidden = document.visibilityState === 'hidden'
      if (!hidden && workoutInProgress()) return
      setUpdating(true)
      trackUserEvent('sw_update_auto_applied', {
        type: 'sw',
        metadata: { version: appVersion, hidden, deferredByWorkout: false },
      })
      try {
        waiting.postMessage({ type: 'SKIP_WAITING' })
      } catch {}
    }

    applyIfSafe()
    // Reavalia quando o app sai/volta do background e periodicamente, pra cobrir o
    // caso "estava treinando quando a versão ficou pronta".
    document.addEventListener('visibilitychange', applyIfSafe)
    const retry = window.setInterval(applyIfSafe, 30_000)
    return () => {
      document.removeEventListener('visibilitychange', applyIfSafe)
      window.clearInterval(retry)
    }
  }, [updateReady, updating, appVersion])

  // Sem UI: a atualização é silenciosa.
  return null
}
