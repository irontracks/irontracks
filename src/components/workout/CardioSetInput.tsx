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

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Esteira / treadmill: único cardio que ganha o campo de inclinação (%). Bike,
// corrida na rua etc. mostram só tempo + intensidade.
const TREADMILL_REGEX = /\b(esteira|treadmill)\b/i

/**
 * Input de série para exercícios de cardio (method === 'Cardio').
 * Em vez de PESO/REPS/RPE, mostra Tempo + Intensidade (+ Inclinação na esteira)
 * e um botão START que roda a contagem regressiva do tempo alvo — espelhando a
 * mecânica do PlankSetInput (mesmo timer/Live Activity, só que kind: 'cardio').
 */
export const CardioSetInput: React.FC<Props> = ({ ex, exIdx, setIdx, setsCount }) => {
  const { getLog, updateLog, startTimer, getPlannedSet, setCollapsed } = useWorkoutContext()

  const restTime = parseTrainingNumber(ex?.restTime ?? (ex as Record<string, unknown>)?.rest_time) ?? 0
  const name = String(ex?.name ?? '').trim()
  const isTreadmill = TREADMILL_REGEX.test(name)

  const key = `${exIdx}-${setIdx}`
  const minutesInputId = `cardio-minutes-${key}`
  const speedInputId = `cardio-speed-${key}`
  const inclineInputId = `cardio-incline-${key}`
  const log = getLog(key)

  const plannedSet = getPlannedSet(ex as Parameters<typeof getPlannedSet>[0], setIdx) as UnknownRecord | null
  const cfgRaw = plannedSet ? (plannedSet.advanced_config ?? plannedSet.advancedConfig ?? null) : null
  const cfg = isObj(cfgRaw) ? cfgRaw : null

  const plannedDurationSec =
    log.durationSeconds != null && Number.isFinite(Number(log.durationSeconds))
      ? Number(log.durationSeconds)
      : plannedSet?.durationSeconds != null && Number.isFinite(Number(plannedSet.durationSeconds))
        ? Number(plannedSet.durationSeconds)
        : null

  const initialMinutes =
    plannedDurationSec != null && plannedDurationSec > 0
      ? String(Math.round((plannedDurationSec / 60) * 10) / 10)
      : ''
  const initialSpeed =
    log.speed != null && log.speed !== '' ? String(log.speed) : cfg?.speed != null ? String(cfg.speed) : ''
  const initialIncline =
    log.incline != null && log.incline !== '' ? String(log.incline) : cfg?.incline != null ? String(cfg.incline) : ''

  const [minutes, setMinutes] = useState(initialMinutes)
  const [speed, setSpeed] = useState(initialSpeed)
  const [incline, setIncline] = useState(initialIncline)
  const [isRunning, setIsRunning] = useState(false)
  const startedAtRef = useRef<number>(0)
  // Trava anti-duplo-toque (~400ms), igual aos sets normais/plank.
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
        target?.scrollIntoView({ behavior: 'instant', block: 'start' })
      } catch { /* silenced */ }
    }, delay)
  }, [setCollapsed, exIdx])

  const maybeCollapseIfLastSet = useCallback(() => {
    if (setsCount != null && setIdx === setsCount - 1) {
      collapseAndScroll(600)
    }
  }, [setsCount, setIdx, collapseAndScroll])

  // Tempo alvo em segundos (limitado a 1..7200s pra não criar um timer absurdo).
  const targetSeconds = (() => {
    const m = Number(minutes)
    if (!Number.isFinite(m) || m <= 0) return 0
    return Math.min(7200, Math.max(1, Math.round(m * 60)))
  })()
  const canStart = targetSeconds > 0

  // Grava a série de cardio. `durationSec` = tempo efetivamente feito.
  const commitLog = useCallback(
    (durationSec: number) => {
      const nowMs = Date.now()
      updateLog(key, {
        durationSeconds: durationSec,
        speed: parseTrainingNumber(speed) ?? null,
        incline: isTreadmill ? (parseTrainingNumber(incline) ?? null) : null,
        weight: null,
        reps: null,
        done: true,
        restStartMs: restTime > 0 ? nowMs : null,
      })
      // Encadeia o descanso configurado (paridade com plank/sets normais).
      if (restTime > 0) {
        startTimer(restTime, { kind: 'rest', key, restStartedAtMs: nowMs })
      }
      maybeCollapseIfLastSet()
    },
    [key, updateLog, speed, incline, isTreadmill, restTime, startTimer, maybeCollapseIfLastSet],
  )

  const handleStart = useCallback(() => {
    if (Date.now() - lastToggleRef.current < 400) return
    if (!canStart) return
    lastToggleRef.current = Date.now()
    startedAtRef.current = Date.now()
    setIsRunning(true)

    startTimer(targetSeconds, {
      kind: 'cardio',
      key,
      exerciseName: name,
      onComplete: () => {
        commitLog(targetSeconds)
        setIsRunning(false)
      },
    })
  }, [canStart, targetSeconds, startTimer, key, name, commitLog])

  const handleStop = useCallback(() => {
    if (Date.now() - lastToggleRef.current < 400) return
    lastToggleRef.current = Date.now()
    const elapsedSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
    commitLog(elapsedSec)
    setIsRunning(false)
  }, [commitLog])

  // "Concluir sem cronômetro": o usuário fez o cardio no próprio aparelho e só
  // quer registrar o tempo alvo, sem esperar a contagem no app.
  const handleLogNow = useCallback(() => {
    if (Date.now() - lastToggleRef.current < 400) return
    if (!canStart) return
    lastToggleRef.current = Date.now()
    commitLog(targetSeconds)
  }, [canStart, targetSeconds, commitLog])

  const done = !!log.done
  const loggedDuration =
    typeof log.durationSeconds === 'number' && log.durationSeconds > 0 ? log.durationSeconds : null
  const doneSummary = (() => {
    const parts: string[] = []
    if (loggedDuration != null) {
      const min = Math.round((loggedDuration / 60) * 10) / 10
      parts.push(`${min} min`)
    }
    if (log.speed != null && log.speed !== '') parts.push(`${log.speed} km/h`)
    if (isTreadmill && log.incline != null && log.incline !== '') parts.push(`${log.incline}%`)
    return parts.join(' • ')
  })()

  if (isRunning) {
    return (
      <div className="rounded-xl border px-3 py-2.5 bg-neutral-900/50 border-neutral-800/80">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-300">Série {setIdx + 1} • Cardio em andamento</span>
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
  const gridCols = isTreadmill ? 'grid-cols-3' : 'grid-cols-2'

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2">
        <div className={badgeClass}>{done ? <Check size={12} /> : setIdx + 1}</div>
        <div className={`flex-1 grid ${gridCols} gap-1.5 min-w-0`}>
          <div>
            <label
              htmlFor={minutesInputId}
              className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold block mb-0.5"
            >
              Tempo (min)
            </label>
            <input
              id={minutesInputId}
              aria-label="Tempo em minutos"
              inputMode="decimal"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={inputBase}
              placeholder="min"
            />
          </div>
          <div>
            <label
              htmlFor={speedInputId}
              className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold block mb-0.5"
            >
              {isTreadmill ? 'Veloc. (km/h)' : 'Intensidade'}
            </label>
            <input
              id={speedInputId}
              aria-label={isTreadmill ? 'Velocidade em km/h' : 'Intensidade'}
              inputMode="decimal"
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              className={inputBase}
              placeholder={isTreadmill ? 'km/h' : 'nível'}
            />
          </div>
          {isTreadmill && (
            <div>
              <label
                htmlFor={inclineInputId}
                className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold block mb-0.5"
              >
                Inclin. (%)
              </label>
              <input
                id={inclineInputId}
                aria-label="Inclinação em porcentagem"
                inputMode="decimal"
                value={incline}
                onChange={(e) => setIncline(e.target.value)}
                className={inputBase}
                placeholder="%"
              />
            </div>
          )}
        </div>
      </div>

      {done ? (
        <div className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
          <Check size={16} />
          Concluído{doneSummary ? ` (${doneSummary})` : ''}
        </div>
      ) : (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={handleStart}
            disabled={!canStart}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm bg-yellow-500 text-black disabled:bg-neutral-800 disabled:text-neutral-600 transition-all duration-200"
          >
            <Play size={16} />
            Iniciar {canStart ? `(${Math.round((targetSeconds / 60) * 10) / 10} min)` : ''}
          </button>
          <button
            type="button"
            onClick={handleLogNow}
            disabled={!canStart}
            className="w-full text-center text-[12px] font-bold text-neutral-400 disabled:text-neutral-700 py-1"
          >
            Concluir sem cronômetro
          </button>
        </div>
      )}
    </div>
  )
}
