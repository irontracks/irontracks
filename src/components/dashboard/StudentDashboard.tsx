'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'

import { Plus, Loader2, Sparkles, Crown, Zap } from 'lucide-react'
const MuscleBalanceCard = dynamic(() => import('@/components/MuscleBalanceCard'), { ssr: false })
import { EmptyState } from '@/components/ui/EmptyState'

import { createClient } from '@/utils/supabase/client'
import type { DashboardWorkout, DashboardExercise, DashboardSetDetail } from '@/types/dashboard'

// Re-export types so existing consumers don't break
export type { DashboardWorkout, DashboardExercise, DashboardSetDetail }

// Eagerly imported — no Suspense flash on entry
import IronRankCard from './IronRankCard'
import StoriesBar from './StoriesBar'
import MuscleMapCard from './MuscleMapCard'

import WorkoutCalendarModal from './WorkoutCalendarModal'
import { ProfileIncompleteBanner } from './ProfileIncompleteBanner'
import { DashboardTabs } from './DashboardTabs'
import { CheckinsModal } from './CheckinsModal'
import { trackUserEvent } from '@/lib/telemetry/userActivity'
import { EditWorkoutListModal, type EditWorkoutListItem } from './EditWorkoutListModal'
import { WorkoutToolsPanel } from './WorkoutToolsPanel'
import { WorkoutCard } from './WorkoutCard'
import { usePeriodizedWorkouts, isPeriodizedWorkout } from '@/hooks/usePeriodizedWorkouts'
import type { UnknownRecord } from '@/types/app'
import dynamic from 'next/dynamic'

const RecoveryScore = dynamic(() => import('./RecoveryScore'), { ssr: false })


const isPlainRecord = (v: unknown): v is UnknownRecord => v !== null && typeof v === 'object' && !Array.isArray(v)

const toNumberOrNull = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

type WorkoutCheckinRow = {
  id?: string
  kind?: string
  created_at?: string | null
  energy?: number | string | null
  mood?: number | string | null
  soreness?: number | string | null
  notes?: string | null
  answers?: UnknownRecord | null
  workout_id?: string | null
  planned_workout_id?: string | null
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
    // Profile fields (for completeness score)
    biologicalSex?: string
    bodyWeightKg?: number | null
    heightCm?: number | null
    age?: number | null
    fitnessLevel?: string
    fitnessGoal?: string
    trainingFrequencyPerWeek?: number | null
    gym?: string
    city?: string
  } | null
  onCreateWorkout: () => MaybePromise<void>
  onExpressWorkout?: () => void
  onQuickView: (w: DashboardWorkout) => void
  onStartSession: (w: DashboardWorkout) => MaybePromise<void | boolean>
  onRestoreWorkout?: (w: DashboardWorkout) => MaybePromise<void>
  onShareWorkout: (w: DashboardWorkout) => MaybePromise<void>
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
  onApplyTitleRule?: () => MaybePromise<void>
  onOpenIronScanner: () => void
  /** Called when user's own story active state changes (for header story ring) */
  onMyStoryStateChange?: (hasActiveStory: boolean) => void
  /** External trigger: open story creator (from header long-press) */
  onAddStory?: () => void
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
  const workouts = useMemo(() => Array.isArray(props.workouts) ? props.workouts : [], [props.workouts])
  const density = props.settings?.dashboardDensity === 'compact' ? 'compact' : 'comfortable'
  const [toolsOpen, setToolsOpen] = useState(false)
  const [workoutsTab, setWorkoutsTab] = useState<'normal' | 'periodized'>('normal')
  const [showArchived, setShowArchived] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [checkinsOpen, setCheckinsOpen] = useState(false)
  const [checkinsLoading, setCheckinsLoading] = useState(false)
  const [checkinsRows, setCheckinsRows] = useState<WorkoutCheckinRow[]>([])
  const [checkinsFilter, setCheckinsFilter] = useState<'all' | 'pre' | 'post'>('all')
  const [checkinsRange, setCheckinsRange] = useState<'7d' | '30d'>('7d')
  const [creatingWorkout, setCreatingWorkout] = useState(false)
  const [normalizingAiTitles, setNormalizingAiTitles] = useState(false)
  const [normalizingExercises, setNormalizingExercises] = useState(false)
  const [applyingTitleRule, setApplyingTitleRule] = useState(false)
  const [editListOpen, setEditListOpen] = useState(false)
  const [editListDraft, setEditListDraft] = useState<{ id: string; title: string; sort_order: number }[]>([])
  const [savingListEdits, setSavingListEdits] = useState(false)
  const CREATE_WORKOUT_LOADING_TIMEOUT_MS = 900
  const isMountedRef = useRef(true)
  const showNewRecordsCard = props.settings?.showNewRecordsCard !== false
  const showIronRank = props.settings?.showIronRank !== false
  const showBadges = props.settings?.showBadges !== false
  const showStoriesBar = props.settings?.moduleSocial !== false && props.settings?.showStoriesBar !== false && !!String(props.currentUserId || '').trim()

  // ── Periodized workouts hook ────────────────────────────────
  const {
    periodizedLoading,
    periodizedLoaded,
    periodizedWorkouts,
    periodizedError,
    setPeriodizedLoaded,
    setPeriodizedWorkouts,
    setPeriodizedError,
    loadWorkoutFullById,
  } = usePeriodizedWorkouts({ view: props.view, workoutsTab })

  const workoutsForTab = useMemo(
    () =>
      workoutsTab === 'periodized'
        ? (periodizedLoaded ? periodizedWorkouts : workouts.filter(isPeriodizedWorkout))
        : workouts.filter((w) => !isPeriodizedWorkout(w)),
    [workoutsTab, periodizedLoaded, periodizedWorkouts, workouts],
  )
  const archivedCount = useMemo(
    () => workoutsForTab.reduce((acc, w) => (w?.archived_at ? acc + 1 : acc), 0),
    [workoutsForTab],
  )
  const visibleWorkouts = useMemo(
    () => (showArchived ? workoutsForTab : workoutsForTab.filter((w) => !w?.archived_at)),
    [showArchived, workoutsForTab],
  )

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!toolsOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setToolsOpen(false)
    }
    try {
      window.addEventListener('keydown', onKeyDown)
    } catch { }
    return () => {
      try {
        window.removeEventListener('keydown', onKeyDown)
      } catch { }
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
      ; (async () => {
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
          const rows: WorkoutCheckinRow[] = (Array.isArray(data) ? data : [])
            .filter((row) => isPlainRecord(row))
            .map((row) => {
              const toNumberOrStringOrNull = (v: unknown): number | string | null => {
                if (v == null) return null
                if (typeof v === 'number') return v
                const s = String(v)
                return s ? s : null
              }
              const answers = isPlainRecord(row.answers) ? row.answers : null
              return {
                id: row.id != null ? String(row.id) : undefined,
                kind: row.kind != null ? String(row.kind) : undefined,
                created_at: row.created_at != null ? String(row.created_at) : null,
                energy: toNumberOrStringOrNull(row.energy),
                mood: toNumberOrStringOrNull(row.mood),
                soreness: toNumberOrStringOrNull(row.soreness),
                notes: row.notes != null ? String(row.notes) : null,
                answers,
                workout_id: row.workout_id != null ? String(row.workout_id) : null,
                planned_workout_id: row.planned_workout_id != null ? String(row.planned_workout_id) : null,
              }
            })
          setCheckinsRows(rows)
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
      {props.profileIncomplete && <ProfileIncompleteBanner settings={props.settings as import('@/schemas/settings').UserSettings | null} onComplete={props.onOpenCompleteProfile} />}

      <>
          {props.view === 'dashboard' && showStoriesBar ? (
            <StoriesBar
              currentUserId={props.currentUserId}
              onMyStoryStateChange={props.onMyStoryStateChange}
              onAddStory={props.onAddStory}
            />
          ) : null}

          <DashboardTabs
            view={props.view}
            onChangeView={props.onChangeView}
            showCommunityTab={showCommunityTab}
            showVipTab={showVipTab}
            vipLabel={vipLabel}
            vipLocked={vipLocked}
          />

          {props.view === 'assessments' ? <div className="pt-2">{props.assessmentsContent ?? null}</div> : null}
          {props.view === 'community' ? <div className="pt-2">{props.communityContent ?? null}</div> : null}
          {props.view === 'vip' ? <div className="pt-2">{props.vipContent ?? null}</div> : null}

          {props.view === 'dashboard' && (
            <>
              <WorkoutCalendarModal isOpen={calendarOpen} onClose={() => setCalendarOpen(false)} userId={props.currentUserId} />

              <CheckinsModal
                isOpen={checkinsOpen}
                onClose={() => setCheckinsOpen(false)}
                checkinsRange={checkinsRange}
                setCheckinsRange={setCheckinsRange}
                checkinsFilter={checkinsFilter}
                setCheckinsFilter={setCheckinsFilter}
                checkinsRows={checkinsRows}
                checkinsLoading={checkinsLoading}
                toNumberOrNull={toNumberOrNull}
                isPlainRecord={isPlainRecord}
              />

              {/* Edit workout list modal */}
              {editListOpen && (
                <EditWorkoutListModal
                  editListDraft={editListDraft}
                  setEditListDraft={setEditListDraft}
                  savingListEdits={savingListEdits}
                  onSave={async (items: EditWorkoutListItem[]) => {
                    if (typeof props.onBulkEditWorkouts !== 'function') return
                    try {
                      setSavingListEdits(true)
                      await props.onBulkEditWorkouts(items)
                      setEditListOpen(false)
                    } finally {
                      setSavingListEdits(false)
                    }
                  }}
                  onClose={() => setEditListOpen(false)}
                />
              )}

              {(showIronRank || showBadges || showNewRecordsCard) && (
              <IronRankCard
                  badges={props.streakStats?.badges ?? []}
                  currentStreak={props.streakStats?.currentStreak ?? 0}
                  totalVolumeKg={props.streakStats?.totalVolumeKg ?? 0}
                  currentUserId={props.currentUserId}
                  showIronRank={showIronRank}
                  showBadges={showBadges}
                  showRecords={showNewRecordsCard}
                  reloadKey={props.newRecordsReloadKey}
                />
              )}

              <MuscleBalanceCard />

              <RecoveryScore />

              <MuscleMapCard onOpenWizard={props.onCreateWorkout} gender={(props.settings?.biologicalSex === 'female' ? 'female' : props.settings?.biologicalSex === 'male' ? 'male' : 'not_informed')} />

              <button
                onClick={() => {
                  setCreatingWorkout(true)
                  try {
                    try { trackUserEvent('click_dashboard_new_workout', { type: 'click', screen: 'dashboard' }) } catch { }
                    props.onCreateWorkout()
                  } catch {
                    setCreatingWorkout(false)
                  }
                  try {
                    window.setTimeout(() => setCreatingWorkout(false), CREATE_WORKOUT_LOADING_TIMEOUT_MS)
                  } catch { }
                }}
                disabled={creatingWorkout}
                className={`btn-shimmer-sweep group relative w-full rounded-2xl p-[1px] transition-all duration-300 active:scale-[0.97] disabled:opacity-70 ${
                  workouts.length === 0 ? 'animate-pulse' : ''
                }`}
                style={{
                  background: 'linear-gradient(135deg, #D4A017, #F5C542, #D4A017, #B8860B)',
                  boxShadow: '0 0 24px rgba(234,179,8,0.25), 0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                {/* Inner card */}
                <span
                  className="relative z-10 flex items-center gap-4 rounded-[15px] px-5 py-4"
                  style={{
                    background: 'linear-gradient(160deg, rgba(20,16,8,0.95) 0%, rgba(30,24,12,0.92) 50%, rgba(20,16,8,0.95) 100%)',
                  }}
                >
                  {/* AI Icon */}
                  <span className="relative flex-shrink-0">
                    <Image
                      src="/icons/btn-novo-treino.png"
                      alt="Novo Treino"
                      width={44}
                      height={44}
                      className="rounded-xl transition-transform duration-300 group-hover:scale-110 drop-shadow-[0_0_8px_rgba(234,179,8,0.4)]"
                      unoptimized
                    />
                  </span>
                  {/* Text content */}
                  <span className="flex flex-col items-start gap-0.5 text-left">
                    <span className="flex items-center gap-2">
                      {creatingWorkout ? (
                        <Loader2 size={18} className="animate-spin text-yellow-400" />
                      ) : (
                        <Plus size={18} className="text-yellow-400" strokeWidth={3} />
                      )}
                      <span className="text-base font-black text-white tracking-wide">
                        {creatingWorkout
                          ? 'Abrindo editor...'
                          : workouts.length === 0
                            ? 'Crie seu primeiro treino!'
                            : 'Novo Treino'}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-yellow-500/70">
                      <Sparkles size={10} className="text-yellow-500/60" />
                      Monte com inteligência artificial
                    </span>
                  </span>
                  {/* Arrow indicator */}
                  <span className="ml-auto text-yellow-500/50 transition-transform duration-300 group-hover:translate-x-1">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </span>
              </button>

              {/* Express workout quick-start */}
              {props.onExpressWorkout && (
                <button
                  type="button"
                  onClick={props.onExpressWorkout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all active:scale-[0.98]"
                  style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.15)' }}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(234,179,8,0.15)' }}>
                    <Zap size={15} className="text-yellow-400" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-black text-white">Treino Express</p>
                    <p className="text-xs text-white/30">IA gera em segundos · 15–45 min</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white/20">
                    <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}

              <div className={density === 'compact' ? 'space-y-2' : 'space-y-3'}>
                {/* Linha 1: abas Meus Treinos / Periodizados */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 inline-flex items-center rounded-xl bg-neutral-900/40 border border-neutral-800 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setShowArchived(false)
                        setWorkoutsTab('normal')
                      }}
                      className={
                        workoutsTab === 'normal'
                          ? 'flex-1 min-h-[40px] px-3 py-2 text-yellow-400 font-black text-[11px] uppercase tracking-wider text-center border-b-2 border-yellow-500 bg-yellow-500/5'
                          : 'flex-1 min-h-[40px] px-3 py-2 text-neutral-400 font-bold text-[11px] uppercase tracking-wider hover:text-neutral-200 text-center border-b-2 border-transparent'
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
                          ? 'flex-1 min-h-[40px] px-3 py-2 text-yellow-400 font-black text-[11px] uppercase tracking-wider text-center border-b-2 border-yellow-500 bg-yellow-500/5'
                          : 'flex-1 min-h-[40px] px-3 py-2 text-neutral-400 font-bold text-[11px] uppercase tracking-wider hover:text-neutral-200 text-center border-b-2 border-transparent'
                      }
                    >
                      <span className="inline-flex items-center justify-center gap-1">
                        <Crown size={11} className={workoutsTab === 'periodized' ? 'text-black fill-black' : 'text-yellow-500 fill-yellow-500'} />
                        Periodizados
                      </span>
                    </button>
                  </div>
                </div>

                {/* Linha 2: botões de ação — Arquivados, Organizar, Ferramentas */}
                <div className="flex items-center gap-2">
                  {archivedCount > 0 ? (
                    <button
                      onClick={() => setShowArchived((v) => !v)}
                      className={
                        showArchived
                          ? 'flex-1 min-h-[40px] px-3 py-2 bg-neutral-800 border border-yellow-500/50 text-yellow-400 rounded-xl font-bold text-[11px] uppercase tracking-wider'
                          : 'flex-1 min-h-[40px] px-3 py-2 bg-neutral-900 border border-neutral-700 text-neutral-400 rounded-xl font-bold text-[11px] uppercase tracking-wider hover:border-neutral-600 hover:text-neutral-300'
                      }
                    >
                      {showArchived ? `Arquivados (${archivedCount})` : `Arquivados (${archivedCount})`}
                    </button>
                  ) : null}
                  <button
                    onClick={() => {
                      try { trackUserEvent('click_dashboard_organize_workouts', { type: 'click', screen: 'dashboard' }) } catch { }
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
                    className="flex-1 min-h-[40px] px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-300 rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-neutral-700 text-center"
                  >
                    Organizar
                  </button>
                  <div className="relative flex-1">
                    <button
                      onClick={() => setToolsOpen((v) => !v)}
                      className="w-full min-h-[40px] px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-300 rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-neutral-700 text-center"
                      aria-expanded={toolsOpen}
                    >
                      Ferramentas
                    </button>
                    {toolsOpen && (
                      <WorkoutToolsPanel
                        onClose={() => setToolsOpen(false)}
                        onCreateWorkout={props.onCreateWorkout}
                        onOpenIronScanner={props.onOpenIronScanner}
                        onOpenJsonImport={props.onOpenJsonImport}
                        onExportAll={props.onExportAll}
                        exportingAll={props.exportingAll}
                        onNormalizeAiWorkoutTitles={props.onNormalizeAiWorkoutTitles}
                        onNormalizeExercises={props.onNormalizeExercises}
                        onApplyTitleRule={props.onApplyTitleRule}
                        normalizingAiTitles={normalizingAiTitles}
                        normalizingExercises={normalizingExercises}
                        applyingTitleRule={applyingTitleRule}
                        setNormalizingAiTitles={setNormalizingAiTitles}
                        setNormalizingExercises={setNormalizingExercises}
                        setApplyingTitleRule={setApplyingTitleRule}
                      />
                    )}

                  </div>
                </div>

                {visibleWorkouts.length === 0 && (
                  <div className="text-center">
                    {periodizedLoading ? (
                      <div className="py-8 text-neutral-500 text-sm animate-pulse">Carregando treinos periodizados...</div>
                    ) : (
                      <EmptyState
                        variant="workouts"
                        title={workoutsTab === 'periodized' ? 'Nenhum treino periodizado' : 'Nenhum treino criado'}
                        description={workoutsTab === 'periodized' ? 'Crie sua periodização na aba VIP para ela aparecer aqui.' : 'Peça ao seu professor para criar seu primeiro treino.'}
                        compact
                      />
                    )}
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
                    ) : null}
                  </div>
                )}

                {visibleWorkouts.map((w, idx) => (
                  <WorkoutCard
                    key={String(w?.id ?? idx)}
                    workout={w}
                    idx={idx}
                    density={density}
                    isPeriodized={workoutsTab === 'periodized'}
                    onQuickView={props.onQuickView}
                    onStartSession={props.onStartSession}
                    onRestoreWorkout={props.onRestoreWorkout}
                    onShareWorkout={props.onShareWorkout}
                    onEditWorkout={props.onEditWorkout}
                    onDeleteWorkout={props.onDeleteWorkout}
                    onLoadFullWorkout={loadWorkoutFullById}
                    onPeriodizedError={setPeriodizedError}
                    onPeriodizedWorkoutLoaded={(full) => {
                      setPeriodizedWorkouts((prev) => prev.map((p) => (String(p?.id || '') === String(full?.id || '') ? full : p)))
                    }}
                  />
                ))}
              </div>
          </>
        )}
      </>
    </div>
  )
}
