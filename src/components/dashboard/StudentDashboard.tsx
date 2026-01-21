'use client'

import React, { useEffect, useRef, useState } from 'react'

import { Plus, Dumbbell, Play, Share2, Copy, Pencil, Trash2, Loader2 } from 'lucide-react'
import RecentAchievements from './RecentAchievements'
import BadgesGallery from './BadgesGallery'

export type DashboardWorkout = {
  id?: string
  user_id?: string | null
  created_by?: string | null
  title?: string
  notes?: string | null
  exercises?: any[]
}

type MaybePromise<T> = T | Promise<T>

type Props = {
  workouts: DashboardWorkout[]
  profileIncomplete: boolean
  onOpenCompleteProfile: () => void
  view: 'dashboard' | 'assessments' | 'community'
  onChangeView: (next: 'dashboard' | 'assessments' | 'community') => void
  assessmentsContent?: React.ReactNode
  communityContent?: React.ReactNode
  settings?: {
    dashboardDensity?: 'compact' | 'comfortable'
    showNewRecordsCard?: boolean
    showIronRank?: boolean
    showBadges?: boolean
  } | null
  onCreateWorkout: () => MaybePromise<void>
  onQuickView: (w: DashboardWorkout) => void
  onStartSession: (w: DashboardWorkout) => MaybePromise<void | boolean>
  onShareWorkout: (w: DashboardWorkout) => MaybePromise<void>
  onDuplicateWorkout: (w: DashboardWorkout) => MaybePromise<void>
  onEditWorkout: (w: DashboardWorkout) => MaybePromise<void>
  onDeleteWorkout: (id?: string, title?: string) => MaybePromise<void>
  currentUserId?: string
  exportingAll?: boolean
  onExportAll: () => MaybePromise<void>
  onOpenJsonImport: () => void
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
  const workouts = Array.isArray(props.workouts) ? props.workouts : []
  const density = props.settings?.dashboardDensity === 'compact' ? 'compact' : 'comfortable'
  const showNewRecordsCard = props.settings?.showNewRecordsCard ?? true
  const showIronRank = props.settings?.showIronRank ?? true
  const showBadges = props.settings?.showBadges ?? true
  const [isMounted, setIsMounted] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [creatingWorkout, setCreatingWorkout] = useState(false)
  const [pendingAction, setPendingAction] = useState<
    | {
        workoutKey: string
        type: 'start' | 'share' | 'duplicate' | 'edit' | 'delete'
      }
    | null
  >(null)
  const TABS_BAR_MIN_HEIGHT_PX = 60
  const CREATE_WORKOUT_LOADING_TIMEOUT_MS = 900
  const isMountedRef = useRef(true)

  useEffect(() => {
    setIsMounted(true)
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

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

  return (
    <div className={density === 'compact' ? 'p-4 space-y-3 pb-24' : 'p-4 space-y-4 pb-24'}>
      {props.profileIncomplete && (
        <div className="bg-neutral-800 border border-yellow-500/30 rounded-xl p-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Perfil incompleto</div>
            <div className="text-sm text-neutral-300 mt-1">Complete seu nome de exibição para personalizar sua conta.</div>
          </div>
          <button
            type="button"
            onClick={props.onOpenCompleteProfile}
            className="shrink-0 bg-yellow-500 text-black font-black px-4 py-2 rounded-xl active:scale-95 transition-transform"
          >
            Terminar cadastro
          </button>
        </div>
      )}

      <div style={{ minHeight: `${TABS_BAR_MIN_HEIGHT_PX}px` }}>
        {isMounted ? (
          <div className="sticky top-[var(--dashboard-sticky-top)] z-30">
            <div className="bg-neutral-900/70 backdrop-blur-md border border-neutral-800/70 rounded-2xl p-1 shadow-lg shadow-black/30">
              <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-1 grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => props.onChangeView('dashboard')}
                  className={`w-full min-h-[44px] px-3 rounded-lg font-black text-xs uppercase tracking-wider transition-colors ${
                    props.view === 'dashboard'
                      ? 'bg-neutral-900 text-yellow-500 border border-yellow-500/30'
                      : 'bg-neutral-900/30 text-neutral-300 border border-neutral-700 hover:bg-neutral-900/50 hover:border-neutral-600 hover:text-white'
                  }`}
                >
                  Treinos
                </button>
                <button
                  type="button"
                  onClick={() => props.onChangeView('assessments')}
                  className={`w-full min-h-[44px] px-3 rounded-lg font-black text-xs uppercase tracking-wider transition-colors ${
                    props.view === 'assessments'
                      ? 'bg-neutral-900 text-yellow-500 border border-yellow-500/30'
                      : 'bg-neutral-900/30 text-neutral-300 border border-neutral-700 hover:bg-neutral-900/50 hover:border-neutral-600 hover:text-white'
                  }`}
                >
                  Avaliações
                </button>
                <button
                  type="button"
                  onClick={() => props.onChangeView('community')}
                  className={`w-full min-h-[44px] px-3 rounded-lg font-black text-xs uppercase tracking-wider transition-colors ${
                    props.view === 'community'
                      ? 'bg-neutral-900 text-yellow-500 border border-yellow-500/30'
                      : 'bg-neutral-900/30 text-neutral-300 border border-neutral-700 hover:bg-neutral-900/50 hover:border-neutral-600 hover:text-white'
                  }`}
                >
                  Comunidade
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="sticky top-[var(--dashboard-sticky-top)] z-30">
            <div className="bg-neutral-900/70 backdrop-blur-md border border-neutral-800/70 rounded-2xl p-1 shadow-lg shadow-black/30">
              <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-1 grid grid-cols-3 gap-1">
                <div className="min-h-[44px] rounded-lg bg-neutral-900/40" />
                <div className="min-h-[44px] rounded-lg bg-neutral-900/40" />
                <div className="min-h-[44px] rounded-lg bg-neutral-900/40" />
              </div>
            </div>
          </div>
        )}
      </div>

      {props.view === 'assessments' ? <div className="pt-2">{props.assessmentsContent ?? null}</div> : null}
      {props.view === 'community' ? <div className="pt-2">{props.communityContent ?? null}</div> : null}

      {props.view === 'dashboard' && (
        <>
          {showNewRecordsCard ? <RecentAchievements userId={props.currentUserId} /> : null}
          
          {props.streakStats && (showIronRank || showBadges) ? (
            <BadgesGallery
              badges={props.streakStats.badges}
              currentStreak={props.streakStats.currentStreak}
              totalVolumeKg={props.streakStats.totalVolumeKg}
              currentUserId={props.currentUserId}
              showIronRank={showIronRank}
              showBadges={showBadges}
            />
          ) : null}

          <button
            onClick={() => {
              setCreatingWorkout(true)
              try {
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
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Meus Treinos</h3>
              <div className="relative">
                <button
                  type="button"
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
                          type="button"
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
                          type="button"
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
                          type="button"
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

            {workouts.length === 0 && (
              <div className="text-center py-10 text-neutral-600">
                <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
                  <Dumbbell size={32} />
                </div>
                <p>Nenhum treino criado.</p>
              </div>
            )}

            {workouts.map((w, idx) => (
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
                  props.onQuickView(w)
                }}
              >
                <div className="relative z-10">
                  <h3 className="font-bold text-white text-lg uppercase mb-1 pr-32 leading-tight">{String(w?.title || 'Treino')}</h3>
                  <p className="text-xs text-neutral-400 font-mono mb-4">{Array.isArray(w?.exercises) ? w.exercises.length : 0} EXERCÍCIOS</p>

                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        const key = getWorkoutKey(w, idx)
                        await runWorkoutAction(key, 'start', () => props.onStartSession(w))
                      }}
                      disabled={isWorkoutBusy(getWorkoutKey(w, idx))}
                      className="relative z-30 flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-lg flex items-center justify-center gap-2 text-white font-bold text-sm transition-colors border border-white/10 active:scale-95 touch-manipulation disabled:opacity-60"
                    >
                      {isActionBusy(getWorkoutKey(w, idx), 'start') ? (
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
                  {w?.user_id && props.currentUserId && w.user_id === props.currentUserId && (
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
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
