'use client'
/**
 * TeacherWorkoutMirror — espelhamento em tempo real do treino do aluno.
 * O professor vê exatamente o que o aluno está fazendo: exercício atual,
 * sets, peso, reps, RPE, cronômetro e status de cada série.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Activity, Clock, Dumbbell, RefreshCw, Zap, CheckCircle2, Circle, Flame } from 'lucide-react'
import { useAdminPanel } from '@/components/admin-panel/AdminPanelContext'
import type { ActiveWorkoutSession, SetDetail } from '@/types/app'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveSession {
  user_id: string
  state: ActiveWorkoutSession
  started_at: string
  updated_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(startedAt: number): string {
  const secs = Math.floor((Date.now() - startedAt) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function rpeLabel(rpe: number | string | null | undefined): string {
  const n = Number(rpe ?? 0)
  if (n >= 10) return '🔥 Falha'
  if (n >= 9) return '9 — Máximo'
  if (n >= 8) return '8 — Muito Pesado'
  if (n >= 7) return '7 — Pesado'
  if (n >= 6) return '6 — Moderado'
  return `${n}`
}

function rpeColor(rpe: number | string | null | undefined): string {
  const n = Number(rpe ?? 0)
  if (n >= 10) return 'text-red-400'
  if (n >= 9) return 'text-orange-400'
  if (n >= 8) return 'text-yellow-400'
  if (n >= 7) return 'text-lime-400'
  return 'text-neutral-400'
}

// ─── SetRow ───────────────────────────────────────────────────────────────────

function SetRow({ s, idx }: { s: SetDetail; idx: number }) {
  const isWarm = s.isWarmup
  const done = s.completed
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all ${
        done
          ? 'bg-green-500/10 border-green-500/20'
          : isWarm
          ? 'bg-neutral-800/60 border-neutral-700/50 opacity-70'
          : 'bg-neutral-800/40 border-neutral-700/40'
      }`}
    >
      {/* status icon */}
      <div className="flex-shrink-0">
        {done ? (
          <CheckCircle2 size={16} className="text-green-400" />
        ) : (
          <Circle size={16} className={isWarm ? 'text-neutral-600' : 'text-neutral-500'} />
        )}
      </div>

      {/* set number */}
      <span className="text-[11px] font-black uppercase tracking-widest text-neutral-500 w-8 flex-shrink-0">
        {isWarm ? 'AQ' : `S${idx + 1}`}
      </span>

      {/* weight */}
      <div className="flex-1 flex items-center gap-4">
        <div className="text-center min-w-[52px]">
          <div className="text-base font-black text-white">
            {s.weight != null ? `${s.weight}` : '—'}
          </div>
          <div className="text-[9px] text-neutral-600 uppercase tracking-wide">kg</div>
        </div>
        <div className="text-neutral-700">×</div>
        <div className="text-center min-w-[40px]">
          <div className="text-base font-black text-white">{s.reps ?? '—'}</div>
          <div className="text-[9px] text-neutral-600 uppercase tracking-wide">reps</div>
        </div>
        <div className="ml-auto">
          <span className={`text-xs font-bold ${rpeColor(s.rpe)}`}>{rpeLabel(s.rpe)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── ExerciseCard ─────────────────────────────────────────────────────────────

function ExerciseCard({
  exercise,
  active,
  onClick,
}: {
  exercise: Record<string, unknown>
  active: boolean
  onClick: () => void
}) {
  const sets = Array.isArray(exercise.setDetails) ? (exercise.setDetails as SetDetail[]) : []
  const doneCount = sets.filter(s => s.completed).length
  const totalCount = sets.length

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
        active
          ? 'bg-yellow-500/10 border-yellow-500/30 shadow-[0_0_12px_rgba(234,179,8,0.1)]'
          : 'bg-neutral-800/40 border-neutral-700/40 hover:border-neutral-600'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-black truncate ${active ? 'text-yellow-300' : 'text-white'}`}>
          {String(exercise.name ?? 'Exercício')}
        </span>
        {totalCount > 0 && (
          <span
            className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${
              doneCount === totalCount && totalCount > 0
                ? 'bg-green-500/20 text-green-400'
                : 'bg-neutral-700 text-neutral-400'
            }`}
          >
            {doneCount}/{totalCount}
          </span>
        )}
      </div>
      {active && totalCount > 0 && (
        <div className="mt-1.5 flex gap-1">
          {sets.map((s, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                s.completed ? 'bg-green-400' : 'bg-neutral-700'
              }`}
            />
          ))}
        </div>
      )}
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TeacherWorkoutMirror() {
  const { selectedStudent, supabase } = useAdminPanel()
  const [session, setSession] = useState<LiveSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeExIdx, setActiveExIdx] = useState(0)
  const [ticker, setTicker] = useState(0)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const studentUserId = String(selectedStudent?.user_id || '')

  // ── Fetch initial state ────────────────────────────────────────────────────
  const fetchSession = useCallback(async () => {
    if (!studentUserId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/teacher/student-session/${studentUserId}`)
      const json = await res.json() as { ok: boolean; session: LiveSession | null; error?: string }
      if (json.ok) {
        setSession(json.session)
        if (json.session) setActiveExIdx(0)
      } else {
        setError(json.error ?? 'Erro ao carregar sessão')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro de rede')
    } finally {
      setLoading(false)
    }
  }, [studentUserId])

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!studentUserId) return

    void fetchSession()

    const ch = supabase
      .channel(`mirror:${studentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'active_workout_sessions',
          filter: `user_id=eq.${studentUserId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setSession(null)
            return
          }
          const row = payload.new as LiveSession
          setSession(row)
        }
      )
      .subscribe()

    channelRef.current = ch

    return () => {
      void supabase.removeChannel(ch)
    }
  }, [studentUserId, supabase, fetchSession])

  // ── Elapsed time ticker ────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return
    const id = setInterval(() => setTicker(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [session])

  // ── Auto-detect active exercise (first incomplete) ─────────────────────────
  useEffect(() => {
    if (!session?.state?.workout?.exercises) return
    const exs = session.state.workout.exercises as unknown as Record<string, unknown>[]
    const firstIncomplete = exs.findIndex((ex) => {
      const sets = Array.isArray(ex.setDetails) ? (ex.setDetails as SetDetail[]) : []
      return sets.some(s => !s.completed)
    })
    if (firstIncomplete >= 0) setActiveExIdx(firstIncomplete)
  }, [session])

  // ── Derived data ───────────────────────────────────────────────────────────
  const exercises = (session?.state?.workout?.exercises ?? []) as unknown as Record<string, unknown>[]
  const currentEx = exercises[activeExIdx] ?? null
  const currentSets = currentEx
    ? Array.isArray(currentEx.setDetails)
      ? (currentEx.setDetails as SetDetail[])
      : []
    : []
  const doneSets = currentSets.filter(s => s.completed).length
  const totalVolume = exercises.reduce((acc, ex) => {
    const sets = Array.isArray(ex.setDetails) ? (ex.setDetails as SetDetail[]) : []
    return acc + sets.reduce((a, s) => {
      if (!s.completed || s.weight == null || s.reps == null) return a
      return a + (Number(s.weight) * Number(s.reps))
    }, 0)
  }, 0)

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <RefreshCw size={28} className="text-yellow-500 animate-spin" />
        <p className="text-sm text-neutral-400">Buscando treino ao vivo...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <Activity size={32} className="text-red-400" />
        <p className="text-sm text-red-400 font-bold">{error}</p>
        <button
          type="button"
          onClick={() => void fetchSession()}
          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs text-white font-bold transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-neutral-800/60 border border-neutral-700 flex items-center justify-center">
          <Dumbbell size={28} className="text-neutral-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-neutral-300">Nenhum treino em andamento</p>
          <p className="text-xs text-neutral-600 mt-1">
            {String(selectedStudent?.name ?? 'O aluno')} não está treinando agora.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchSession()}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs text-white font-bold transition-colors"
        >
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* ── Status bar ────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-yellow-500/10 to-amber-500/5 border border-yellow-500/20 rounded-2xl px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
          <span className="text-xs font-black uppercase tracking-widest text-green-400">
            Ao Vivo
          </span>
          <span className="text-xs text-neutral-400 font-bold">
            {String(session.state?.workout?.name ?? 'Treino')}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-neutral-300">
            <Clock size={13} className="text-yellow-500" />
            <span className="text-sm font-black tabular-nums">
              {session.state.startedAt ? elapsed(session.state.startedAt) : '—'}
            </span>
            {/* force re-render via ticker */}
            <span className="sr-only">{ticker}</span>
          </div>
          {totalVolume > 0 && (
            <div className="flex items-center gap-1.5 text-neutral-300">
              <Flame size={13} className="text-orange-400" />
              <span className="text-sm font-black">{(totalVolume / 1000).toFixed(1)}t</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => void fetchSession()}
            className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-white transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* ── Main grid ─────────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        {/* Sidebar: exercise list */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-3 space-y-1.5 overflow-hidden">
          <div className="px-2 pb-2 mb-1 border-b border-neutral-800">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
              {exercises.length} exercício{exercises.length !== 1 ? 's' : ''}
            </p>
          </div>
          {exercises.length === 0 && (
            <p className="text-xs text-neutral-600 text-center py-4">Sem exercícios</p>
          )}
          {exercises.map((ex, i) => (
            <ExerciseCard
              key={i}
              exercise={ex}
              active={i === activeExIdx}
              onClick={() => setActiveExIdx(i)}
            />
          ))}
        </div>

        {/* Main: current exercise detail */}
        {currentEx ? (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1">
                  Exercício {activeExIdx + 1}/{exercises.length}
                </p>
                <h3 className="text-xl font-black text-white leading-tight">
                  {String(currentEx.name ?? 'Exercício')}
                </h3>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {!!currentEx.method && (
                    <span className="text-[10px] font-bold bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full border border-neutral-700">
                      {String(currentEx.method)}
                    </span>
                  )}
                  {currentEx.restTime != null && (
                    <span className="text-[10px] font-bold text-neutral-500">
                      Rest: {String(currentEx.restTime)}s
                    </span>
                  )}
                  {!!currentEx.cadence && (
                    <span className="text-[10px] font-bold text-neutral-500">
                      Cad: {String(currentEx.cadence)}
                    </span>
                  )}
                </div>
              </div>
              {/* Progress ring placeholder */}
              <div className="flex-shrink-0 flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-full border-4 border-neutral-800 flex items-center justify-center relative">
                  <span className="text-xs font-black text-white">{doneSets}/{currentSets.length}</span>
                </div>
                <span className="text-[9px] text-neutral-600 uppercase tracking-wide">series</span>
              </div>
            </div>

            {/* Sets */}
            {currentSets.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-[9px] font-black uppercase tracking-widest text-neutral-600 px-4 mb-1">
                  <span />
                  <span className="text-center">PESO × REPS</span>
                  <span className="text-right">RPE</span>
                </div>
                {currentSets.map((s, i) => (
                  <SetRow key={i} s={s} idx={i} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-neutral-600 py-4">
                <Zap size={16} />
                <span className="text-sm">Aguardando início das séries...</span>
              </div>
            )}

            {/* Notes */}
            {!!currentEx.notes && (
              <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1">Obs</p>
                <p className="text-sm text-neutral-300">{String(currentEx.notes)}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-8 flex items-center justify-center">
            <p className="text-sm text-neutral-600">Selecione um exercício</p>
          </div>
        )}
      </div>
    </div>
  )
}
