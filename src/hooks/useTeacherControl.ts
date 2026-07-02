/**
 * @module useTeacherControl
 *
 * Teacher-side hook that loads and live-syncs a student's active workout session.
 * Mirrors useSessionSync but reads/writes the student's session via the teacher API.
 *
 * Key behaviors:
 * - Loads student session once on mount
 * - Subscribes to Realtime for live updates from the student's own changes
 * - Provides patchState() to write teacher changes back (with teacher's _deviceId)
 * - Self-echo guard prevents re-applying teacher's own writes
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { logError, logWarn } from '@/lib/logger'
import { isIosNative, isAndroidNative } from '@/utils/platform'
import type { ActiveWorkoutSession } from '@/types/app'

// Runtime feature check: fetch `keepalive` permite que o request continue mesmo
// se a página for descarregada (suportado em iOS Safari/WKWebView 15+, Chrome,
// Firefox modernos). Avaliado uma vez no module load — não muda em runtime.
const FETCH_KEEPALIVE_SUPPORTED: boolean = (() => {
  try {
    return typeof Request !== 'undefined' && 'keepalive' in new Request('http://localhost/')
  } catch {
    return false
  }
})()

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

// Unique device ID for the teacher's current browser/app session
const TEACHER_DEVICE_ID: string = (() => {
  const KEY = 'irontracks._teacherDeviceId'
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (stored && stored.length > 8) return stored
  } catch { /* ignore */ }
  const id = (() => {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
      }
    } catch { /* fallback */ }
    return `teacher-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  })()
  try { localStorage.setItem(KEY, id) } catch { /* ignore */ }
  return id
})()

export interface UseTeacherControlResult {
  session: ActiveWorkoutSession | null
  isLoading: boolean
  isSaving: boolean
  /** True when the student's session ended on the server (row was deleted) */
  sessionEnded: boolean
  patchState: (updater: (prev: ActiveWorkoutSession) => ActiveWorkoutSession) => void
}

export function useTeacherControl(
  supabase: SupabaseClient | null,
  studentUserId: string | null,
  getAuthHeaders: () => Promise<Record<string, string>>,
): UseTeacherControlResult {
  const [session, setSession] = useState<ActiveWorkoutSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)

  const sessionRef = useRef<ActiveWorkoutSession | null>(null)
  sessionRef.current = session

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  // Guard de staleness usa o updated_at do SERVIDOR (monotônico), não relógio de
  // cliente — evita comparar relógios de celulares diferentes (skew).
  const lastSeenUpdatedAtRef = useRef<number>(0)

  // Load the student's session on mount / when studentUserId changes
  useEffect(() => {
    if (!studentUserId) { setSession(null); return }
    let cancelled = false
    setIsLoading(true)

    const load = async () => {
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`/api/teacher/student-session/${studentUserId}`, {
          headers: { 'Content-Type': 'application/json', ...headers },
        })
        if (!res.ok || cancelled) return
        const json = await res.json() as { ok: boolean; session?: { state: Record<string, unknown> } }
        if (!json.ok || !json.session?.state) return
        const state = json.session.state
        if (!state.startedAt || !state.workout) return
        setSession(state as unknown as ActiveWorkoutSession)
      } catch (e) { logError('useTeacherControl.load', e) }
      finally { if (!cancelled) setIsLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [studentUserId, getAuthHeaders])

  // Subscribe to Realtime for live updates from the student
  useEffect(() => {
    if (!supabase || !studentUserId) return
    let mounted = true

    try {
      const ch = supabase
        .channel(`teacher-control-view:${studentUserId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'active_workout_sessions',
            filter: `user_id=eq.${studentUserId}`,
          },
          (payload: Record<string, unknown>) => {
            if (!mounted) return
            try {
              const ev = String(payload?.eventType ?? '').toUpperCase()
              if (ev === 'DELETE') {
                // Student finished or canceled the workout — signal modal to close
                setSessionEnded(true)
                return
              }
              const rowNew = isRecord(payload?.new) ? payload.new : null
              const stateRaw = rowNew?.state
              const state = isRecord(stateRaw) ? stateRaw : null
              if (!state || !state.startedAt || !state.workout) return

              // Self-echo guard: ignore our own writes
              const incomingDeviceId = String(state._deviceId ?? '')
              if (incomingDeviceId === TEACHER_DEVICE_ID) return

              // Secondary guard: rejeita ecos FORA DE ORDEM pelo updated_at do
              // SERVIDOR (monotônico), não pelo _savedAt do cliente — que dependia de
              // comparar relógios de celulares diferentes e podia descartar um update
              // válido do aluno (skew de relógio).
              const incomingUpdatedAt = new Date(String(rowNew?.updated_at ?? 0)).getTime()
              if (incomingUpdatedAt > 0 && incomingUpdatedAt <= lastSeenUpdatedAtRef.current) return
              if (incomingUpdatedAt > 0) lastSeenUpdatedAtRef.current = incomingUpdatedAt

              setSession(state as unknown as ActiveWorkoutSession)
            } catch (e) { logError('useTeacherControl.realtimeHandler', e) }
          }
        )
        .subscribe()

      channelRef.current = ch
    } catch (e) { logError('useTeacherControl.subscribe', e) }

    return () => {
      mounted = false
      try {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current)
          channelRef.current = null
        }
      } catch (e) { logWarn('useTeacherControl', 'cleanup failed', { error: String(e) }) }
    }
  }, [supabase, studentUserId])

  // Debounced save to the student's session via teacher API
  const flushSave = useCallback(async (state: ActiveWorkoutSession) => {
    if (!studentUserId) return
    try {
      setIsSaving(true)
      const savedAt = Date.now()
      const patchedState = { ...state, _deviceId: TEACHER_DEVICE_ID, _savedAt: savedAt }
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/teacher/student-session/${studentUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ state: patchedState }),
      })
      if (!res.ok && res.status === 404) {
        // Student finished the workout — signal modal to close
        setSessionEnded(true)
      }
    } catch (e) { logError('useTeacherControl.flushSave', e) }
    finally { setIsSaving(false) }
  }, [studentUserId, getAuthHeaders])

  const patchState = useCallback((updater: (prev: ActiveWorkoutSession) => ActiveWorkoutSession) => {
    // Compute the next state via setSession's pure updater (no side effects inside).
    // The useEffect above keeps sessionRef.current in sync with the rendered state,
    // so the setTimeout below reads the latest value reliably.
    setSession(prev => (prev ? updater(prev) : prev))

    // Debounce: cancel pending save and schedule new one
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const current = sessionRef.current
      if (current) flushSave(current)
    }, 800)
  }, [flushSave])

  // Cleanup pending save on unmount
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  // ─── Force flush on app pause / tab hidden / page hide ─────────────────────
  //
  // Espelha a estratégia do useLocalPersistence (PR #104), mas pro lado do
  // professor. O debounce de 800ms acima é cancelado no unmount — em mobile,
  // quando o iOS/Android suspende o WebView (professor backgroundou app,
  // bloqueou tela, trocou de app), o setTimeout pode ser perdido antes de
  // disparar, e a última edição feita pelo professor NUNCA chega no banco.
  // O aluno continua vendo o valor velho.
  //
  // Fix: escutar lifecycle events e disparar `flushSave` imediato. Como o
  // endpoint é PATCH + Bearer auth header, `navigator.sendBeacon` não serve
  // (só faz POST sem headers customizáveis). Usamos `fetch keepalive: true`
  // como caminho primário — suportado em iOS WKWebView 15+ e permite que
  // o request termine mesmo após o documento ser descarregado. Fallback é
  // fetch normal (best-effort).
  //
  // Refs garantem que o listener leia os valores mais recentes sem
  // reagendar a cada mudança.
  const studentUserIdRef = useRef(studentUserId)
  const getAuthHeadersRef = useRef(getAuthHeaders)
  useEffect(() => { studentUserIdRef.current = studentUserId }, [studentUserId])
  useEffect(() => { getAuthHeadersRef.current = getAuthHeaders }, [getAuthHeaders])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const flushImmediate = () => {
      const state = sessionRef.current
      const sid = studentUserIdRef.current
      if (!state || !sid) return

      // Cancela debounce pendente — não faz sentido disparar de novo em 800ms
      // se o app pode estar morto até lá.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }

      // Fire-and-forget. Não dá pra await aqui — o handler de lifecycle
      // precisa retornar síncrono pra que o browser não pause antes do
      // request ser enfileirado.
      ;(async () => {
        try {
          const savedAt = Date.now()
          const patchedState = { ...state, _deviceId: TEACHER_DEVICE_ID, _savedAt: savedAt }
          const headers = await getAuthHeadersRef.current()
          const init: RequestInit = {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ state: patchedState }),
          }
          if (FETCH_KEEPALIVE_SUPPORTED) {
            init.keepalive = true
          }
          // Fire e esquece — o request continua via keepalive mesmo se a
          // página for descarregada. Erros aqui são best-effort.
          fetch(`/api/teacher/student-session/${sid}`, init)
            .catch(() => { /* page may already be gone */ })
        } catch (e) {
          logWarn('useTeacherControl.flushImmediate', 'flush failed', { error: String(e) })
        }
      })()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushImmediate()
    }
    const onPageHide = () => flushImmediate()

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)

    // Capacitor App lifecycle — só carrega dinâmico em mobile pra não
    // inflar o bundle web. `appStateChange` com isActive=false dispara
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
          .catch((e) => logWarn('useTeacherControl.flush', 'capacitor listener add failed', { error: String(e) }))
      }).catch((e) => logWarn('useTeacherControl.flush', 'capacitor import failed', { error: String(e) }))
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
      capListenerCancelled = true
      capListenerHandle?.remove()
    }
  }, [])

  return { session, isLoading, isSaving, sessionEnded, patchState }
}
