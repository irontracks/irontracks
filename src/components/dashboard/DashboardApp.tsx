'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  Clock,
  CreditCard,
  Dumbbell,
  Loader2,
  Upload,
  X,
} from 'lucide-react'

import { createClient } from '@/utils/supabase/client'
import { createWorkout, deleteWorkout, importData, updateWorkout } from '@/actions/workout-actions'

import AdminPanelV2 from '@/components/AdminPanelV2'
import ActiveWorkout from '@/components/ActiveWorkout'
import ChatDirectScreen from '@/components/ChatDirectScreen'
import ChatListScreen from '@/components/ChatListScreen'
import ChatScreen from '@/components/ChatScreen'
import ErrorBoundary from '@/components/ErrorBoundary'
import ExerciseEditor from '@/components/ExerciseEditor'
import GlobalDialog from '@/components/GlobalDialog'
import HeaderActionsMenu from '@/components/HeaderActionsMenu'
import HistoryList from '@/components/HistoryList'
import IncomingInviteModal from '@/components/IncomingInviteModal'
import NotificationCenter from '@/components/NotificationCenter'
import NotificationToast from '@/components/NotificationToast'
import RestTimerOverlay from '@/components/RestTimerOverlay'
import RealtimeNotificationBridge from '@/components/RealtimeNotificationBridge'
import { BackButton } from '@/components/ui/BackButton'
import { DialogProvider, useDialog } from '@/contexts/DialogContext'
import { TeamWorkoutProvider } from '@/contexts/TeamWorkoutContext'
import { playStartSound, unlockAudio } from '@/lib/sounds'
import { workoutPlanHtml } from '@/utils/report/templates'
import { calculateExerciseDuration, estimateExerciseSeconds, toMinutesRounded } from '@/utils/pacing'

import StudentDashboard, { type DashboardWorkout } from './StudentDashboard'
import TeacherDashboard from './TeacherDashboard'
import WorkoutReport from '@/components/WorkoutReport'

const AssessmentHistory = dynamic(() => import('@/pages/AssessmentHistory'), { ssr: false })

type DashboardUser = {
  id: string
  email: string | null
  displayName?: string | null
  photoURL?: string | null
  role?: string | null
}

type DirectChat = {
  other_user_id: string
  other_user_name?: string | null
  other_user_photo?: string | null
}

type NotificationPayload = {
  text: string
  senderName?: string | null
}

type Props = {
  user: DashboardUser
  isCoach: boolean
  coachPending: boolean
  initialProfileIncomplete: boolean
  initialProfileDraftName: string
  initialWorkouts: DashboardWorkout[]
}

const mapWorkoutRow = (w: any) => {
  const rawExercises = Array.isArray(w?.exercises) ? w.exercises : []
  const exs = rawExercises
    .filter((e: any) => e && typeof e === 'object')
    .sort((a: any, b: any) => (a?.order || 0) - (b?.order || 0))
    .map((e: any) => {
      try {
        const isCardio = String(e?.method || '').toLowerCase() === 'cardio'
        const dbSets = Array.isArray(e?.sets) ? e.sets.filter((s: any) => s && typeof s === 'object') : []

        const sortedSets = dbSets.slice().sort((aSet: any, bSet: any) => (aSet?.set_number || 0) - (bSet?.set_number || 0))
        const setsCount = sortedSets.length || (isCardio ? 1 : 4)

        const setDetails = sortedSets.map((s: any, idx: number) => ({
          set_number: s?.set_number ?? idx + 1,
          reps: s?.reps ?? null,
          rpe: s?.rpe ?? null,
          weight: s?.weight ?? null,
          is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
          advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null,
        }))

        const nonEmptyReps = setDetails.map((s: any) => s?.reps).filter((r: any) => r !== null && r !== undefined && r !== '')
        const defaultReps = isCardio ? '20' : '10'
        let repsHeader = defaultReps
        if (nonEmptyReps.length > 0) {
          const uniqueReps = Array.from(new Set(nonEmptyReps))
          repsHeader = (uniqueReps.length === 1 ? uniqueReps[0] : nonEmptyReps[0]) ?? defaultReps
        }

        const rpeValues = setDetails.map((s: any) => s?.rpe).filter((v: any) => v !== null && v !== undefined && !Number.isNaN(v))
        const defaultRpe = isCardio ? 5 : 8
        const rpeHeader = rpeValues.length > 0 ? rpeValues[0] : defaultRpe

        return {
          id: e?.id,
          name: e?.name,
          notes: e?.notes,
          videoUrl: e?.video_url,
          restTime: e?.rest_time,
          cadence: e?.cadence,
          method: e?.method,
          sets: setsCount,
          reps: repsHeader,
          rpe: rpeHeader,
          setDetails,
        }
      } catch {
        return null
      }
    })
    .filter(Boolean)

  return {
    id: w?.id,
    user_id: w?.user_id ?? null,
    created_by: w?.created_by ?? null,
    title: w?.title ?? w?.name ?? 'Treino',
    notes: w?.notes ?? null,
    exercises: exs,
  }
}

function DashboardInner(props: Props) {
  const { confirm, alert } = useDialog()
  const router = useRouter()

  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => {
      try {
        unlockAudio()
      } catch {}
    }
    try {
      document.addEventListener('touchstart', handler, { once: true } as any)
      document.addEventListener('click', handler, { once: true } as any)
    } catch {}
    return () => {
      try {
        document.removeEventListener('touchstart', handler)
        document.removeEventListener('click', handler)
      } catch {}
    }
  }, [])

  type DashboardView =
    | 'dashboard'
    | 'assessments'
    | 'edit'
    | 'active'
    | 'history'
    | 'report'
    | 'chat'
    | 'globalChat'
    | 'chatList'
    | 'directChat'

  const [view, setView] = useState<DashboardView>('dashboard')

  const viewBackStackRef = useRef<DashboardView[]>([])
  const scrollPositionsRef = useRef<Record<string, number>>({})
  const pendingScrollRestoreRef = useRef<DashboardView | null>(null)

  type ActiveModal = null | 'completeProfile' | 'export' | 'quickView' | 'notifications' | 'wallet' | 'jsonImport' | 'admin'
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)

  const [profileIncomplete, setProfileIncomplete] = useState<boolean>(!!props.initialProfileIncomplete)
  const [profileDraftName, setProfileDraftName] = useState<string>(props.initialProfileDraftName || '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [workouts, setWorkouts] = useState<DashboardWorkout[]>(Array.isArray(props.initialWorkouts) ? props.initialWorkouts : [])
  const [currentWorkout, setCurrentWorkout] = useState<any>(null)
  const [activeSession, setActiveSession] = useState<any>(null)
  const clientErrorContextRef = useRef<{ view: string; workoutId: string | null; teamSessionId: string | null }>({
    view: 'dashboard',
    workoutId: null,
    teamSessionId: null,
  })
  const lastClientErrorSentRef = useRef<{ key: string; ts: number }>({ key: '', ts: 0 })
  const serverSessionSyncRef = useRef<{ timer: any; key: string }>({ timer: null, key: '' })
  const restoredSessionForUserRef = useRef<string>('')
  const serverSessionSyncWarnedRef = useRef<boolean>(false)
  const [reportData, setReportData] = useState<{ current: any; previous: any } | null>(null)
  const [exportWorkout, setExportWorkout] = useState<any>(null)
  const [quickViewWorkout, setQuickViewWorkout] = useState<any>(null)
  const [startingQuickViewSession, setStartingQuickViewSession] = useState(false)
  const [notification, setNotification] = useState<NotificationPayload | null>(null)

  const STICKY_GAP_PX = 12
  const DEFAULT_HEADER_HEIGHT_PX = 84

  const headerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [headerHeightPx, setHeaderHeightPx] = useState(DEFAULT_HEADER_HEIGHT_PX)
  const [hasUnreadChat, setHasUnreadChat] = useState(false)
  const [hasUnreadNotification, setHasUnreadNotification] = useState(false)

  const [loadingWallet, setLoadingWallet] = useState(false)
  const [savingWallet, setSavingWallet] = useState(false)
  const [walletIdDraft, setWalletIdDraft] = useState('')

  const [exportingAll, setExportingAll] = useState(false)
  const [directChat, setDirectChat] = useState<DirectChat | null>(null)

  useEffect(() => {
    try {
      const workoutId = activeSession?.workout?.id ? String(activeSession.workout.id) : null
      const teamSessionId = activeSession?.teamSessionId ? String(activeSession.teamSessionId) : null
      clientErrorContextRef.current = {
        view: String(view),
        workoutId,
        teamSessionId,
      }
    } catch {
      clientErrorContextRef.current = { view: String(view), workoutId: null, teamSessionId: null }
    }
  }, [view, activeSession?.workout?.id, activeSession?.teamSessionId])

  const reportClientError = useCallback(
    async (kind: string, err: any, extra?: any) => {
      try {
        const url = typeof window !== 'undefined' ? window.location.href : null
        const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null
        const userId = props.user?.id ? String(props.user.id) : null

        let message = ''
        let stack: string | null = null
        if (typeof err === 'string') {
          message = err
        } else if (err && typeof err === 'object') {
          message = String((err as any)?.message || (err as any)?.reason || (err as any)?.name || 'unknown_error')
          stack = typeof (err as any)?.stack === 'string' ? String((err as any).stack) : null
        } else {
          message = String(err || 'unknown_error')
        }

        const ctx = clientErrorContextRef.current
        const meta = {
          ...(ctx && typeof ctx === 'object' ? ctx : {}),
          ...(extra && typeof extra === 'object' ? extra : {}),
        }

        const key = `${kind}:${message}:${String(stack || '').slice(0, 120)}:${String(url || '')}`
        const now = Date.now()
        const last = lastClientErrorSentRef.current
        if (last?.key === key && Number.isFinite(last?.ts) && now - last.ts < 15000) return
        lastClientErrorSentRef.current = { key, ts: now }

        const { error } = await (supabase as any)
          .from('client_error_events')
          .insert({ user_id: userId, kind, message, stack, url, user_agent: userAgent, meta })
        if (error) return
      } catch {
        return
      }
    },
    [supabase, props.user?.id]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const onError = (event: any) => {
      try {
        void reportClientError('error', event?.error ?? event?.message ?? 'window_error', {
          filename: event?.filename ?? null,
          lineno: event?.lineno ?? null,
          colno: event?.colno ?? null,
        })
      } catch {}
    }

    const onUnhandledRejection = (event: any) => {
      try {
        void reportClientError('unhandledrejection', event?.reason ?? 'unhandledrejection', {})
      } catch {}
    }

    try {
      window.addEventListener('error', onError)
      window.addEventListener('unhandledrejection', onUnhandledRejection)
    } catch {}

    return () => {
      try {
        window.removeEventListener('error', onError)
        window.removeEventListener('unhandledrejection', onUnhandledRejection)
      } catch {}
    }
  }, [reportClientError])

  const canCloseActiveModal = useMemo(() => {
    if (!activeModal) return true
    if (activeModal === 'completeProfile') return !savingProfile
    if (activeModal === 'wallet') return !savingWallet
    return true
  }, [activeModal, savingProfile, savingWallet])

  const closeActiveModal = useCallback(() => {
    if (!canCloseActiveModal) return
    if (activeModal === 'quickView') setQuickViewWorkout(null)
    if (activeModal === 'export') setExportWorkout(null)
    setActiveModal(null)
  }, [activeModal, canCloseActiveModal])

  const saveScrollPosition = useCallback((key: DashboardView) => {
    const el = scrollRef.current
    if (!el) return
    try {
      scrollPositionsRef.current[String(key)] = Math.max(0, Number(el.scrollTop || 0))
    } catch {}
  }, [])

  const restoreScrollPosition = useCallback((key: DashboardView) => {
    const el = scrollRef.current
    if (!el) return
    const top = Number(scrollPositionsRef.current[String(key)] ?? 0)
    if (!Number.isFinite(top) || top <= 0) return
    try {
      el.scrollTo({ top })
    } catch {
      try {
        el.scrollTop = top
      } catch {}
    }
  }, [])

  const scrollToTop = useCallback(() => {
    try {
      scrollRef.current?.scrollTo({ top: 0 })
    } catch {
      try {
        if (scrollRef.current) scrollRef.current.scrollTop = 0
      } catch {}
    }
  }, [])

  const navigateToView = useCallback(
    (
      next: DashboardView,
      options?: {
        resetStack?: boolean
        scroll?: 'top' | 'none'
        replace?: boolean
      }
    ) => {
      if (next === view) return
      saveScrollPosition(view)
      if (options?.resetStack) viewBackStackRef.current = []
      if (!options?.replace) {
        const stack = viewBackStackRef.current
        if (stack.length === 0 || stack[stack.length - 1] !== view) stack.push(view)
      }
      pendingScrollRestoreRef.current = null
      setView(next)
      if ((options?.scroll ?? 'top') === 'top') {
        try {
          requestAnimationFrame(() => scrollToTop())
        } catch {
          scrollToTop()
        }
      }
    },
    [saveScrollPosition, scrollToTop, view]
  )

  const goBackView = useCallback(
    (fallback: DashboardView = 'dashboard') => {
      saveScrollPosition(view)
      const stack = viewBackStackRef.current
      let prev: DashboardView | undefined = stack.pop()
      while (prev && prev === view) prev = stack.pop()
      const next = (prev || fallback) as DashboardView
      pendingScrollRestoreRef.current = next
      setView(next)
    },
    [saveScrollPosition, view]
  )

  useEffect(() => {
    const userId = props.user?.id ? String(props.user.id) : ''
    if (!userId) return
    if (typeof window === 'undefined') return
    if (restoredSessionForUserRef.current === userId) return
    restoredSessionForUserRef.current = userId

    let cancelled = false
    const scopedKey = `irontracks.activeSession.v2.${userId}`
    let localSavedAt = 0

    try {
      const raw = window.localStorage.getItem(scopedKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && parsed?.startedAt && parsed?.workout) {
          localSavedAt = Number(parsed?._savedAt ?? 0) || 0
          setActiveSession(parsed)
          navigateToView('active', { resetStack: true, replace: true, scroll: 'top' })
        }
      }
    } catch {
      try {
        window.localStorage.removeItem(scopedKey)
      } catch {}
    }

    const loadServer = async () => {
      try {
        const { data, error } = await supabase
          .from('active_workout_sessions')
          .select('state, updated_at')
          .eq('user_id', userId)
          .maybeSingle()
        if (cancelled) return
        if (error) {
          const msg = String((error as any)?.message || '').toLowerCase()
          const code = String((error as any)?.code || '').toLowerCase()
          const isMissing = code === '42p01' || msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache')
          if (isMissing && !serverSessionSyncWarnedRef.current) {
            serverSessionSyncWarnedRef.current = true
            try {
              setNotification({ text: 'Sincronização do treino entre navegadores indisponível (migrations pendentes).', senderName: 'Aviso do Sistema' })
            } catch {}
          }
          return
        }

        const state = data?.state as any
        if (!state || typeof state !== 'object') return
        if (!state?.startedAt || !state?.workout) return

        const updatedAtMs = (() => {
          const fromCol = typeof (data as any)?.updated_at === 'string' ? Date.parse((data as any).updated_at) : NaN
          const fromState = Number(state?._savedAt ?? 0) || 0
          return Math.max(Number.isFinite(fromCol) ? fromCol : 0, fromState)
        })()

        if (updatedAtMs <= localSavedAt) return

        setActiveSession(state)
        navigateToView('active', { resetStack: true, replace: true, scroll: 'top' })
        try {
          window.localStorage.setItem(scopedKey, JSON.stringify(state))
        } catch {}
      } catch {}
    }

    loadServer()

    return () => {
      cancelled = true
    }
  }, [navigateToView, props.user?.id, supabase])

  useEffect(() => {
    const userId = props.user?.id ? String(props.user.id) : ''
    if (!userId) return
    if (typeof window === 'undefined') return

    let mounted = true
    let channel: any

    try {
      channel = supabase
        .channel(`active-workout-session:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'active_workout_sessions',
            filter: `user_id=eq.${userId}`,
          } as any,
          (payload: any) => {
            try {
              if (!mounted) return
              const ev = String(payload?.eventType || '').toUpperCase()
              if (ev === 'DELETE') {
                setActiveSession(null)
                navigateToView('dashboard', { resetStack: true, replace: true, scroll: 'top' })
                try {
                  window.localStorage.removeItem(`irontracks.activeSession.v2.${userId}`)
                } catch {}
                try {
                  setNotification({ text: 'Treino finalizado em outro dispositivo.', senderName: 'Aviso do Sistema' })
                } catch {}
                return
              }
              if (ev === 'UPDATE') {
                const state = payload?.new?.state
                if (!state || typeof state !== 'object' || !state?.startedAt || !state?.workout) {
                  setActiveSession(null)
                  navigateToView('dashboard', { resetStack: true, replace: true, scroll: 'top' })
                  try {
                    window.localStorage.removeItem(`irontracks.activeSession.v2.${userId}`)
                  } catch {}
                }
              }
            } catch {}
          }
        )
        .subscribe()
    } catch {}

    return () => {
      mounted = false
      try {
        if (channel) supabase.removeChannel(channel)
      } catch {}
    }
  }, [navigateToView, props.user?.id, supabase])

  useEffect(() => {
    const userId = props.user?.id ? String(props.user.id) : ''
    if (!userId) return
    if (typeof window === 'undefined') return
    const scopedKey = `irontracks.activeSession.v2.${userId}`

    try {
      if (!activeSession) {
        try {
          window.localStorage.removeItem(scopedKey)
        } catch {}
      } else {
        const payload = JSON.stringify({ ...(activeSession || {}), _savedAt: Date.now() })
        try {
          window.localStorage.setItem(scopedKey, payload)
        } catch {}
      }
    } catch {}

    try {
      if (serverSessionSyncRef.current?.timer) {
        try {
          clearTimeout(serverSessionSyncRef.current.timer)
        } catch {}
      }
    } catch {}

    const key = (() => {
      try {
        return JSON.stringify(activeSession || null)
      } catch {
        return ''
      }
    })()

    serverSessionSyncRef.current.key = key

    const run = async () => {
      try {
        if (serverSessionSyncRef.current.key !== key) return

        if (!activeSession) {
          const { error } = await supabase.from('active_workout_sessions').delete().eq('user_id', userId)
          if (error) {
            const msg = String((error as any)?.message || '').toLowerCase()
            const code = String((error as any)?.code || '').toLowerCase()
            const isMissing = code === '42p01' || msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache')
            if (isMissing && !serverSessionSyncWarnedRef.current) {
              serverSessionSyncWarnedRef.current = true
              try {
                setNotification({ text: 'Sincronização do treino entre navegadores indisponível (migrations pendentes).', senderName: 'Aviso do Sistema' })
              } catch {}
            }
          }
          return
        }

        const startedAtRaw = (activeSession as any)?.startedAt
        const startedAtMs = typeof startedAtRaw === 'number' ? startedAtRaw : new Date(startedAtRaw || 0).getTime()
        if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return
        if (!(activeSession as any)?.workout) return

        const state = { ...(activeSession || {}), _savedAt: Date.now() }
        const { error } = await supabase
          .from('active_workout_sessions')
          .upsert(
            {
              user_id: userId,
              started_at: new Date(startedAtMs).toISOString(),
              state,
              updated_at: new Date().toISOString(),
            } as any,
            { onConflict: 'user_id' } as any
          )
        if (error) {
          const msg = String((error as any)?.message || '').toLowerCase()
          const code = String((error as any)?.code || '').toLowerCase()
          const isMissing = code === '42p01' || msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache')
          if (isMissing && !serverSessionSyncWarnedRef.current) {
            serverSessionSyncWarnedRef.current = true
            try {
              setNotification({ text: 'Sincronização do treino entre navegadores indisponível (migrations pendentes).', senderName: 'Aviso do Sistema' })
            } catch {}
          }
        }
      } catch {}
    }

    let timerId: any = null

    try {
      timerId = setTimeout(() => {
        try {
          run()
        } catch {}
      }, 900)
      serverSessionSyncRef.current.timer = timerId
    } catch {}

    return () => {
      try {
        if (timerId) clearTimeout(timerId)
      } catch {}
    }
  }, [activeSession, props.user?.id, supabase])

  useEffect(() => {
    if (!activeModal) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      closeActiveModal()
    }

    try {
      window.addEventListener('keydown', onKeyDown)
    } catch {}

    return () => {
      try {
        window.removeEventListener('keydown', onKeyDown)
      } catch {}
    }
  }, [activeModal, closeActiveModal])

  useEffect(() => {
    if (!activeModal) return
    if (typeof document === 'undefined') return

    const body = document.body
    const prevOverflow = body.style.overflow
    const prevPaddingRight = body.style.paddingRight

    let scrollBarWidth = 0
    try {
      scrollBarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
    } catch {
      scrollBarWidth = 0
    }

    try {
      body.style.overflow = 'hidden'
      if (scrollBarWidth > 0) body.style.paddingRight = `${scrollBarWidth}px`
    } catch {}

    return () => {
      try {
        body.style.overflow = prevOverflow
        body.style.paddingRight = prevPaddingRight
      } catch {}
    }
  }, [activeModal])

  const clearSupabaseCookiesBestEffort = () => {
    try {
      if (typeof document === 'undefined') return
      const raw = String(document.cookie || '')
      const cookieNames = raw
        .split(';')
        .map((p) => p.trim())
        .map((p) => p.split('=')[0])
        .filter(Boolean)
      const targets = cookieNames.filter((n) => n.startsWith('sb-') || n.includes('supabase'))
      targets.forEach((name) => {
        try {
          document.cookie = `${name}=; Max-Age=0; path=/`
          document.cookie = `${name}=; Max-Age=0; path=/; samesite=lax`
          document.cookie = `${name}=; Max-Age=0; path=/; samesite=none; secure`
        } catch {}
      })
    } catch {}
  }

  const clearClientSessionState = () => {
    try {
      if (typeof localStorage === 'undefined') return
      localStorage.removeItem('activeSession')
      localStorage.removeItem('appView')
      const userId = props.user?.id ? String(props.user.id) : ''
      if (userId) {
        localStorage.removeItem(`irontracks.activeSession.v2.${userId}`)
        localStorage.removeItem(`irontracks.appView.v2.${userId}`)
      }
    } catch {}
  }

  const safeSignOut = async () => {
    try {
      clearSupabaseCookiesBestEffort()
      clearClientSessionState()
      try {
        if (typeof indexedDB !== 'undefined') {
          try {
            indexedDB.deleteDatabase('supabase-auth-token')
          } catch {}
        }
      } catch {}
    } catch {}
  }

  const handleLogout = async () => {
    const ok = await confirm('Deseja realmente sair da sua conta?', 'Sair')
    if (!ok) return
    try {
      setActiveSession(null)
    } catch {}
    await safeSignOut()
    try {
      window.location.href = '/'
    } catch {
      try {
        router.refresh()
      } catch {}
    }
  }

  const openWalletModal = async () => {
    if (!props.isCoach) return
    setActiveModal('wallet')
    setLoadingWallet(true)
    try {
      const res = await fetch('/api/teachers/wallet', { cache: 'no-store' })
      const json = await res.json().catch(() => ({} as any))
      if (!json?.ok) {
        await alert('Falha ao carregar walletId: ' + (json?.error || ''))
        setWalletIdDraft('')
        return
      }
      setWalletIdDraft(String(json?.teacher?.asaas_wallet_id || ''))
    } catch (e: any) {
      await alert('Erro ao carregar walletId: ' + (e?.message ?? String(e)))
      setWalletIdDraft('')
    } finally {
      setLoadingWallet(false)
    }
  }

  const saveWalletId = async () => {
    if (savingWallet) return
    const walletId = String(walletIdDraft || '').trim()
    if (!walletId) {
      await alert('Informe seu walletId do Asaas.')
      return
    }
    setSavingWallet(true)
    try {
      const res = await fetch('/api/teachers/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asaas_wallet_id: walletId }),
      })
      const json = await res.json().catch(() => ({} as any))
      if (!json?.ok) {
        await alert('Falha ao salvar walletId: ' + (json?.error || ''))
        return
      }
      await alert('WalletId salvo com sucesso!')
      setActiveModal(null)
    } catch (e: any) {
      await alert('Erro ao salvar walletId: ' + (e?.message ?? String(e)))
    } finally {
      setSavingWallet(false)
    }
  }

  const refreshWorkouts = async () => {
    try {
      const { data, error } = await supabase
        .from('workouts')
        .select('*, exercises(*, sets(*))')
        .eq('is_template', true)
        .eq('user_id', props.user.id)
        .order('name', { ascending: true })

      if (error) throw error
      const mapped = (data || []).map(mapWorkoutRow).filter((w: any) => Array.isArray(w?.exercises) && w.exercises.length > 0)
      setWorkouts(mapped)
    } catch (e: any) {
      await alert('Erro ao atualizar treinos: ' + (e?.message ?? String(e)))
    }
  }

  const handleSaveProfile = async () => {
    const nextName = String(profileDraftName || '').trim()
    if (!nextName) {
      await alert('Informe seu nome para completar o perfil.', 'Perfil incompleto')
      return
    }

    setSavingProfile(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert(
          {
            id: props.user.id,
            email: props.user.email,
            display_name: nextName,
            photo_url: props.user.photoURL ?? null,
            last_seen: new Date(),
            role: props.user.role || 'user',
          },
          { onConflict: 'id' }
        )
      if (error) throw error
      setProfileIncomplete(false)
      setActiveModal(null)
    } catch (e: any) {
      await alert('Erro ao salvar perfil: ' + (e?.message ?? String(e)))
    } finally {
      setSavingProfile(false)
    }
  }

  const handleStartSession = async (workout: any) => {
    const exercisesList = Array.isArray(workout?.exercises) ? workout.exercises.filter((ex: any) => ex && typeof ex === 'object') : []
    if (exercisesList.length === 0) {
      await alert('Este treino está sem exercícios válidos. Edite o treino antes de iniciar.', 'Treino incompleto')
      return false
    }

    const first = exercisesList[0] || {}
    const exMin = toMinutesRounded(estimateExerciseSeconds(first))
    const totalMin = toMinutesRounded(exercisesList.reduce((acc: number, ex: any) => acc + calculateExerciseDuration(ex), 0))
    const ok = await confirm(`Iniciar "${String(workout?.title || 'Treino')}"? Primeiro exercício: ~${exMin} min. Estimado total: ~${totalMin} min.`, 'Iniciar Treino')
    if (!ok) return false

    playStartSound()

    const seededLogs = (() => {
      const next: Record<string, any> = {}
      for (let exIdx = 0; exIdx < exercisesList.length; exIdx += 1) {
        const ex = exercisesList[exIdx] || {}
        const headerSets = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0)
        const setDetails = Array.isArray(ex?.setDetails)
          ? ex.setDetails
          : Array.isArray(ex?.set_details)
            ? ex.set_details
            : []
        const numSets = Math.max(headerSets, Array.isArray(setDetails) ? setDetails.length : 0)
        for (let setIdx = 0; setIdx < numSets; setIdx += 1) {
          const s = (Array.isArray(setDetails) ? setDetails[setIdx] : null) || null
          const weightRaw = s?.weight
          const repsRaw = s?.reps
          const rpeRaw = s?.rpe

          next[`${exIdx}-${setIdx}`] = {
            weight: weightRaw == null || weightRaw === '' ? '' : String(weightRaw),
            reps: repsRaw == null ? '' : String(repsRaw),
            rpe: rpeRaw == null || rpeRaw === '' ? '' : String(rpeRaw),
            note: '',
            done: false,
            is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
            advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null,
          }
        }
      }
      return next
    })()

    setActiveSession({
      workout: { ...workout, exercises: exercisesList },
      logs: seededLogs,
      startedAt: Date.now(),
      timerTargetTime: null,
    })
    navigateToView('active', { scroll: 'top' })
    return true
  }

  const handleUpdateSessionLog = (key: string, data: any) => {
    setActiveSession((prev: any) => {
      if (!prev) return null
      return { ...prev, logs: { ...(prev.logs || {}), [key]: data } }
    })
  }

  const handleStartTimer = (duration: number) => {
    setActiveSession((prev: any) => ({
      ...(prev || {}),
      timerTargetTime: Date.now() + duration * 1000,
    }))
  }

  const handleCloseTimer = () => {
    setActiveSession((prev: any) => ({
      ...(prev || {}),
      timerTargetTime: null,
    }))
  }

  const handleFinishSession = async (sessionData: any, showReport: boolean) => {
    setActiveSession(null)
    if (showReport === false) {
      navigateToView('dashboard', { resetStack: true, replace: true, scroll: 'top' })
      return
    }
    setReportData({ current: sessionData, previous: null })
    navigateToView('report', { replace: true, scroll: 'top' })
  }

  const handleCreateWorkout = () => {
    setCurrentWorkout({ title: '', exercises: [] })
    navigateToView('edit', { scroll: 'top' })
  }

  const handleEditWorkout = async (workout: any) => {
    if (!workout?.id) return
    try {
      const { data, error } = await supabase.from('workouts').select('*, exercises(*, sets(*))').eq('id', workout.id).maybeSingle()
      if (error) throw error
      if (!data) {
        setCurrentWorkout(workout)
        navigateToView('edit', { scroll: 'top' })
        return
      }
      setCurrentWorkout(mapWorkoutRow(data))
      navigateToView('edit', { scroll: 'top' })
    } catch (e: any) {
      await alert('Erro ao carregar treino para edição: ' + (e?.message ?? String(e)))
    }
  }

  const handleSaveWorkout = async (workoutToSave: any) => {
    const w = workoutToSave || currentWorkout
    if (!w || !w.title) return
    try {
      if (w.id) {
        await updateWorkout(w.id, w)
      } else {
        await createWorkout(w)
      }
      setCurrentWorkout(w)
      await refreshWorkouts()
      navigateToView('dashboard', { replace: true, scroll: 'top' })
    } catch (e: any) {
      await alert('Erro: ' + (e?.message ?? String(e)))
    }
  }

  const handleDeleteWorkout = async (id?: string, title?: string) => {
    const safeId = String(id || '').trim()
    if (!safeId) return
    const name = title || workouts.find((w: any) => w?.id === safeId)?.title || 'este treino'
    const ok = await confirm(`Apagar o treino "${String(name)}"?`, 'Excluir Treino')
    if (!ok) return
    try {
      await deleteWorkout(safeId)
      await refreshWorkouts()
    } catch (e: any) {
      await alert('Erro: ' + (e?.message ?? String(e)))
    }
  }

  const handleDuplicateWorkout = async (workout: any) => {
    const ok = await confirm(`Duplicar "${String(workout?.title || 'Treino')}"?`, 'Duplicar Treino')
    if (!ok) return
    const newWorkout = { ...workout, title: `${String(workout?.title || 'Treino')} (Cópia)` }
    delete newWorkout.id
    try {
      await createWorkout(newWorkout)
      await refreshWorkouts()
    } catch (e: any) {
      await alert('Erro ao duplicar: ' + (e?.message ?? String(e)))
    }
  }

  const handleShareWorkout = async (workout: any) => {
    setExportWorkout(workout)
    setActiveModal('export')
  }

  const handleExportPdf = async () => {
    if (!exportWorkout) return
    try {
      const html = workoutPlanHtml(exportWorkout, props.user)
      const win = window.open('', '_blank')
      if (!win) return
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => {
        try {
          win.print()
        } catch {}
      }, 300)
      setExportWorkout(null)
      setActiveModal(null)
    } catch (e: any) {
      await alert('Erro ao gerar PDF: ' + (e?.message ?? String(e)))
    }
  }

  const handleExportJson = async () => {
    if (!exportWorkout) return
    try {
      const json = JSON.stringify(
        {
          workout: {
            title: exportWorkout.title,
            exercises: (exportWorkout.exercises || []).map((ex: any) => ({
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              rpe: ex.rpe,
              cadence: ex.cadence,
              restTime: ex.restTime,
              method: ex.method,
              videoUrl: ex.videoUrl,
              notes: ex.notes,
            })),
          },
        },
        null,
        2
      )
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${String(exportWorkout.title || 'treino').replace(/\s+/g, '_')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setExportWorkout(null)
      setActiveModal(null)
    } catch (e: any) {
      await alert('Erro ao baixar JSON: ' + (e?.message ?? String(e)))
    }
  }

  const handleExportAllWorkouts = async () => {
    try {
      setExportingAll(true)
      const payload = {
        user: { id: props.user?.id || '', email: props.user?.email || '' },
        workouts: (workouts || []).map((w: any) => ({
          id: w?.id,
          title: w?.title,
          notes: w?.notes,
          is_template: true,
          exercises: (w?.exercises || []).map((ex: any) => ({
            name: ex?.name,
            sets: ex?.sets,
            reps: ex?.reps,
            rpe: ex?.rpe,
            cadence: ex?.cadence,
            restTime: ex?.restTime,
            method: ex?.method,
            videoUrl: ex?.videoUrl,
            notes: ex?.notes,
          })),
        })),
      }
      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `irontracks_workouts_${new Date().toISOString()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      await alert('Erro ao exportar JSON: ' + (e?.message ?? String(e)))
    } finally {
      setExportingAll(false)
    }
  }

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e?.target?.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(String(event?.target?.result || ''))
        const ok = await confirm(`Importar dados de ${json?.user?.email || 'Unknown'}? Isso criará novos treinos.`, 'Importar Backup')
        if (!ok) return
        await importData(json)
        await refreshWorkouts()
        await alert('Dados importados com sucesso!', 'Sucesso')
        setActiveModal(null)
      } catch (err: any) {
        await alert('Erro ao ler arquivo JSON: ' + (err?.message ?? String(err)))
      }
    }
    reader.readAsText(file)
  }

  const currentWorkoutId = activeSession?.workout?.id
  let nextWorkout: any = null
  if (currentWorkoutId && Array.isArray(workouts) && workouts.length > 0) {
    const index = workouts.findIndex((w: any) => w?.id === currentWorkoutId)
    if (index !== -1 && index + 1 < workouts.length) nextWorkout = workouts[index + 1]
  }

  const isHeaderVisible = view !== 'active' && view !== 'report'

  useEffect(() => {
    if (!isHeaderVisible) return
    const el = headerRef.current
    if (!el) return

    let raf = 0
    const measure = () => {
      try {
        const h = el.getBoundingClientRect().height
        if (Number.isFinite(h) && h > 0) setHeaderHeightPx(Math.round(h))
      } catch {}
    }

    measure()

    const onResize = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }

    let ro: ResizeObserver | null = null
    try {
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => onResize())
        ro.observe(el)
      }
    } catch {
      ro = null
    }

    try {
      window.addEventListener('resize', onResize, { passive: true } as any)
    } catch {}

    return () => {
      try {
        if (raf) cancelAnimationFrame(raf)
      } catch {}
      try {
        ro?.disconnect()
      } catch {}
      try {
        window.removeEventListener('resize', onResize as any)
      } catch {}
    }
  }, [isHeaderVisible])

  useEffect(() => {
    if (!pendingScrollRestoreRef.current) return
    if (pendingScrollRestoreRef.current !== view) return
    pendingScrollRestoreRef.current = null
    try {
      requestAnimationFrame(() => restoreScrollPosition(view))
    } catch {
      restoreScrollPosition(view)
    }
  }, [restoreScrollPosition, view])

  const headerTitle = (() => {
    if (view === 'assessments') return 'Avaliações'
    if (view === 'history') return 'Histórico'
    if (view === 'chatList') return 'Conversas'
    if (view === 'directChat') return String(directChat?.other_user_name || 'Conversa')
    if (view === 'globalChat') return 'Iron Lounge'
    if (view === 'chat') return 'Chat'
    if (view === 'edit') return 'Editor'
    return 'Dashboard'
  })()

  const handleHeaderBack = () => {
    goBackView('dashboard')
  }

  const handleRealtimeNotification = (payload: NotificationPayload | null) => {
    setNotification(payload)
    if (payload) {
      setHasUnreadNotification(true)
      setHasUnreadChat(true)
    }
  }

  const quickViewExercises = Array.isArray(quickViewWorkout?.exercises) ? quickViewWorkout.exercises : []

  return (
    <TeamWorkoutProvider user={props.user as any}>
      <div className="w-full bg-neutral-900 min-h-screen relative flex flex-col overflow-hidden">
        <IncomingInviteModal onStartSession={handleStartSession} />

        {isHeaderVisible && (
          <div ref={headerRef} className="bg-neutral-950 fixed top-0 left-0 right-0 z-40 border-b border-zinc-800 shadow-lg pt-[env(safe-area-inset-top)]">
            <div className="w-full px-4 md:px-8 min-h-[4rem] flex justify-between items-center">
              {view === 'dashboard' ? (
                <div className="flex items-center cursor-pointer group" onClick={() => navigateToView('dashboard', { resetStack: true, replace: true, scroll: 'top' })}>
                  <div className="flex items-center gap-2">
                    <Dumbbell size={18} className="text-yellow-500 opacity-25 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite]" />
                    <h1 className="text-2xl font-black tracking-tighter italic leading-none text-white group-hover:opacity-80 transition-opacity">
                      IRON<span className="text-yellow-500">TRACKS</span>
                    </h1>
                  </div>
                  <div className="h-6 w-px bg-yellow-500 mx-4 opacity-50" />
                  <span className="text-zinc-400 text-xs font-medium tracking-wide uppercase">{props.isCoach ? 'Bem vindo Coach' : 'Bem vindo Atleta'}</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={handleHeaderBack}
                    className="flex items-center gap-2 text-neutral-300 hover:text-white px-3 py-2 rounded-full bg-neutral-900 border border-neutral-700 active:scale-95 transition-transform"
                    aria-label="Voltar"
                  >
                    <ArrowLeft size={18} />
                    <span className="text-xs font-bold uppercase tracking-wide">Voltar</span>
                  </button>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase text-neutral-500 font-bold">{props.isCoach ? 'Coach' : 'Atleta'}</div>
                    <div className="text-sm font-black tracking-tight text-white truncate">{headerTitle}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <HeaderActionsMenu
                  user={props.user as any}
                  isCoach={props.isCoach}
                  hasUnreadChat={hasUnreadChat}
                  hasUnreadNotification={hasUnreadNotification}
                  onOpenAdmin={() => setActiveModal('admin')}
                  onOpenChatList={() => {
                    setHasUnreadChat(false)
                    navigateToView('chatList', { scroll: 'top' })
                  }}
                  onOpenGlobalChat={() => {
                    setHasUnreadChat(false)
                    navigateToView('globalChat', { scroll: 'top' })
                  }}
                  onOpenHistory={() => navigateToView('history', { scroll: 'top' })}
                  onOpenNotifications={() => {
                    setHasUnreadNotification(false)
                    setActiveModal('notifications')
                  }}
                  onOpenSchedule={() => router.push('/dashboard/schedule')}
                  onOpenWallet={openWalletModal}
                  onLogout={handleLogout}
                />
              </div>
            </div>
          </div>
        )}

        {props.isCoach && props.coachPending && (
          <div className="bg-yellow-500 text-black text-sm font-bold">
            <div className="w-full px-4 md:px-8 py-2 text-center">
              Sua conta de Professor está pendente.{' '}
              <button
                className="underline"
                onClick={async () => {
                  try {
                    const r = await fetch('/api/teachers/accept', { method: 'POST' })
                    const j = await r.json()
                    if (j?.ok) {
                      await alert('Conta ativada!')
                    } else {
                      await alert('Falha ao ativar: ' + (j?.error || ''))
                    }
                  } catch (e: any) {
                    await alert('Erro: ' + (e?.message ?? String(e)))
                  }
                }}
              >
                Aceitar
              </button>
            </div>
          </div>
        )}

        <RealtimeNotificationBridge setNotification={handleRealtimeNotification as any} />

        <div
          ref={scrollRef}
          style={{
            ['--dashboard-sticky-top' as any]: `${Math.max(0, headerHeightPx) + STICKY_GAP_PX}px`,
            paddingTop: isHeaderVisible ? 'var(--dashboard-sticky-top)' : undefined,
          }}
          className="flex-1 overflow-y-auto custom-scrollbar relative"
        >
          {view === 'dashboard' || view === 'assessments' ? (
            props.isCoach ? (
              <TeacherDashboard
                workouts={workouts}
                profileIncomplete={profileIncomplete}
                onOpenCompleteProfile={() => setActiveModal('completeProfile')}
                view={view as any}
                onChangeView={(next: any) => navigateToView(next, { scroll: 'top' })}
                onCreateWorkout={handleCreateWorkout}
                onQuickView={(w) => {
                  setQuickViewWorkout(w)
                  setActiveModal('quickView')
                }}
                onStartSession={handleStartSession}
                onShareWorkout={handleShareWorkout}
                onDuplicateWorkout={handleDuplicateWorkout}
                onEditWorkout={handleEditWorkout}
                onDeleteWorkout={handleDeleteWorkout}
                currentUserId={props.user.id}
                exportingAll={exportingAll}
                onExportAll={handleExportAllWorkouts}
                onOpenJsonImport={() => setActiveModal('jsonImport')}
                assessmentsContent={<AssessmentHistory studentId={props.user.id} />}
              />
            ) : (
              <StudentDashboard
                workouts={workouts}
                profileIncomplete={profileIncomplete}
                onOpenCompleteProfile={() => setActiveModal('completeProfile')}
                view={view as any}
                onChangeView={(next: any) => navigateToView(next, { scroll: 'top' })}
                onCreateWorkout={handleCreateWorkout}
                onQuickView={(w) => {
                  setQuickViewWorkout(w)
                  setActiveModal('quickView')
                }}
                onStartSession={handleStartSession}
                onShareWorkout={handleShareWorkout}
                onDuplicateWorkout={handleDuplicateWorkout}
                onEditWorkout={handleEditWorkout}
                onDeleteWorkout={handleDeleteWorkout}
                currentUserId={props.user.id}
                exportingAll={exportingAll}
                onExportAll={handleExportAllWorkouts}
                onOpenJsonImport={() => setActiveModal('jsonImport')}
                assessmentsContent={<AssessmentHistory studentId={props.user.id} />}
              />
            )
          ) : null}

          {view === 'edit' && (
            <ExerciseEditor
              workout={currentWorkout}
              onSave={handleSaveWorkout}
              onCancel={() => goBackView('dashboard')}
              onChange={setCurrentWorkout}
              onSaved={() => {
                refreshWorkouts().catch(() => {})
                navigateToView('dashboard', { replace: true, scroll: 'top' })
              }}
            />
          )}

          {view === 'active' && activeSession && (
            <ActiveWorkout
              session={activeSession}
              user={props.user as any}
              onUpdateLog={handleUpdateSessionLog}
              onFinish={handleFinishSession}
              onBack={() => goBackView('dashboard')}
              onStartTimer={handleStartTimer}
              isCoach={props.isCoach}
              onUpdateSession={(updates: any) => setActiveSession((prev: any) => ({ ...(prev || {}), ...(updates || {}) }))}
              nextWorkout={nextWorkout}
            />
          )}

          {view === 'history' && (
            <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-4 pb-24">
              <HistoryList
                user={props.user as any}
                onViewReport={(s: any) => {
                  setReportData({ current: s, previous: null })
                  navigateToView('report', { scroll: 'top' })
                }}
                onBack={() => goBackView('dashboard')}
                targetId={null as any}
                targetEmail={null as any}
                readOnly={false as any}
                title={'Histórico' as any}
                embedded
              />
            </div>
          )}

          {view === 'report' && reportData?.current && (
            <div className="fixed inset-0 z-[1200] bg-neutral-900 overflow-y-auto pt-safe">
              <WorkoutReport
                session={reportData.current}
                previousSession={reportData.previous}
                user={props.user as any}
                onClose={() => goBackView('dashboard')}
              />
            </div>
          )}

          {view === 'chat' && (
            <div className="absolute inset-0 z-50 bg-neutral-900">
              <ChatScreen user={props.user as any} onClose={() => goBackView('dashboard')} />
            </div>
          )}

          {view === 'globalChat' && (
            <div className="absolute inset-0 z-50 bg-neutral-900">
              <ChatScreen user={props.user as any} onClose={() => goBackView('dashboard')} />
            </div>
          )}

          {view === 'chatList' && (
            <div className="absolute inset-0 z-50 bg-neutral-900">
              <ChatListScreen
                user={props.user as any}
                onClose={() => goBackView('dashboard')}
                onSelectUser={() => {}}
                onSelectChannel={(c: any) => {
                  setDirectChat(c)
                  navigateToView('directChat', { scroll: 'top' })
                }}
              />
            </div>
          )}

          {view === 'directChat' && directChat && (
            <div className="absolute inset-0 z-50 bg-neutral-900">
              <ChatDirectScreen
                user={props.user as any}
                targetUser={{
                  id: directChat.other_user_id,
                  display_name: directChat.other_user_name,
                  photo_url: directChat.other_user_photo,
                }}
                otherUserId={directChat.other_user_id}
                otherUserName={directChat.other_user_name}
                otherUserPhoto={directChat.other_user_photo}
                onClose={() => goBackView('chatList')}
              />
            </div>
          )}
        </div>

        {activeModal === 'completeProfile' && (
          <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeActiveModal}>
            <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-black text-white">Completar Perfil</h3>
                <button
                  type="button"
                  onClick={closeActiveModal}
                  disabled={!canCloseActiveModal}
                  className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors disabled:opacity-60"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>

              <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Nome de Exibição</label>
              <input
                value={profileDraftName}
                onChange={(e) => setProfileDraftName(e.target.value)}
                placeholder="Ex: João Silva"
                disabled={savingProfile}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500 disabled:opacity-60"
              />

              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={closeActiveModal}
                  disabled={savingProfile}
                  className="flex-1 p-3 bg-neutral-800 rounded-xl font-bold text-neutral-300 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="flex-1 p-3 bg-yellow-500 rounded-xl font-black text-black disabled:opacity-50"
                >
                  {savingProfile ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeModal === 'jsonImport' && (
          <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeActiveModal}>
            <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 text-center" onClick={(e) => e.stopPropagation()}>
              <Upload size={48} className="mx-auto text-yellow-500 mb-4" />
              <h3 className="font-bold text-white mb-2 text-xl">Restaurar Backup</h3>
              <p className="text-neutral-400 text-sm mb-6">Selecione o arquivo .json que você salvou anteriormente.</p>

              <label className="block w-full cursor-pointer bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 rounded-xl transition-colors">
                Selecionar Arquivo
                <input type="file" accept=".json" onChange={handleJsonUpload} className="hidden" />
              </label>

              <button onClick={closeActiveModal} className="mt-4 text-neutral-500 text-sm hover:text-white">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {activeModal === 'export' && exportWorkout && (
          <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeActiveModal}>
            <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                <h3 className="font-bold text-white">Como deseja exportar?</h3>
                <BackButton onClick={closeActiveModal} className="bg-transparent hover:bg-neutral-800 text-neutral-300" />
              </div>
              <div className="p-4 space-y-3">
                <button onClick={handleExportPdf} className="w-full px-4 py-3 bg-yellow-500 text-black font-bold rounded-xl">
                  Baixar PDF
                </button>
                <button onClick={handleExportJson} className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold rounded-xl">
                  Baixar JSON
                </button>
              </div>
            </div>
          </div>
        )}

        {activeModal === 'quickView' && quickViewWorkout && (
          <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeActiveModal}>
            <div className="bg-neutral-900 w-full max-w-lg rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 flex justify-between items-center border-b border-neutral-800">
                <h3 className="font-bold text-white">{String(quickViewWorkout?.title || 'Treino')}</h3>
                <button
                  type="button"
                  onClick={closeActiveModal}
                  className="flex items-center gap-2 text-yellow-500 hover:text-yellow-400 transition-colors py-2 px-3 rounded-xl hover:bg-neutral-800 active:opacity-70"
                  aria-label="Voltar"
                >
                  <ArrowLeft size={20} />
                  <span className="font-semibold text-sm">Voltar</span>
                </button>
              </div>
              <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3 custom-scrollbar">
                {quickViewExercises.map((ex: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-white text-sm">{String(ex?.name || 'Exercício')}</h4>
                      <span className="text-xs text-neutral-400">{(parseInt(String(ex?.sets || '0')) || 0)} x {ex?.reps || '-'}</span>
                    </div>
                    <div className="text-xs text-neutral-400 mt-1 flex items-center gap-2">
                      <Clock size={14} className="text-yellow-500" />
                      <span>Descanso: {ex?.restTime ? `${parseInt(String(ex.restTime))}s` : '-'}</span>
                    </div>
                    {ex?.notes ? <p className="text-sm text-neutral-300 mt-2">{String(ex.notes)}</p> : null}
                  </div>
                ))}
                {quickViewExercises.length === 0 && (
                  <p className="text-neutral-400 text-sm">Este treino não tem exercícios.</p>
                )}
              </div>
              <div className="p-4 border-t border-neutral-800 flex gap-2">
                <button
                  onClick={async () => {
                    if (startingQuickViewSession) return
                    const w = quickViewWorkout
                    setStartingQuickViewSession(true)
                    try {
                      const started = await handleStartSession(w)
                      if (started) closeActiveModal()
                    } finally {
                      setStartingQuickViewSession(false)
                    }
                  }}
                  disabled={startingQuickViewSession}
                  className="flex-1 min-h-[44px] px-4 py-3 bg-yellow-500 text-black font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {startingQuickViewSession ? <Loader2 size={18} className="animate-spin" /> : null}
                  {startingQuickViewSession ? 'Iniciando...' : 'Iniciar Treino'}
                </button>
                <button onClick={closeActiveModal} className="flex-1 p-3 bg-neutral-800 text-white font-bold rounded-xl">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {activeModal === 'notifications' && (
          <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeActiveModal}>
            <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 flex justify-between items-center border-b border-neutral-800">
                <h3 className="font-bold text-white">Notificações</h3>
                <button
                  type="button"
                  onClick={closeActiveModal}
                  className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 relative">
                <NotificationCenter user={props.user as any} onStartSession={handleStartSession} initialOpen embedded />
              </div>
            </div>
          </div>
        )}

        {activeModal === 'wallet' && (
          <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeActiveModal}>
            <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 flex justify-between items-center border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-yellow-500" />
                  <h3 className="font-bold text-white">Carteira (Asaas)</h3>
                </div>
                <button
                  type="button"
                  onClick={closeActiveModal}
                  disabled={!canCloseActiveModal}
                  className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <div className="text-sm text-neutral-300">
                  Cole aqui o seu <span className="font-bold text-white">walletId</span> do Asaas para receber repasses.
                </div>
                <input
                  value={walletIdDraft}
                  onChange={(e) => setWalletIdDraft(e.target.value)}
                  placeholder={loadingWallet ? 'Carregando...' : 'Ex: 12345678-...'}
                  disabled={loadingWallet || savingWallet}
                  className="w-full bg-neutral-800 p-3 rounded-xl text-white border border-neutral-700 focus:border-yellow-500 outline-none disabled:opacity-60"
                />
                <button
                  onClick={saveWalletId}
                  disabled={loadingWallet || savingWallet}
                  className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black disabled:opacity-60"
                >
                  {savingWallet ? 'Salvando...' : 'Salvar walletId'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSession?.timerTargetTime ? <RestTimerOverlay targetTime={activeSession.timerTargetTime} onClose={handleCloseTimer} onFinish={handleCloseTimer} /> : null}

        {notification ? (
          <NotificationToast
            notification={notification as any}
            onClose={() => {
              try {
                const senderName = String((notification as any)?.senderName ?? '')
                const isSystem = senderName === 'Aviso do Sistema' || senderName === 'Sistema'
                if (!isSystem) {
                  setHasUnreadChat(false)
                  navigateToView('chat', { scroll: 'top' })
                }
              } catch {}
              setNotification(null)
            }}
          />
        ) : null}

        {activeModal === 'admin' ? <AdminPanelV2 user={props.user as any} onClose={closeActiveModal} /> : null}
      </div>
    </TeamWorkoutProvider>
  )
}

export default function DashboardApp(props: Props) {
  return (
    <ErrorBoundary>
      <DialogProvider>
        <DashboardInner {...props} />
        <GlobalDialog />
      </DialogProvider>
    </ErrorBoundary>
  )
}
