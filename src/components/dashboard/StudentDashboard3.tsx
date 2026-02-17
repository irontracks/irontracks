'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

import { Plus, Dumbbell, Play, Share2, Copy, Pencil, Trash2, Loader2, Activity, CalendarDays, Sparkles, X, GripVertical, Save, Undo2, Crown } from 'lucide-react'
import { Reorder, useDragControls } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import BadgesGallery from './BadgesGallery'
import RecentAchievements from './RecentAchievements'
import WorkoutCalendarModal from './WorkoutCalendarModal'
import StoriesBar from './StoriesBar'
import MuscleMapCard from './MuscleMapCard'
import { trackUserEvent } from '@/lib/telemetry/userActivity'

function SortableWorkoutItem({
  item,
  index,
  onChangeTitle,
  saving,
}: {
  item: { id: string; title: string; sort_order: number }
  index: number
  onChangeTitle: (id: string, val: string) => void
  saving: boolean
}) {
  const controls = useDragControls()

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 relative touch-none select-none"
    >
      <div
        className={`text-neutral-500 p-2 -m-2 touch-none ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
        onPointerDown={(e) => !saving && controls.start(e)}
      >
        <GripVertical size={18} />
      </div>
      <div className="w-10 text-xs font-mono text-neutral-500">#{index + 1}</div>
      <input
        value={item.title}
        onChange={(e) => onChangeTitle(item.id, e.target.value)}
        disabled={saving}
        className="flex-1 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500 disabled:opacity-50"
        placeholder="Título"
        onPointerDown={(e) => e.stopPropagation()}
      />
    </Reorder.Item>
  )
}

export type DashboardWorkout = {
  id?: string
  user_id?: string | null
  created_by?: string | null
  title?: string
  notes?: string | null
  exercises?: any[]
  exercises_count?: number | null
  archived_at?: string | null
  sort_order?: number
  created_at?: string | null
}

type MaybePromise<T> = T | Promise<T>

type Props = {
  workouts: DashboardWorkout[]
  profileIncomplete: boolean
  onOpenCompleteProfile: () => void
  view: 'dashboard' | 'assessments' | 'community' | 'vip'
  onChangeView: (next: 'dashboard' | 'assessments' | 'community' | 'vip') => void
  assessmentsContent?: React.ReactNode
  communityContent?: React.ReactNode
  vipContent?: React.ReactNode
  vipLabel?: string
  vipLocked?: boolean
  vipEnabled?: boolean
  settings?: {
    dashboardDensity?: 'compact' | 'comfortable'
    uiMode?: string
    moduleSocial?: boolean
    moduleCommunity?: boolean
    moduleMarketplace?: boolean
    showStoriesBar?: boolean
    showNewRecordsCard?: boolean
    showIronRank?: boolean
    showBadges?: boolean
  } | null
  onCreateWorkout: () => MaybePromise<void>
  onQuickView: (w: DashboardWorkout) => void
  onStartSession: (w: DashboardWorkout) => MaybePromise<void | boolean>
  onRestoreWorkout?: (w: DashboardWorkout) => MaybePromise<void>
  onShareWorkout: (w: DashboardWorkout) => MaybePromise<void>
  onDuplicateWorkout: (w: DashboardWorkout) => MaybePromise<void>
  onEditWorkout: (w: DashboardWorkout) => MaybePromise<void>
  onDeleteWorkout: (id?: string, title?: string) => MaybePromise<void>
  onBulkEditWorkouts?: (items: { id: string; title: string; sort_order: number }[]) => MaybePromise<void>
  currentUserId?: string
  newRecordsReloadKey?: number
  exportingAll?: boolean
  onExportAll: () => MaybePromise<void>
  onOpenJsonImport: () => void
  onNormalizeExercises?: () => MaybePromise<void>
  onNormalizeAiWorkoutTitles?: () => MaybePromise<void>
  onOpenDuplicates?: () => MaybePromise<void>
  onApplyTitleRule?: () => MaybePromise<void>
  onOpenIronScanner: () => void
  streakStats?: {
    currentStreak: number
    bestStreak: number
    totalWorkouts: number
    totalVolumeKg: number
    badges: { id: string; label: string; kind: string }[]
  } | null
  streakLoading?: boolean
}

export default function StudentDashboard(props: Props) {
  const supabase = useMemo(() => createClient(), [])
  const workouts = Array.isArray(props.workouts) ? props.workouts : []
  const density = props.settings?.dashboardDensity === 'compact' ? 'compact' : 'comfortable'
  const [toolsOpen, setToolsOpen] = useState(false)
  const [workoutsTab, setWorkoutsTab] = useState<'normal' | 'periodized'>('normal')
  const [periodizedLoading, setPeriodizedLoading] = useState(false)
  const [periodizedLoaded, setPeriodizedLoaded] = useState(false)
  const [periodizedWorkouts, setPeriodizedWorkouts] = useState<DashboardWorkout[]>([])
  const [periodizedError, setPeriodizedError] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [checkinsOpen, setCheckinsOpen] = useState(false)
  const [checkinsLoading, setCheckinsLoading] = useState(false)
  const [checkinsRows, setCheckinsRows] = useState<any[]>([])
  const [checkinsFilter, setCheckinsFilter] = useState<'all' | 'pre' | 'post'>('all')
  const [checkinsRange, setCheckinsRange] = useState<'7d' | '30d'>('7d')
  const [creatingWorkout, setCreatingWorkout] = useState(false)
  const [normalizingAiTitles, setNormalizingAiTitles] = useState(false)
  const [normalizingExercises, setNormalizingExercises] = useState(false)
  const [findingDuplicates, setFindingDuplicates] = useState(false)
  const [applyingTitleRule, setApplyingTitleRule] = useState(false)
  const [editListOpen, setEditListOpen] = useState(false)
  const [editListDraft, setEditListDraft] = useState<{ id: string; title: string; sort_order: number }[]>([])
  const [savingListEdits, setSavingListEdits] = useState(false)
  const [pendingAction, setPendingAction] = useState<
    | {
        workoutKey: string
        type: 'open' | 'start' | 'restore' | 'share' | 'duplicate' | 'edit' | 'delete'
      }
    | null
  >(null)
  const TABS_BAR_MIN_HEIGHT_PX = 60
  const CREATE_WORKOUT_LOADING_TIMEOUT_MS = 900
  const isMountedRef = useRef(true)
  const showNewRecordsCard = props.settings?.showNewRecordsCard !== false
  const showIronRank = props.settings?.showIronRank !== false
  const showBadges = props.settings?.showBadges !== false
  const showStoriesBar = props.settings?.moduleSocial !== false && props.settings?.showStoriesBar !== false && !!String(props.currentUserId || '').trim()
  const isPeriodizedWorkout = (w: DashboardWorkout) => {
    const title = String((w as any)?.title || (w as any)?.name || '').trim()
    return title.startsWith('VIP •')
  }
  const workoutsForTab =
    workoutsTab === 'periodized'
      ? (periodizedLoaded ? periodizedWorkouts : workouts.filter(isPeriodizedWorkout))
      : workouts.filter((w) => !isPeriodizedWorkout(w))
  const archivedCount = workoutsForTab.reduce((acc, w) => (w?.archived_at ? acc + 1 : acc), 0)
  const visibleWorkouts = showArchived ? workoutsForTab : workoutsForTab.filter((w) => !w?.archived_at)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (props.view !== 'dashboard') return
    if (workoutsTab !== 'periodized') return
    setPeriodizedLoaded(false)
    setPeriodizedWorkouts([])
    setPeriodizedError('')
  }, [props.view, workoutsTab])

  useEffect(() => {
    if (workoutsTab !== 'periodized') return
    if (periodizedLoaded) return
    if (periodizedLoading) return
    let cancelled = false
    setPeriodizedLoading(true)
    setPeriodizedError('')
    ;(async () => {
      try {
        const res = await fetch('/api/vip/periodization/active', { method: 'GET', credentials: 'include', cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (!json?.ok) {
          const msg = String(json?.error || 'Falha ao carregar periodização.')
          setPeriodizedWorkouts([])
          setPeriodizedLoaded(true)
          setPeriodizedError(msg)
          return
        }
        const rows = Array.isArray(json?.workouts) ? json.workouts : []
        const ids = rows.map((r: any) => String(r?.workout_id || '').trim()).filter(Boolean)
        const countById = new Map<string, number>()
        rows.forEach((r: any) => {
          const id = String(r?.workout_id || '').trim()
          const n = Number(r?.exercise_count)
          if (!id) return
          if (!Number.isFinite(n)) return
          countById.set(id, Math.max(0, Math.floor(n)))
        })
        if (ids.length === 0) {
          setPeriodizedWorkouts([])
          setPeriodizedLoaded(true)
          setPeriodizedError(json?.program?.id ? 'Programa encontrado, mas sem treinos vinculados.' : '')
          return
        }

        const { data, error } = await supabase
          .from('workouts')
          .select(
            `
            id,
            user_id,
            created_by,
            name,
            notes,
            archived_at,
            sort_order,
            created_at
          `,
          )
          .in('id', ids)
          .limit(ids.length)

        if (cancelled) return
        if (error) {
          setPeriodizedWorkouts([])
          setPeriodizedLoaded(true)
          setPeriodizedError(String((error as any)?.message || 'Falha ao carregar treinos periodizados.'))
          return
        }

        const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
        const mapped = (Array.isArray(data) ? data : [])
          .filter((w: any) => isRecord(w))
          .map((w: any) => {
            const workout = w as Record<string, unknown>
            const wid = workout.id != null ? String(workout.id) : ''
            return {
              id: workout.id != null ? String(workout.id) : undefined,
              title: String(workout.name ?? ''),
              notes: workout.notes as any,
              exercises: [] as any,
              exercises_count: wid ? (countById.get(wid) ?? null) : null,
              user_id: workout.user_id != null ? String(workout.user_id) : undefined,
              created_by: workout.created_by != null ? String(workout.created_by) : undefined,
              archived_at: (workout as any).archived_at ?? null,
              sort_order: typeof (workout as any).sort_order === 'number' ? ((workout as any).sort_order as number) : ((workout as any).sort_order == null ? 0 : Number((workout as any).sort_order) || 0),
              created_at: (workout as any).created_at ?? null,
            } as DashboardWorkout
          })

        const byId = new Map<string, DashboardWorkout>()
        mapped.forEach((w: DashboardWorkout) => {
          const id = String(w?.id || '').trim()
          if (id) byId.set(id, w)
        })
        const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as DashboardWorkout[]
        setPeriodizedWorkouts(ordered)
        setPeriodizedLoaded(true)
      } catch {
        if (!cancelled) {
          setPeriodizedWorkouts([])
          setPeriodizedLoaded(true)
          setPeriodizedError('Falha ao carregar treinos periodizados.')
        }
      } finally {
        if (!cancelled) setPeriodizedLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [periodizedLoaded, periodizedLoading, supabase, workoutsTab])

  const safeSetPendingAction = (next: typeof pendingAction) => {
    if (!isMountedRef.current) return
    setPendingAction(next)
  }

  const getWorkoutKey = (w: DashboardWorkout, idx: number) => String(w?.id ?? idx)
  const isWorkoutBusy = (workoutKey: string) => pendingAction?.workoutKey === workoutKey
  const isActionBusy = (workoutKey: string, type: NonNullable<typeof pendingAction>['type']) =>
    pendingAction?.workoutKey === workoutKey && pendingAction?.type === type

  const runWorkoutAction = async (workoutKey: string, type: NonNullable<typeof pendingAction>['type'], fn: () => unknown) => {
    if (isWorkoutBusy(workoutKey)) return
    safeSetPendingAction({ workoutKey, type })
    try {
      await Promise.resolve(fn())
    } finally {
      safeSetPendingAction(null)
    }
  }

  const isPeriodizedWorkoutFullyLoaded = (w: DashboardWorkout) => {
    const exs = Array.isArray(w?.exercises) ? (w.exercises as any[]) : []
    if (exs.length === 0) return false
    return exs.some((e) => Array.isArray((e as any)?.setDetails))
  }

  const loadWorkoutFullById = async (workoutId: string): Promise<DashboardWorkout | null> => {
    const id = String(workoutId || '').trim()
    if (!id) return null
    const { data, error } = await supabase
      .from('workouts')
      .select(
        `
        id,
        user_id,
        created_by,
        name,
        notes,
        archived_at,
        sort_order,
        created_at,
        exercises (
          id,
          name,
          notes,
          video_url,
          rest_time,
          cadence,
          method,
          "order",
          sets ( id, set_number, weight, reps, rpe, completed, is_warmup, advanced_config )
        )
      `,
      )
      .eq('id', id)
      .maybeSingle()

    if (error || !data?.id) return null

    const workout: Record<string, unknown> = data as any
    const rawExercises = Array.isArray(workout?.exercises) ? (workout.exercises as unknown[]) : []
    const exs = rawExercises
      .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
      .sort((a, b) => (Number((a as any).order) || 0) - (Number((b as any).order) || 0))
      .map((e) => {
        const isCardio = String((e as any).method || '').toLowerCase() === 'cardio'
        const dbSets = Array.isArray((e as any).sets) ? ((e as any).sets as unknown[]).filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object')) : []
        const sortedSets = dbSets.slice().sort((aSet, bSet) => (Number((aSet as any)?.set_number) || 0) - (Number((bSet as any)?.set_number) || 0))
        const setsCount = sortedSets.length || (isCardio ? 1 : 4)
        const setDetails = sortedSets.map((s, idx) => ({
          set_number: (s as any)?.set_number ?? idx + 1,
          reps: (s as any)?.reps ?? null,
          rpe: (s as any)?.rpe ?? null,
          weight: (s as any)?.weight ?? null,
          is_warmup: !!((s as any)?.is_warmup ?? (s as any)?.isWarmup),
          advanced_config: (s as any)?.advanced_config ?? (s as any)?.advancedConfig ?? null,
        }))
        const nonEmptyReps = setDetails.map((s: any) => s.reps).filter((r: any) => r !== null && r !== undefined && r !== '')
        const defaultReps = isCardio ? '20' : '10'
        let repsHeader = defaultReps
        if (nonEmptyReps.length > 0) {
          const uniqueReps = Array.from(new Set(nonEmptyReps))
          repsHeader = uniqueReps.length === 1 ? String(uniqueReps[0] ?? defaultReps) : String(nonEmptyReps[0] ?? defaultReps)
        }
        const rpeValues = setDetails.map((s: any) => s.rpe).filter((v: any) => v !== null && v !== undefined && !Number.isNaN(Number(v)))
        const defaultRpe = isCardio ? 5 : 8
        const rpeHeader = rpeValues.length > 0 ? (Number(rpeValues[0]) || defaultRpe) : defaultRpe
        return {
          id: (e as any).id,
          name: (e as any).name,
          notes: (e as any).notes,
          videoUrl: (e as any).video_url,
          restTime: (e as any).rest_time,
          cadence: (e as any).cadence,
          method: (e as any).method,
          sets: setsCount,
          reps: repsHeader,
          rpe: rpeHeader,
          setDetails,
        }
      })
      .filter(Boolean)

    return {
      id: workout.id != null ? String(workout.id) : undefined,
      title: String(workout.name ?? ''),
      notes: workout.notes as any,
      exercises: exs as any,
      user_id: workout.user_id != null ? String(workout.user_id) : undefined,
      created_by: workout.created_by != null ? String(workout.created_by) : undefined,
      archived_at: (workout as any).archived_at ?? null,
      sort_order: typeof (workout as any).sort_order === 'number' ? ((workout as any).sort_order as number) : ((workout as any).sort_order == null ? 0 : Number((workout as any).sort_order) || 0),
      created_at: (workout as any).created_at ?? null,
    } as DashboardWorkout
  }

  useEffect(() => {
    if (!toolsOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setToolsOpen(false)
    }
    try {
      window.addEventListener('keydown', onKeyDown)
    } catch {}
    return () => {
      try {
        window.removeEventListener('keydown', onKeyDown)
      } catch {}
    }
  }, [toolsOpen])

  useEffect(() => {
    if (!checkinsOpen) return
    const uid = String(props.currentUserId || '').trim()
    if (!uid) {
      setCheckinsRows([])
      return
    }
    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      try {
        setCheckinsLoading(true)
        const days = checkinsRange === '30d' ? 30 : 7
        const startIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        const { data, error } = await supabase
          .from('workout_checkins')
          .select('id, kind, created_at, energy, mood, soreness, notes, answers, workout_id, planned_workout_id')
          .eq('user_id', uid)
          .gte('created_at', startIso)
          .order('created_at', { ascending: false })
          .limit(400)
        if (error) throw error
        if (cancelled) return
        setCheckinsRows(Array.isArray(data) ? data : [])
      } catch {
        if (cancelled) return
        setCheckinsRows([])
      } finally {
        if (!cancelled) setCheckinsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [checkinsOpen, checkinsRange, props.currentUserId])

  const showCommunityTab = !!props.communityContent
  const showVipTab = props.vipEnabled !== false
  const vipLocked = !!props.vipLocked
  const vipLabel = String(props.vipLabel || 'VIP')

  return (
    <div className={density === 'compact' ? 'p-4 space-y-3 pb-24' : 'p-4 space-y-4 pb-24'}>
      {props.profileIncomplete && (
        <div className="bg-neutral-800 border border-yellow-500/30 rounded-xl p-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Perfil incompleto</div>
            <div className="text-sm text-neutral-300 mt-1">Complete seu nome de exibição para personalizar sua conta.</div>
          </div>
          <button type="button" onClick={props.onOpenCompleteProfile} className="shrink-0 bg-yellow-500 text-black font-black px-4 py-2 rounded-xl active:scale-95 transition-transform">
            Terminar cadastro
          </button>
        </div>
      )}

      {props.view === 'dashboard' && showStoriesBar ? <StoriesBar currentUserId={props.currentUserId} /> : null}

      <div style={{ minHeight: `${TABS_BAR_MIN_HEIGHT_PX}px` }}>
        <div className="sticky top-[var(--dashboard-sticky-top)] z-30">
          <div className="bg-neutral-900/70 backdrop-blur-md border border-neutral-800/70 rounded-2xl p-1 shadow-lg shadow-black/30">
            <div data-tour="tabs" className="bg-neutral-800 border border-neutral-700 rounded-xl p-1 flex gap-1">
              <button
                type="button"
                onClick={() => props.onChangeView('dashboard')}
                data-tour="tab-workouts"
                className={`flex-1 min-h-[44px] px-2 sm:px-3 rounded-lg font-black text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-wider whitespace-nowrap leading-none transition-colors ${
                  props.view === 'dashboard' ? 'bg-neutral-900 text-yellow-500 border border-yellow-500/30' : 'bg-transparent text-neutral-400 hover:text-white'
                }`}
              >
                Treinos
              </button>
              <button
                type="button"
                onClick={() => props.onChangeView('assessments')}
                data-tour="tab-assessments"
                className={`flex-1 min-h-[44px] px-2 sm:px-3 rounded-lg font-black text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-wider whitespace-nowrap leading-none transition-colors ${
                  props.view === 'assessments' ? 'bg-neutral-900 text-yellow-500 border border-yellow-500/30' : 'bg-transparent text-neutral-400 hover:text-white'
                }`}
              >
                Avaliações
              </button>
              {showCommunityTab ? (
                <button
                  type="button"
                  onClick={() => props.onChangeView('community')}
                  data-tour="tab-community"
                  className={`flex-1 min-h-[44px] px-2 sm:px-3 rounded-lg font-black text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-wider whitespace-nowrap leading-none transition-colors ${
                    props.view === 'community' ? 'bg-neutral-900 text-yellow-500 border border-yellow-500/30' : 'bg-transparent text-neutral-400 hover:text-white'
                  }`}
                >
                  Comunidade
                </button>
              ) : null}
              {showVipTab ? (
                <button
                  type="button"
                  onClick={() => props.onChangeView('vip')}
                  data-tour="tab-vip"
                  className={`flex-1 min-h-[44px] px-2 sm:px-3 rounded-lg font-black text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-wider whitespace-nowrap leading-none transition-colors ${
                    props.view === 'vip' ? 'bg-neutral-900 text-yellow-500 border border-yellow-500/30' : 'bg-transparent text-neutral-400 hover:text-white'
                  }`}
                >
                  {vipLabel}{vipLocked ? ' 🔒' : ''}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {props.view === 'assessments' ? <div className="pt-2">{props.assessmentsContent ?? null}</div> : null}
      {props.view === 'community' ? <div className="pt-2">{props.communityContent ?? null}</div> : null}
      {props.view === 'vip' ? <div className="pt-2">{props.vipContent ?? null}</div> : null}

      {props.view === 'dashboard' && (
        <>
          <WorkoutCalendarModal isOpen={calendarOpen} onClose={() => setCalendarOpen(false)} userId={props.currentUserId} />

          {checkinsOpen && (
            <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe">
              <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Check-ins</div>
                    <div className="text-white font-black text-lg truncate">Histórico</div>
                    <div className="text-xs text-neutral-400">Tendências, alertas e sugestões.</div>
                  </div>
                  <button
                    onClick={() => setCheckinsOpen(false)}
                    className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                    aria-label="Fechar"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-4 border-b border-neutral-800 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    {(['7d', '30d'] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => setCheckinsRange(k)}
                        className={
                          checkinsRange === k
                            ? 'min-h-[36px] px-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                            : 'min-h-[36px] px-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                        }
                      >
                        {k === '7d' ? '7 dias' : '30 dias'}
                      </button>
                    ))}
                    <div className="ml-auto text-xs text-neutral-500">{checkinsLoading ? 'Carregando…' : `${checkinsRows.length} item(s)`}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {(['all', 'pre', 'post'] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => setCheckinsFilter(k)}
                        className={
                          checkinsFilter === k
                            ? 'min-h-[36px] px-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                            : 'min-h-[36px] px-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                        }
                      >
                        {k === 'all' ? 'Todos' : k === 'pre' ? 'Pré' : 'Pós'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 max-h-[65vh] overflow-y-auto custom-scrollbar">
                  {(() => {
                    const rows = Array.isArray(checkinsRows) ? checkinsRows : []
                    const filtered = checkinsFilter === 'all' ? rows : rows.filter((r) => String(r?.kind || '').trim() === checkinsFilter)

                    const toNumberOrNull = (v: any) => {
                      const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
                      return Number.isFinite(n) ? n : null
                    }
                    const avg = (vals: Array<number | null>) => {
                      const list = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
                      if (!list.length) return null
                      return list.reduce((a, b) => a + b, 0) / list.length
                    }
                    const preRows = rows.filter((r) => String(r?.kind || '').trim() === 'pre')
                    const postRows = rows.filter((r) => String(r?.kind || '').trim() === 'post')
                    const preAvgEnergy = avg(preRows.map((r) => toNumberOrNull(r?.energy)))
                    const preAvgSoreness = avg(preRows.map((r) => toNumberOrNull(r?.soreness)))
                    const preAvgTime = avg(
                      preRows.map((r) => {
                        const answers = r?.answers && typeof r.answers === 'object' ? r.answers : {}
                        return toNumberOrNull(answers?.time_minutes ?? answers?.timeMinutes)
                      }),
                    )
                    const postAvgSoreness = avg(postRows.map((r) => toNumberOrNull(r?.soreness)))
                    const postAvgSatisfaction = avg(postRows.map((r) => toNumberOrNull(r?.mood)))
                    const postAvgRpe = avg(
                      postRows.map((r) => {
                        const answers = r?.answers && typeof r.answers === 'object' ? r.answers : {}
                        return toNumberOrNull(answers?.rpe)
                      }),
                    )

                    const highSorenessCount = rows.filter((r) => {
                      const s = toNumberOrNull(r?.soreness)
                      return s != null && s >= 7
                    }).length
                    const lowEnergyCount = preRows.filter((r) => {
                      const e = toNumberOrNull(r?.energy)
                      return e != null && e <= 2
                    }).length

                    const alerts: string[] = []
                    if (highSorenessCount >= 3) alerts.push('Dor alta (≥ 7) apareceu 3+ vezes no período.')
                    if (preAvgSoreness != null && preAvgSoreness >= 7) alerts.push('Média de dor no pré está alta (≥ 7).')
                    if (lowEnergyCount >= 3) alerts.push('Energia baixa (≤ 2) apareceu 3+ vezes no período.')
                    if (postAvgSatisfaction != null && postAvgSatisfaction <= 2) alerts.push('Satisfação média no pós está baixa (≤ 2).')

                    const suggestions: string[] = []
                    if (highSorenessCount >= 3 || (preAvgSoreness != null && preAvgSoreness >= 7) || (postAvgSoreness != null && postAvgSoreness >= 7)) {
                      suggestions.push('Dor alta: considere reduzir volume/carga 20–30% e priorizar técnica + mobilidade.')
                    }
                    if (lowEnergyCount >= 3 || (preAvgEnergy != null && preAvgEnergy <= 2.2)) {
                      suggestions.push('Energia baixa: mantenha um treino mais curto, evite falha, e foque em recuperação (sono/estresse).')
                    }
                    if (postAvgRpe != null && postAvgRpe >= 9) {
                      suggestions.push('RPE médio alto: reduza um pouco a intensidade e aumente descanso entre séries.')
                    }
                    if (postAvgSatisfaction != null && postAvgSatisfaction <= 2) {
                      suggestions.push('Satisfação baixa: revise seleção de exercícios e meta da sessão para manter consistência.')
                    }
                    if (preAvgTime != null && preAvgTime > 0 && preAvgTime < 45) {
                      suggestions.push('Pouco tempo disponível: use treinos “mínimo efetivo” (menos exercícios e mais foco).')
                    }

                    return (
                      <>
                        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Pré</div>
                            <div className="mt-2 grid grid-cols-3 gap-3">
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Energia</div>
                                <div className="font-black text-white">{preAvgEnergy == null ? '—' : preAvgEnergy.toFixed(1)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Dor</div>
                                <div className="font-black text-white">{preAvgSoreness == null ? '—' : preAvgSoreness.toFixed(1)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Tempo</div>
                                <div className="font-black text-white">{preAvgTime == null ? '—' : `${Math.round(preAvgTime)}m`}</div>
                              </div>
                            </div>
                          </div>
                          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Pós</div>
                            <div className="mt-2 grid grid-cols-3 gap-3">
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">RPE</div>
                                <div className="font-black text-white">{postAvgRpe == null ? '—' : postAvgRpe.toFixed(1)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Satisf.</div>
                                <div className="font-black text-white">{postAvgSatisfaction == null ? '—' : postAvgSatisfaction.toFixed(1)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Dor</div>
                                <div className="font-black text-white">{postAvgSoreness == null ? '—' : postAvgSoreness.toFixed(1)}</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {alerts.length ? (
                          <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
                            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Alertas</div>
                            <div className="mt-2 space-y-1 text-sm text-neutral-200">
                              {alerts.map((a) => (
                                <div key={a}>{a}</div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {suggestions.length ? (
                          <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                            <div className="text-xs font-black uppercase tracking-widest text-neutral-300">Sugestões</div>
                            <div className="mt-2 space-y-1 text-sm text-neutral-200">
                              {suggestions.map((s) => (
                                <div key={s}>{s}</div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {filtered.length === 0 ? (
                          <div className="text-sm text-neutral-400">Nenhum check-in encontrado.</div>
                        ) : (
                          <div className="space-y-2">
                            {filtered.map((r) => {
                              const kind = String(r?.kind || '').trim()
                              const createdAt = r?.created_at ? new Date(String(r.created_at)) : null
                              const dateLabel = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleString('pt-BR') : '—'
                              const energy = r?.energy != null ? String(r.energy) : '—'
                              const soreness = r?.soreness != null ? String(r.soreness) : '—'
                              const mood = r?.mood != null ? String(r.mood) : '—'
                              const answers = r?.answers && typeof r.answers === 'object' ? r.answers : {}
                              const rpe = answers?.rpe != null ? String(answers.rpe) : '—'
                              const timeMinutes = answers?.time_minutes != null ? String(answers.time_minutes) : answers?.timeMinutes != null ? String(answers.timeMinutes) : '—'
                              const notes = r?.notes ? String(r.notes) : ''

                              return (
                                <div key={String(r?.id || dateLabel)} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-xs font-black uppercase tracking-widest text-yellow-500">{kind === 'pre' ? 'Pré' : 'Pós'}</div>
                                      <div className="text-xs text-neutral-500">{dateLabel}</div>
                                    </div>
                                    <div className="text-xs text-neutral-300 font-mono">
                                      {kind === 'pre' ? `E:${energy} D:${soreness} T:${timeMinutes}` : `RPE:${rpe} Sat:${mood} D:${soreness}`}
                                    </div>
                                  </div>
                                  {notes ? <div className="mt-2 text-sm text-neutral-200">{notes}</div> : null}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>

                <div className="p-4 border-t border-neutral-800 flex items-center justify-end">
                  <button onClick={() => setCheckinsOpen(false)} className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700">
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}

          {editListOpen && (
            <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => !savingListEdits && setEditListOpen(false)}>
              <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Treinos</div>
                    <div className="text-white font-black text-lg truncate">Organizar</div>
                    <div className="text-xs text-neutral-400">Arraste para reordenar e edite os títulos.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditListOpen(false)}
                    disabled={savingListEdits}
                    className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center disabled:opacity-50"
                    aria-label="Fechar"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  {editListDraft.length === 0 ? (
                    <div className="text-sm text-neutral-400">Nenhum treino para organizar.</div>
                  ) : (
                    <Reorder.Group axis="y" values={editListDraft} onReorder={setEditListDraft} className="space-y-2">
                      {editListDraft.map((it, idx) => (
                        <SortableWorkoutItem
                          key={it.id}
                          item={it}
                          index={idx}
                          saving={savingListEdits}
                          onChangeTitle={(id, val) => {
                            setEditListDraft((prev) => prev.map((x) => (x.id === id ? { ...x, title: val } : x)))
                          }}
                        />
                      ))}
                    </Reorder.Group>
                  )}
                </div>

                <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setEditListOpen(false)}
                    disabled={savingListEdits}
                    className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={savingListEdits || typeof props.onBulkEditWorkouts !== 'function' || editListDraft.length === 0}
                    onClick={async () => {
                      if (typeof props.onBulkEditWorkouts !== 'function') return
                      try {
                        setSavingListEdits(true)
                        await props.onBulkEditWorkouts(editListDraft)
                        setEditListOpen(false)
                      } finally {
                        setSavingListEdits(false)
                      }
                    }}
                    className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    <Save size={16} />
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          )}

          {showNewRecordsCard ? (
            <RecentAchievements userId={props.currentUserId} badges={props.streakStats?.badges ?? []} showBadges={showBadges} reloadKey={props.newRecordsReloadKey} />
          ) : null}

          {(showIronRank || showBadges) && (
            <BadgesGallery
              badges={props.streakStats?.badges ?? []}
              currentStreak={props.streakStats?.currentStreak ?? 0}
              totalVolumeKg={props.streakStats?.totalVolumeKg ?? 0}
              currentUserId={props.currentUserId}
              showIronRank={showIronRank}
              showBadges={!showNewRecordsCard && showBadges}
            />
          )}

          <MuscleMapCard onOpenWizard={props.onCreateWorkout} />

          <button
            onClick={() => {
              setCreatingWorkout(true)
              try {
                try { trackUserEvent('click_dashboard_new_workout', { type: 'click', screen: 'dashboard' }) } catch {}
                props.onCreateWorkout()
              } catch {
                setCreatingWorkout(false)
              }
              try {
                window.setTimeout(() => setCreatingWorkout(false), CREATE_WORKOUT_LOADING_TIMEOUT_MS)
              } catch {}
            }}
            disabled={creatingWorkout}
            className="w-full min-h-[44px] bg-yellow-500 p-4 rounded-xl font-black text-black flex items-center justify-center gap-2 shadow-lg shadow-yellow-900/20 hover:bg-yellow-400 transition-transform active:scale-95 disabled:opacity-70"
          >
            {creatingWorkout ? <Loader2 size={20} className="animate-spin" /> : <Plus size={24} />}
            {creatingWorkout ? 'Abrindo editor...' : 'Novo Treino'}
          </button>

          <div className={density === 'compact' ? 'space-y-2' : 'space-y-3'}>
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center rounded-xl bg-neutral-900/40 border border-neutral-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setShowArchived(false)
                    setWorkoutsTab('normal')
                  }}
                  className={
                    workoutsTab === 'normal'
                      ? 'min-h-[44px] px-3 py-2 bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                      : 'min-h-[44px] px-3 py-2 text-neutral-300 font-bold text-xs uppercase tracking-widest hover:bg-neutral-800'
                  }
                >
                  Meus Treinos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowArchived(false)
                    setPeriodizedLoaded(false)
                    setPeriodizedWorkouts([])
                    setPeriodizedError('')
                    setWorkoutsTab('periodized')
                  }}
                  className={
                    workoutsTab === 'periodized'
                      ? 'min-h-[44px] px-3 py-2 bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                      : 'min-h-[44px] px-3 py-2 text-neutral-300 font-bold text-xs uppercase tracking-widest hover:bg-neutral-800'
                  }
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Crown size={12} className={workoutsTab === 'periodized' ? 'text-black fill-black' : 'text-yellow-500 fill-yellow-500'} />
                    Treinos Periodizados
                  </span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                {archivedCount > 0 ? (
                  <button
                    onClick={() => setShowArchived((v) => !v)}
                    className={
                      showArchived
                        ? 'min-h-[44px] px-3 py-2 bg-yellow-500 text-black rounded-xl font-black text-xs uppercase'
                        : 'min-h-[44px] px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl font-bold text-xs uppercase hover:bg-neutral-700'
                    }
                  >
                    {showArchived ? `Arquivados (${archivedCount})` : `Mostrar arquivados (${archivedCount})`}
                  </button>
                ) : null}
                <button
                  onClick={() => {
                    try { trackUserEvent('click_dashboard_organize_workouts', { type: 'click', screen: 'dashboard' }) } catch {}
                    const items = visibleWorkouts
                      .map((w, idx) => {
                        const id = String(w?.id || '').trim()
                        if (!id) return null
                        return { id, title: String(w?.title || 'Treino'), sort_order: idx }
                      })
                      .filter(Boolean) as { id: string; title: string; sort_order: number }[]
                    setEditListDraft(items)
                    setEditListOpen(true)
                    setToolsOpen(false)
                  }}
                  className="min-h-[44px] px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl font-bold text-xs uppercase hover:bg-neutral-700"
                >
                  Organizar
                </button>
                <div className="relative">
                  <button
                    onClick={() => setToolsOpen((v) => !v)}
                    className="min-h-[44px] px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl font-bold text-xs uppercase hover:bg-neutral-700"
                    aria-expanded={toolsOpen}
                  >
                    Ferramentas
                  </button>
                  {toolsOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setToolsOpen(false)} />
                      <div className="absolute right-0 mt-2 w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-50 overflow-hidden text-neutral-300">
                        <div className="p-2 space-y-1">
                          <button
                            onClick={() => {
                              setToolsOpen(false)
                              props.onCreateWorkout()
                            }}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm"
                          >
                            <span className="font-bold text-white">Criar automaticamente</span>
                            <Sparkles size={16} className="text-yellow-500" />
                          </button>
                          <button
                            onClick={() => {
                              setToolsOpen(false)
                              setCalendarOpen(true)
                            }}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm"
                          >
                            <span className="font-bold text-white">Calendário</span>
                            <CalendarDays size={16} className="text-yellow-500" />
                          </button>
                          <button
                            onClick={() => {
                              setToolsOpen(false)
                              setCheckinsOpen(true)
                            }}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm"
                          >
                            <span className="font-bold text-white">Check-ins</span>
                            <Activity size={16} className="text-yellow-500" />
                          </button>
                          <button
                            onClick={() => {
                              setToolsOpen(false)
                              props.onOpenIronScanner()
                            }}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm"
                          >
                            <span className="font-bold text-white">Scanner de Treino (Imagem)</span>
                            <span className="text-yellow-500">📷</span>
                          </button>
                          <button
                            onClick={() => {
                              setToolsOpen(false)
                              props.onOpenJsonImport()
                            }}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm"
                          >
                            <span className="font-bold text-white">Importar JSON</span>
                            <span className="text-yellow-500">↵</span>
                          </button>
                          <button
                            onClick={async () => {
                              setToolsOpen(false)
                              if (typeof props.onNormalizeAiWorkoutTitles !== 'function') return
                              try {
                                setNormalizingAiTitles(true)
                                await props.onNormalizeAiWorkoutTitles()
                              } finally {
                                setNormalizingAiTitles(false)
                              }
                            }}
                            disabled={normalizingAiTitles}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm disabled:opacity-50"
                          >
                            <span className="font-bold text-white">{normalizingAiTitles ? 'Padronizando...' : 'Padronizar nomes IA'}</span>
                            {normalizingAiTitles ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <Sparkles size={16} className="text-yellow-500" />}
                          </button>
                          <button
                            onClick={async () => {
                              setToolsOpen(false)
                              if (typeof props.onNormalizeExercises !== 'function') return
                              try {
                                setNormalizingExercises(true)
                                await props.onNormalizeExercises()
                              } finally {
                                setNormalizingExercises(false)
                              }
                            }}
                            disabled={normalizingExercises}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm disabled:opacity-50"
                          >
                            <span className="font-bold text-white">{normalizingExercises ? 'Normalizando...' : 'Normalizar exercícios'}</span>
                            {normalizingExercises ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <span className="text-yellow-500">✦</span>}
                          </button>
                          <button
                            onClick={async () => {
                              setToolsOpen(false)
                              if (typeof props.onOpenDuplicates !== 'function') return
                              try {
                                setFindingDuplicates(true)
                                await props.onOpenDuplicates()
                              } finally {
                                setFindingDuplicates(false)
                              }
                            }}
                            disabled={findingDuplicates}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm disabled:opacity-50"
                          >
                            <span className="font-bold text-white">{findingDuplicates ? 'Buscando...' : 'Encontrar duplicados'}</span>
                            {findingDuplicates ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <span className="text-yellow-500">≋</span>}
                          </button>
                          <button
                            onClick={async () => {
                              setToolsOpen(false)
                              if (typeof props.onApplyTitleRule !== 'function') return
                              try {
                                setApplyingTitleRule(true)
                                await props.onApplyTitleRule()
                              } finally {
                                setApplyingTitleRule(false)
                              }
                            }}
                            disabled={applyingTitleRule}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm disabled:opacity-50"
                          >
                            <span className="font-bold text-white">{applyingTitleRule ? 'Aplicando...' : 'Padronizar títulos (A/B/C)'}</span>
                            {applyingTitleRule ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <span className="text-yellow-500">A</span>}
                          </button>
                          <button
                            onClick={() => {
                              setToolsOpen(false)
                              props.onExportAll()
                            }}
                            disabled={!!props.exportingAll}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm disabled:opacity-50"
                          >
                            <span className="text-neutral-200">{props.exportingAll ? 'Exportando...' : 'Exportar JSON'}</span>
                            {props.exportingAll ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <span className="text-neutral-500">↓</span>}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {visibleWorkouts.length === 0 && (
              <div className="text-center py-10 text-neutral-600">
                <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
                  <Dumbbell size={32} />
                </div>
                <p>
                  {workoutsTab === 'periodized'
                    ? periodizedLoading
                      ? 'Carregando treinos periodizados...'
                      : 'Nenhum treino periodizado criado.'
                    : 'Nenhum treino criado.'}
                </p>
                {workoutsTab === 'periodized' && periodizedError ? (
                  <div className="mt-3 inline-flex items-center justify-center">
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 font-bold">
                      {periodizedError}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPeriodizedLoaded(false)
                        setPeriodizedWorkouts([])
                        setPeriodizedError('')
                      }}
                      className="ml-2 min-h-[36px] px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl font-bold text-xs uppercase hover:bg-neutral-700"
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : workoutsTab === 'periodized' && !periodizedLoading ? (
                  <p className="mt-2 text-xs text-neutral-500">
                    Crie sua periodização na aba VIP para ela aparecer aqui.
                  </p>
                ) : null}
              </div>
            )}

            {visibleWorkouts.map((w, idx) => (
              <div
                key={String(w?.id ?? idx)}
                className={
                  density === 'compact'
                    ? 'bg-neutral-800 rounded-xl p-3 border-l-4 border-neutral-600 md:hover:border-yellow-500 transition-all group relative overflow-hidden cursor-pointer'
                    : 'bg-neutral-800 rounded-xl p-4 border-l-4 border-neutral-600 md:hover:border-yellow-500 transition-all group relative overflow-hidden cursor-pointer'
                }
                onClick={() => {
                  const key = getWorkoutKey(w, idx)
                  if (isWorkoutBusy(key)) return
                  if (workoutsTab === 'periodized' && !isPeriodizedWorkoutFullyLoaded(w)) {
                    runWorkoutAction(key, 'open', async () => {
                      const id = String(w?.id || '').trim()
                      const full = await loadWorkoutFullById(id)
                      if (!full) {
                        setPeriodizedError('Não foi possível carregar os detalhes desse treino.')
                        return
                      }
                      if (!Array.isArray(full?.exercises) || full.exercises.length === 0) {
                        setPeriodizedError('Esse treino está sem exercícios. Refaça a periodização para recriar os treinos.')
                        return
                      }
                      setPeriodizedWorkouts((prev) => prev.map((p) => (String(p?.id || '') === String(full?.id || '') ? full : p)))
                      props.onQuickView(full)
                    })
                    return
                  }
                  props.onQuickView(w)
                }}
              >
                <div className="relative z-10">
                  <h3 className="font-bold text-white text-lg uppercase mb-1 pr-32 leading-tight">{String(w?.title || 'Treino')}</h3>
                  <p className="text-xs text-neutral-400 font-mono mb-4">
                    {(Number.isFinite(Number((w as any)?.exercises_count)) ? Math.max(0, Math.floor(Number((w as any).exercises_count))) : Array.isArray(w?.exercises) ? w.exercises.length : 0)} EXERCÍCIOS
                  </p>
                  {w?.archived_at ? (
                    <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 bg-neutral-900/60 border border-neutral-700 px-2 py-1 rounded-lg mb-2">
                      ARQUIVADO
                    </div>
                  ) : null}

                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        const key = getWorkoutKey(w, idx)
                        if (w?.archived_at) {
                          if (typeof props.onRestoreWorkout !== 'function') return
                          await runWorkoutAction(key, 'restore', () => props.onRestoreWorkout?.(w))
                          return
                        }
                        await runWorkoutAction(key, 'start', async () => {
                          if (workoutsTab === 'periodized' && !isPeriodizedWorkoutFullyLoaded(w)) {
                            const id = String(w?.id || '').trim()
                            const full = await loadWorkoutFullById(id)
                            if (!full) {
                              setPeriodizedError('Não foi possível carregar os detalhes desse treino.')
                              return
                            }
                            if (!Array.isArray(full?.exercises) || full.exercises.length === 0) {
                              setPeriodizedError('Esse treino está sem exercícios. Refaça a periodização para recriar os treinos.')
                              return
                            }
                            setPeriodizedWorkouts((prev) => prev.map((p) => (String(p?.id || '') === String(full?.id || '') ? full : p)))
                            await props.onStartSession(full)
                            return
                          }
                          await props.onStartSession(w)
                        })
                      }}
                      data-tour="workout-start"
                      disabled={isWorkoutBusy(getWorkoutKey(w, idx)) || (Boolean(w?.archived_at) && typeof props.onRestoreWorkout !== 'function')}
                      className="relative z-30 flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-lg flex items-center justify-center gap-2 text-white font-bold text-sm transition-colors border border-white/10 active:scale-95 touch-manipulation disabled:opacity-60"
                    >
                      {w?.archived_at ? (
                        isActionBusy(getWorkoutKey(w, idx), 'restore') ? (
                          <>
                            <Loader2 size={16} className="text-yellow-500 animate-spin" /> RESTAURANDO...
                          </>
                        ) : (
                          <>
                            <Undo2 size={16} /> RESTAURAR
                          </>
                        )
                      ) : isActionBusy(getWorkoutKey(w, idx), 'start') ? (
                        <>
                          <Loader2 size={16} className="text-yellow-500 animate-spin" /> INICIANDO...
                        </>
                      ) : (
                        <>
                          <Play size={16} className="fill-white" /> INICIAR TREINO
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="absolute top-2 right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20 bg-neutral-900/50 backdrop-blur-sm rounded-lg p-1 border border-white/5">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      const key = getWorkoutKey(w, idx)
                      await runWorkoutAction(key, 'share', () => props.onShareWorkout(w))
                    }}
                    disabled={isWorkoutBusy(getWorkoutKey(w, idx))}
                    className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-white disabled:opacity-60"
                  >
                    {isActionBusy(getWorkoutKey(w, idx), 'share') ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <Share2 size={14} />}
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      const key = getWorkoutKey(w, idx)
                      await runWorkoutAction(key, 'duplicate', () => props.onDuplicateWorkout(w))
                    }}
                    disabled={isWorkoutBusy(getWorkoutKey(w, idx))}
                    className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-white disabled:opacity-60"
                  >
                    {isActionBusy(getWorkoutKey(w, idx), 'duplicate') ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <Copy size={14} />}
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      const key = getWorkoutKey(w, idx)
                      await runWorkoutAction(key, 'edit', () => props.onEditWorkout(w))
                    }}
                    disabled={isWorkoutBusy(getWorkoutKey(w, idx))}
                    className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-white disabled:opacity-60"
                  >
                    {isActionBusy(getWorkoutKey(w, idx), 'edit') ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <Pencil size={14} />}
                  </button>
                  {w?.user_id && props.currentUserId && w.user_id === props.currentUserId ? (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        const key = getWorkoutKey(w, idx)
                        await runWorkoutAction(key, 'delete', () => props.onDeleteWorkout(w?.id, w?.title))
                      }}
                      disabled={isWorkoutBusy(getWorkoutKey(w, idx))}
                      className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-white disabled:opacity-60"
                    >
                      {isActionBusy(getWorkoutKey(w, idx), 'delete') ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
