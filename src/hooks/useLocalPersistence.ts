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
      // Só atua se estamos na raiz /dashboard. Em sub-rotas (/dashboard/admin,
      // /dashboard/history, etc), URL já indica onde user está — não interferir.
      if (typeof window !== 'undefined' && window.location.pathname !== '/dashboard') {
        return
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

  // ─── Persist active session (debounced 250 ms localStorage + 2s IDB) ──────
  const idbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    try {
      if (!userId) return
      const key = `irontracks.activeSession.v2.${userId}`
      if (!activeSession) {
        localStorage.removeItem(key)
        localStorage.removeItem('activeSession')
        // Clear IDB too
        clearPersistedSession(userId).catch(() => {})
        if (idbTimerRef.current) { clearTimeout(idbTimerRef.current); idbTimerRef.current = null }
        return
      }

      const payload = JSON.stringify({ ...(activeSession || {}), _savedAt: Date.now() })
      const id = setTimeout(() => {
        try {
          localStorage.setItem(key, payload)
        } catch (e) { logWarn('useLocalPersistence', 'silenced error', e) }
      }, 250)

      // IDB dual-write (longer debounce to reduce IDB churn).
      // Captura userId em closure local — se o usuário trocar de conta antes
      // do timer disparar (improvável mas possível), o callback persiste pra
      // userId capturado, não pra eventual outro userId que tenha sido setado.
      if (idbTimerRef.current) clearTimeout(idbTimerRef.current)
      const capturedUserId = userId
      idbTimerRef.current = setTimeout(() => {
        persistActiveSession(capturedUserId, activeSession as unknown as Record<string, unknown>).catch(() => {})
        idbTimerRef.current = null
      }, 2000)

      return () => {
        clearTimeout(id)
        // INTENCIONALMENTE NÃO cancela o idbTimer no cleanup.
        //
        // O cleanup roda quando o usuário fecha/backgrounda o app (regressão
        // do commit d779330): se cancelássemos, a escrita debounced de 2s
        // nunca completaria e a sessão ativa seria perdida no próximo
        // launch. Foi exatamente o bug reportado em prod.
        //
        // E o cancel em re-run normal (mudança de activeSession) JÁ é feito
        // na linha 112 (`clearTimeout(idbTimerRef.current)` antes do novo
        // setTimeout). Então cleanup-cancel era redundante pra esse caminho
        // E maléfico no caminho de unmount.
        //
        // A proteção "wrong user na troca de conta" — motivação original do
        // d779330 — segue garantida pelo `capturedUserId` da closure: o
        // callback persiste pro UID capturado no momento do agendamento,
        // não pro UID atual.
      }
    } catch {
      return
    }
  }, [activeSession, userId])
}
