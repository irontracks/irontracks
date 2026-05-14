/**
 * @module useLocalPersistence
 *
 * Persists the active workout session to `localStorage` on every change.
 * If the user refreshes or closes the tab mid-workout, the session can be
 * restored from the stored snapshot. Clears the stored data once the
 * session is explicitly finished or discarded.
 *
 * @param session   - Current active session state
 * @param userId    - Owner user ID (used as storage key prefix)
 */
'use client'
import { logWarn } from '@/lib/logger'
import { persistActiveSession, clearPersistedSession } from '@/lib/offline/activeSessionPersistence'
import { isIosNative, isAndroidNative } from '@/utils/platform'

import { useEffect, useRef } from 'react'
import type { ActiveWorkoutSession } from '@/types/app'

interface UseLocalPersistenceOptions {
  userId?: string | null
  view: string
  setView: (view: string) => void
  activeSession: ActiveWorkoutSession | null
}

/**
 * Persists and restores the current view and active session
 * to/from localStorage, keeping the UI state across page refreshes.
 *
 * - On mount: restores saved view (respecting existing active session key)
 * - On view change: saves the current view
 * - On activeSession change: saves or removes the active session payload
 */
export function useLocalPersistence({
  userId,
  view,
  setView,
  activeSession,
}: UseLocalPersistenceOptions): void {
  // ─── Restore view on mount ────────────────────────────────────────────────
  // PR#4a: sub-rotas reais existem. URL é source of truth agora.
  // O restore antigo do localStorage causava LOOP de navegação:
  //   1. User em /dashboard/admin (salvou appView=admin)
  //   2. Click "Fechar" → router.push('/dashboard') → re-mount
  //   3. useLocalPersistence mount lê appView=admin → setView('admin') →
  //      router.push('/dashboard/admin') → re-mount
  //   4. ∞ loop (tela piscando entre skeleton/conteúdo)
  //
  // Fix: só restaurar 'active' (treino em andamento) quando ESSA é a real
  // intenção. Outras views vêm da URL — Capacitor preserva URL ao retomar.
  useEffect(() => {
    try {
      if (!userId) return
      // Atua na raiz /dashboard E em /dashboard/active/* (B-012):
      //
      // - /dashboard (root): caminho clássico após login/cold-launch.
      // - /dashboard/active[/<sessionId>]: user crashou DENTRO do treino ativo
      //   e Capacitor preservou a URL ao reabrir. Sem o restore, a sub-rota
      //   tenta hidratar via sessionId da URL — que pode ser stale/órfão — e
      //   o snapshot do localStorage fica intacto mas inacessível.
      //
      // Outras sub-rotas (/dashboard/admin, /dashboard/history, etc) continuam
      // respeitando a URL pra evitar o loop original (PR#4a).
      //
      // Caso já estejamos em /dashboard/active, o setView('active') vira no-op
      // (IronTracksAppClientImpl linha 164: `if (target === view) return`).
      if (typeof window !== 'undefined') {
        const path = window.location.pathname
        const isDashboardRoot = path === '/dashboard' || path === '/dashboard/'
        const isActiveRoute = path === '/dashboard/active' || path.startsWith('/dashboard/active/')
        if (!isDashboardRoot && !isActiveRoute) return
      }

      const scopedSessionKey = `irontracks.activeSession.v2.${userId}`
      const savedSession = localStorage.getItem(scopedSessionKey)
      // Único caso onde forçamos navegação: restore-after-crash de treino ativo
      // (user matou app no meio de sessão e voltou — vai pra /dashboard/active).
      if (savedSession) {
        setView('active')
      }
      // Outros casos: respeitar URL atual. View string legada vai sair em PR futuro.
    } catch (e) {
      logWarn('useLocalPersistence', 'restore failed (non-critical)', e)
    }
    // Intentionally only on mount (userId change) — not on every view change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // ─── Persist current view on every change ────────────────────────────────
  // Mantido pra compat e debug, mas o valor não é mais usado pra restore.
  // Pode ser removido em PR futuro quando view: string for migrado completo.
  useEffect(() => {
    try {
      if (!userId) return
      if (!view) return
      localStorage.setItem(`irontracks.appView.v2.${userId}`, view)
    } catch (e) { logWarn('useLocalPersistence', 'silenced error', e) }
  }, [view, userId])

  // ─── Persist active session (localStorage imediato + IDB debounced 2s) ─────
  //
  // localStorage: escrita IMEDIATA (sem debounce). O debounce anterior de 250ms
  // criava uma janela de perda: iOS pode matar o WebView a qualquer momento, e
  // se o app fechasse dentro desse intervalo o dado não estava em disco. A
  // escrita de localStorage é síncrona e rápida (~1ms) — sem impacto perceptível
  // mesmo que activeSession mude a cada série completada.
  //
  // IDB: debounce de 2s mantido. Escrita assíncrona — debounce reduz churn no
  // IndexedDB sem risco, pois o flushImmediate() abaixo garante a escrita IDB
  // na hora que o app vai pra background (independente do timer).
  //
  // RACE CONDITION GUARD (B-014):
  // No WKWebView restart, React monta com activeSession=null. Quando userId
  // fica disponível, este effect dispara com activeSession=null → apagaria o
  // localStorage ANTES do useSessionSync conseguir lê-lo. Resultado: restore
  // falha, treino some.
  //
  // Fix: só apagar localStorage se activeSession foi setado NESTE mount (ou seja,
  // o usuário explicitamente finalizou/cancelou). Nunca apagar no mount inicial
  // com session=null — pode ser um restore em andamento.
  const sessionEverSetRef = useRef(false)
  useEffect(() => {
    if (activeSession) sessionEverSetRef.current = true
  }, [activeSession])

  const idbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    try {
      if (!userId) return
      const key = `irontracks.activeSession.v2.${userId}`
      if (!activeSession) {
        // Guard: não apagar no mount inicial (restore pode estar em andamento).
        // Só limpa quando sabemos que havia sessão ativa e foi encerrada.
        if (!sessionEverSetRef.current) return
        localStorage.removeItem(key)
        localStorage.removeItem('activeSession')
        clearPersistedSession(userId).catch(() => {})
        if (idbTimerRef.current) { clearTimeout(idbTimerRef.current); idbTimerRef.current = null }
        return
      }

      const payload = JSON.stringify({ ...(activeSession || {}), _savedAt: Date.now() })

      // Escrita imediata — sem setTimeout, sem debounce.
      try {
        localStorage.setItem(key, payload)
      } catch (e) { logWarn('useLocalPersistence', 'silenced error', e) }

      // IDB dual-write (debounce reduz churn — async, então é seguro).
      // Captura userId em closure — protege contra troca de conta antes do timer.
      if (idbTimerRef.current) clearTimeout(idbTimerRef.current)
      const capturedUserId = userId
      idbTimerRef.current = setTimeout(() => {
        persistActiveSession(capturedUserId, activeSession as unknown as Record<string, unknown>).catch(() => {})
        idbTimerRef.current = null
      }, 2000)

      // Sem return de cleanup para localStorage (escrita já ocorreu).
      // idbTimerRef INTENCIONALMENTE não é cancelado no cleanup — ver comentário
      // original: cancel no unmount impedia a escrita IDB de completar quando o
      // app vai pro background, causando perda de sessão no próximo launch.
    } catch {
      return
    }
  }, [activeSession, userId])

  // ─── Force flush on app pause / tab hidden / page hide ─────────────────────
  //
  // O PR #99 removeu o cancel do idbTimer no cleanup, mas isso só ajuda em
  // unmounts NORMAIS (mudança de view, troca de conta). Em mobile, quando o
  // iOS/Android suspende o WebView — usuário trocou de app, deu swipe-up no
  // home, locked screen — o JS para de rodar imediatamente. Se o debounce de
  // 250ms (localStorage) ou 2s (IDB) ainda não disparou, a sessão é PERDIDA.
  //
  // Fix: escutar lifecycle events e fazer flush SÍNCRONO do localStorage
  // (sempre completa antes do kill) + best-effort IDB. Padrões cobertos:
  //   • `visibilitychange` (hidden) — disparado pelo Safari/WKWebView em
  //     background; mais confiável que pagehide no iOS.
  //   • `pagehide` — fallback web (Chrome desktop, Firefox).
  //   • Capacitor `App.appStateChange` — disparado pelo plugin nativo
  //     antes do JS pausar; é o caminho mais cedo em iOS/Android nativo.
  //
  // O activeSession e userId são acessados via ref pra que o listener
  // sempre veja o valor mais recente sem reagendar a cada mudança.
  const activeSessionRef = useRef(activeSession)
  const userIdRef = useRef(userId)
  useEffect(() => { activeSessionRef.current = activeSession }, [activeSession])
  useEffect(() => { userIdRef.current = userId }, [userId])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const flushImmediate = () => {
      const s = activeSessionRef.current
      const uid = userIdRef.current
      if (!s || !uid) return
      try {
        const key = `irontracks.activeSession.v2.${uid}`
        const payload = JSON.stringify({ ...(s as object), _savedAt: Date.now() })
        localStorage.setItem(key, payload)
      } catch (e) {
        logWarn('useLocalPersistence.flush', 'localStorage flush failed', e)
      }
      // Best-effort IDB persist. Em iOS nativo isso dispara `nativeKvSet`
      // via Capacitor bridge — pode ou não completar antes do kill, mas
      // localStorage acima já garantiu o caminho síncrono.
      persistActiveSession(uid, s as unknown as Record<string, unknown>).catch(() => {})
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushImmediate()
    }
    const onPageHide = () => flushImmediate()

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)

    // Capacitor App lifecycle — só carrega dinâmico em mobile pra não
    // inflar o bundle web. `appStateChange` dispara com isActive=false
    // ANTES do JS ser pausado pelo iOS, então é o caminho mais cedo.
    let capListenerHandle: { remove: () => void } | null = null
    let capListenerCancelled = false
    if (isIosNative() || isAndroidNative()) {
      import('@capacitor/app').then(({ App }) => {
        if (capListenerCancelled) return
        App.addListener('appStateChange', (state: { isActive?: boolean }) => {
          if (!state?.isActive) flushImmediate()
        })
          .then((h) => {
            if (capListenerCancelled) { h.remove(); return }
            capListenerHandle = h
          })
          .catch((e) => logWarn('useLocalPersistence.flush', 'capacitor listener add failed', e))
      }).catch((e) => logWarn('useLocalPersistence.flush', 'capacitor import failed', e))
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
      capListenerCancelled = true
      capListenerHandle?.remove()
    }
  }, [])
}
