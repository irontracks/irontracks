import React, { useState, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { Check, Play, Square } from 'lucide-react'
import { useWorkoutContext } from './WorkoutContext'
import { UnknownRecord } from './types'
import { parseTrainingNumber } from '@/utils/trainingNumber'

type Props = {
  ex: UnknownRecord
  exIdx: number
  setIdx: number
  setsCount?: number
}

export const PlankSetInput: React.FC<Props> = ({ ex, exIdx, setIdx, setsCount }) => {
  const { getLog, updateLog, startTimer, getPlannedSet, settings, setCollapsed } = useWorkoutContext()

  // Rest time between plank sets (same field as regular exercises)
  const restTime = parseTrainingNumber(ex?.restTime ?? (ex as Record<string, unknown>)?.rest_time) ?? 0

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
  // Trava anti-duplo-toque (mesma proteção de ~400ms dos sets normais): dedo
  // suado / duplo toque não inicia nem para o timer/log duas vezes.
  const lastToggleRef = useRef<number>(0)

  const inputBase =
    'w-full bg-black/40 border border-neutral-700/80 rounded-xl px-3 py-2 text-[16px] text-white outline-none focus:ring-1 ring-yellow-500 focus:border-yellow-500/50'

  const collapseAndScroll = useCallback((delay: number) => {
    setTimeout(() => {
      try {
        flushSync(() => {
          setCollapsed?.((prev: Set<number>) => {
            const next = new Set(prev)
            next.add(exIdx)
            return next
          })
        })
        const firstSetOfNext = document.querySelector<HTMLElement>(`[data-set-first="${exIdx + 1}"]`)
        const nextCard = document.querySelector<HTMLElement>(`[data-exercise-idx="${exIdx + 1}"]`)
        const target = firstSetOfNext ?? nextCard
        // 'instant' (nunca 'smooth'): a rolagem suave dispara o zoom automático
        // travado do iPhone (bug já visto em produção). Igual ao resto do app.
        target?.scrollIntoView({ behavior: 'instant', block: 'start' })
      } catch { /* silenced */ }
    }, delay)
  }, [setCollapsed, exIdx])

  const maybeCollapseIfLastSet = useCallback(() => {
    if (setsCount != null && setIdx === setsCount - 1) {
      collapseAndScroll(600)
    }
  }, [setsCount, setIdx, collapseAndScroll])

  const handleStart = useCallback(() => {
    if (Date.now() - lastToggleRef.current < 400) return
    const raw = Number(targetSeconds)
    if (!Number.isFinite(raw) || raw <= 0) return
    // Limita o tempo alvo a 1..3600s: colar um valor absurdo (ex.: "999999")
    // criava um timer gigante e podia travar a Live Activity no iOS.
    const sec = Math.min(3600, Math.max(1, Math.round(raw)))
    lastToggleRef.current = Date.now()
    startedAtRef.current = Date.now()
    setIsRunning(true)

    startTimer(sec, {
      kind: 'plank',
      key,
      exerciseName: String(ex?.name ?? '').trim(),
      onComplete: () => {
        const nowMs = Date.now()
        updateLog(key, {
          weight: parseTrainingNumber(weight) ?? null,
          reps: null,
          durationSeconds: sec,
          done: true,
          restStartMs: restTime > 0 ? nowMs : null,
        })
        setIsRunning(false)
        // Switch from plank exercise timer → rest timer, exactly like normal sets do.
        // This replaces the plank overlay so the user sees the rest countdown
        // instead of the plank timer lingering through the recovery period.
        if (restTime > 0) {
          startTimer(restTime, { kind: 'rest', key, restStartedAtMs: nowMs })
        }
        maybeCollapseIfLastSet()
      },
    })
  }, [targetSeconds, startTimer, key, ex, updateLog, weight, restTime, maybeCollapseIfLastSet])

  const handleStop = useCallback(() => {
    if (Date.now() - lastToggleRef.current < 400) return
    lastToggleRef.current = Date.now()
    const elapsedMs = Date.now() - startedAtRef.current
    const aguentou = Math.max(1, Math.round(elapsedMs / 1000))
    const nowMs = Date.now()
    updateLog(key, {
      weight: parseTrainingNumber(weight) ?? null,
      reps: null,
      durationSeconds: aguentou,
      done: true,
      restStartMs: restTime > 0 ? nowMs : null,
    })
    setIsRunning(false)
    // Replace the still-running plank timer with the rest timer so the overlay
    // immediately switches to rest mode instead of lingering on the plank countdown.
    if (restTime > 0) {
      startTimer(restTime, { kind: 'rest', key, restStartedAtMs: nowMs })
    }
    maybeCollapseIfLastSet()
  }, [key, updateLog, weight, restTime, startTimer, maybeCollapseIfLastSet])

  const secondsNum = Number(targetSeconds)
  const canStart = Number.isFinite(secondsNum) && secondsNum > 0
  const done = !!log.done
  const loggedDuration =
    typeof log.durationSeconds === 'number' && log.durationSeconds > 0 ? log.durationSeconds : null

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

  const containerClass = done
    ? 'rounded-xl border px-3 py-2.5 bg-emerald-950/30 border-emerald-500/30 space-y-2'
    : 'rounded-xl border px-3 py-2.5 bg-neutral-900/50 border-neutral-800/80 space-y-2'
  const badgeClass = done
    ? 'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-[11px] bg-emerald-500 text-black'
    : 'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-[11px] bg-yellow-500 text-black'

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2">
        <div className={badgeClass}>
          {done ? <Check size={12} /> : setIdx + 1}
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

      {done ? (
        <div className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
          <Check size={16} />
          Concluída {loggedDuration !== null ? `(${loggedDuration}s)` : ''}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm bg-yellow-500 text-black disabled:bg-neutral-800 disabled:text-neutral-600 transition-all duration-200"
        >
          <Play size={16} />
          Iniciar {canStart ? `(${secondsNum}s)` : ''}
        </button>
      )}
    </div>
  )
}
