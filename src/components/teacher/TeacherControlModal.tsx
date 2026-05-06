'use client'

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, Loader2, Gamepad2, Save, Plus, Minus } from 'lucide-react'
import { useTeacherControl } from '@/hooks/useTeacherControl'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActiveWorkoutSession, Exercise } from '@/types/app'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

function getExercises(session: ActiveWorkoutSession | null): Exercise[] {
  const exs = (session?.workout as Record<string, unknown> | null)?.exercises
  return Array.isArray(exs) ? (exs as Exercise[]) : []
}

function getSetsCount(ex: Exercise): number {
  return Number(ex.sets) || 0
}

interface LogEntry {
  done?: boolean
  weight?: string
  reps?: string
  rpe?: number | null
}

function getLog(session: ActiveWorkoutSession | null, exIdx: number, setIdx: number): LogEntry {
  const raw = session?.logs?.[`${exIdx}-${setIdx}`]
  if (!isRecord(raw)) return {}
  return {
    done: Boolean(raw.done),
    weight: String(raw.weight ?? ''),
    reps: String(raw.reps ?? ''),
    rpe: raw.rpe != null ? Number(raw.rpe) : null,
  }
}

const RPE_OPTS = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10]

// ─── Props ────────────────────────────────────────────────────────────────────

interface TeacherControlModalProps {
  supabase: SupabaseClient
  studentUserId: string
  studentName: string
  getAuthHeaders: () => Promise<Record<string, string>>
  onClose: () => void
}

// ─── Set row ─────────────────────────────────────────────────────────────────

function SetRow({
  exIdx,
  setIdx,
  session,
  reps: defaultReps,
  onPatch,
}: {
  exIdx: number
  setIdx: number
  session: ActiveWorkoutSession | null
  reps: string | number | null
  onPatch: (updater: (prev: ActiveWorkoutSession) => ActiveWorkoutSession) => void
}) {
  const log = getLog(session, exIdx, setIdx)

  const update = useCallback((field: keyof LogEntry, value: unknown) => {
    onPatch(prev => {
      const prevLog = isRecord(prev?.logs?.[`${exIdx}-${setIdx}`])
        ? (prev.logs![`${exIdx}-${setIdx}`] as Record<string, unknown>)
        : {}
      return {
        ...prev,
        logs: {
          ...(prev.logs ?? {}),
          [`${exIdx}-${setIdx}`]: { ...prevLog, [field]: value },
        },
      }
    })
  }, [exIdx, setIdx, onPatch])

  const toggleDone = () => update('done', !log.done)

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all ${log.done ? 'opacity-70' : ''}`}
      style={{
        background: log.done ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${log.done ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      {/* Set number + done toggle */}
      <button
        type="button"
        onClick={toggleDone}
        className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center font-black text-[11px] transition-all active:scale-95"
        style={{
          background: log.done ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)',
          color: log.done ? '#22c55e' : 'rgba(255,255,255,0.5)',
          border: `1px solid ${log.done ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
        }}
        aria-label={`Série ${setIdx + 1}`}
      >
        {log.done ? '✓' : String(setIdx + 1)}
      </button>

      {/* Weight */}
      <input
        type="number"
        inputMode="decimal"
        placeholder="Kg"
        value={log.weight ?? ''}
        onChange={e => update('weight', e.target.value)}
        className="flex-1 min-w-0 rounded-lg px-2 py-1 text-center text-sm font-bold text-white placeholder-white/20 focus:outline-none"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
        aria-label="Peso (kg)"
      />

      {/* Reps */}
      <input
        type="number"
        inputMode="numeric"
        placeholder={defaultReps != null ? String(defaultReps) : 'Reps'}
        value={log.reps ?? ''}
        onChange={e => update('reps', e.target.value)}
        className="flex-1 min-w-0 rounded-lg px-2 py-1 text-center text-sm font-bold text-white placeholder-white/20 focus:outline-none"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
        aria-label="Repetições"
      />

      {/* RPE mini-picker */}
      <select
        value={log.rpe != null ? String(log.rpe) : ''}
        onChange={e => update('rpe', e.target.value ? Number(e.target.value) : null)}
        className="flex-shrink-0 rounded-lg px-1 py-1 text-xs font-bold text-white focus:outline-none"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', width: 60 }}
        aria-label="RPE"
      >
        <option value="">RPE</option>
        {RPE_OPTS.map(r => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Exercise card ────────────────────────────────────────────────────────────

function ExerciseCard({
  ex,
  exIdx,
  session,
  onPatch,
}: {
  ex: Exercise
  exIdx: number
  session: ActiveWorkoutSession | null
  onPatch: (updater: (prev: ActiveWorkoutSession) => ActiveWorkoutSession) => void
}) {
  const setsCount = getSetsCount(ex)

  const adjustSets = useCallback((delta: number) => {
    onPatch(prev => {
      const prevExs = getExercises(prev)
      const updated = [...prevExs]
      const n = Math.max(1, (Number(updated[exIdx]?.sets) || 0) + delta)
      updated[exIdx] = { ...updated[exIdx], sets: n }
      return {
        ...prev,
        workout: {
          ...(prev.workout as Record<string, unknown>),
          exercises: updated,
        },
      }
    })
  }, [exIdx, onPatch])

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Exercise header */}
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white truncate">{ex.name || 'Exercício'}</p>
          {ex.restTime != null && Number(ex.restTime) > 0 && (
            <p className="text-[10px] text-white/30 mt-0.5">{Number(ex.restTime)}s descanso</p>
          )}
        </div>
        {/* Adjust sets */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => adjustSets(-1)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 active:scale-95 transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            aria-label="Remover série"
          >
            <Minus size={12} />
          </button>
          <span className="text-xs font-black text-white/60 w-8 text-center">{setsCount}x</span>
          <button
            type="button"
            onClick={() => adjustSets(1)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 active:scale-95 transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            aria-label="Adicionar série"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-4 gap-2 px-3 pb-1.5">
        <div className="text-[9px] font-black uppercase tracking-widest text-white/20 text-center">Série</div>
        <div className="text-[9px] font-black uppercase tracking-widest text-white/20 text-center">Kg</div>
        <div className="text-[9px] font-black uppercase tracking-widest text-white/20 text-center">Reps</div>
        <div className="text-[9px] font-black uppercase tracking-widest text-white/20 text-center">RPE</div>
      </div>

      {/* Set rows */}
      <div className="flex flex-col gap-1.5 px-3 pb-3">
        {Array.from({ length: setsCount }, (_, i) => (
          <SetRow
            key={i}
            exIdx={exIdx}
            setIdx={i}
            session={session}
            reps={ex.reps}
            onPatch={onPatch}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TeacherControlModal({
  supabase,
  studentUserId,
  studentName,
  getAuthHeaders,
  onClose,
}: TeacherControlModalProps) {
  const { session, isLoading, isSaving, patchState } = useTeacherControl(
    supabase,
    studentUserId,
    getAuthHeaders,
  )

  const [releasing, setReleasing] = useState(false)

  const handleRelease = useCallback(async () => {
    setReleasing(true)
    try {
      const headers = await getAuthHeaders()
      await fetch(`/api/teacher/control/${studentUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'release' }),
      })
      onClose()
    } finally {
      setReleasing(false)
    }
  }, [studentUserId, getAuthHeaders, onClose])

  const exercises = getExercises(session)
  const workoutTitle = String(
    (session?.workout as Record<string, unknown> | null)?.title ??
    (session?.workout as Record<string, unknown> | null)?.name ??
    'Treino'
  )

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(5,12,8,0.99) 0%, rgba(3,8,5,0.99) 100%)',
        // Distinct green border to make it obvious this is the teacher's control view
        boxShadow: 'inset 0 0 0 2px rgba(34,197,94,0.4)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pb-3 flex-shrink-0"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
          borderBottom: '1px solid rgba(34,197,94,0.15)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-400 active:scale-95 transition-all"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
          aria-label="Voltar"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Gamepad2 size={13} className="text-green-400 flex-shrink-0" />
            <p className="text-xs font-black text-green-400 uppercase tracking-wider truncate">
              Controlando: {studentName}
            </p>
          </div>
          <p className="text-sm font-black text-white truncate">{workoutTitle}</p>
        </div>

        {/* Status indicators */}
        {isSaving && (
          <Save size={14} className="text-green-400/60 animate-pulse flex-shrink-0" />
        )}

        <button
          type="button"
          onClick={handleRelease}
          disabled={releasing}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all active:scale-95 disabled:opacity-60"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
        >
          {releasing ? <Loader2 size={12} className="animate-spin" /> : null}
          Encerrar
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-white/40">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Carregando treino...</span>
          </div>
        ) : exercises.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-white/30">Nenhum exercício neste treino</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Hint */}
            <p className="text-[10px] font-bold text-green-400/50 text-center uppercase tracking-widest">
              🎮 Você está no controle — todas as alterações são aplicadas ao aluno em tempo real
            </p>

            {exercises.map((ex, exIdx) => (
              <ExerciseCard
                key={exIdx}
                ex={ex}
                exIdx={exIdx}
                session={session}
                onPatch={patchState}
              />
            ))}

            {/* Bottom spacer */}
            <div style={{ height: 'max(env(safe-area-inset-bottom, 0px), 16px)' }} />
          </div>
        )}
      </div>
    </motion.div>
  )
}
