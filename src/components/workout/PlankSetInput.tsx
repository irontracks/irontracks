import React, { useState, useRef, useCallback } from 'react'
import { Play, Square } from 'lucide-react'
import { useActiveWorkout } from './ActiveWorkoutContext'
import { UnknownRecord } from './types'

type Props = {
  ex: UnknownRecord
  exIdx: number
  setIdx: number
}

export const PlankSetInput: React.FC<Props> = ({ ex, exIdx, setIdx }) => {
  const { getLog, updateLog, startTimer, getPlannedSet, settings } = useActiveWorkout()

  const key = `${exIdx}-${setIdx}`
  const weightInputId = `plank-weight-${key}`
  const durationInputId = `plank-duration-${key}`
  const log = getLog(key)
  const plannedSet = getPlannedSet(ex as Parameters<typeof getPlannedSet>[0], setIdx) as { durationSeconds?: number | null } | null

  // Extrai bodyWeightKg do settings (UnknownRecord | null)
  const rawBw = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).bodyWeightKg : null
  const bodyWeightKg: number | null =
    rawBw != null && Number.isFinite(Number(rawBw)) && Number(rawBw) > 0
      ? Number(rawBw)
      : null

  const initialWeight =
    typeof log.weight === 'number' || typeof log.weight === 'string'
      ? String(log.weight)
      : bodyWeightKg != null
        ? String(bodyWeightKg)
        : ''
  const initialDuration =
    log.durationSeconds != null
      ? String(log.durationSeconds)
      : plannedSet?.durationSeconds != null
        ? String(plannedSet.durationSeconds)
        : ''

  const [weight, setWeight] = useState(initialWeight)
  const [targetSeconds, setTargetSeconds] = useState(initialDuration)
  const [isRunning, setIsRunning] = useState(false)
  const startedAtRef = useRef<number>(0)

  const inputBase =
    'w-full bg-black/40 border border-neutral-700/80 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500 focus:border-yellow-500/50'

  const handleStart = useCallback(() => {
    const sec = Number(targetSeconds)
    if (!Number.isFinite(sec) || sec <= 0) return
    startedAtRef.current = Date.now()
    setIsRunning(true)

    startTimer(sec, {
      kind: 'plank',
      key,
      exerciseName: String(ex?.name ?? '').trim(),
      onComplete: () => {
        updateLog(key, {
          weight: weight === '' ? null : Number(weight),
          reps: null,
          durationSeconds: sec,
          done: true,
        })
        setIsRunning(false)
      },
    })
  }, [targetSeconds, startTimer, key, ex, updateLog, weight])

  const handleStop = useCallback(() => {
    const elapsedMs = Date.now() - startedAtRef.current
    const aguentou = Math.max(1, Math.round(elapsedMs / 1000))
    updateLog(key, {
      weight: weight === '' ? null : Number(weight),
      reps: null,
      durationSeconds: aguentou,
      done: true,
    })
    setIsRunning(false)
  }, [key, updateLog, weight])

  const secondsNum = Number(targetSeconds)
  const canStart = Number.isFinite(secondsNum) && secondsNum > 0

  if (isRunning) {
    return (
      <div className="rounded-xl border px-3 py-2.5 bg-neutral-900/50 border-neutral-800/80">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-300">Série {setIdx + 1} • Prancha em andamento</span>
          <button
            type="button"
            onClick={handleStop}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/90 text-white text-xs font-black"
          >
            <Square size={14} />
            Parar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border px-3 py-2.5 bg-neutral-900/50 border-neutral-800/80 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-[11px] bg-yellow-500 text-black">
          {setIdx + 1}
        </div>
        <div className="flex-1 grid grid-cols-2 gap-1.5 min-w-0">
          <div>
            <label
              htmlFor={weightInputId}
              className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold block mb-0.5"
            >
              Peso corporal (kg)
            </label>
            <input
              id={weightInputId}
              aria-label="Peso corporal em kg"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className={inputBase}
              placeholder="kg"
            />
          </div>
          <div>
            <label
              htmlFor={durationInputId}
              className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold block mb-0.5"
            >
              Tempo alvo (s)
            </label>
            <input
              id={durationInputId}
              aria-label="Tempo alvo em segundos"
              inputMode="numeric"
              value={targetSeconds}
              onChange={(e) => setTargetSeconds(e.target.value)}
              className={inputBase}
              placeholder="seg"
            />
          </div>
        </div>
      </div>

      {bodyWeightKg == null && (
        <p className="text-[11px] text-amber-400/80 px-1">
          Cadastre seu peso no perfil para auto-preenchimento.
        </p>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={!canStart}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm bg-yellow-500 text-black disabled:bg-neutral-800 disabled:text-neutral-600 transition-all duration-200"
      >
        <Play size={16} />
        Iniciar {canStart ? `(${secondsNum}s)` : ''}
      </button>
    </div>
  )
}
