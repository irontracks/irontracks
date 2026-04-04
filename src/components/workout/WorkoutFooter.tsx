'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Clock, Save, X, Pause, Play, Zap } from 'lucide-react';
import { useWorkoutContext } from './WorkoutContext';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';

export default function WorkoutFooter() {
  const {
    session,
    currentExercise,
    elapsedSeconds,
    formatElapsed,
    ticker,
    timerMinimized,
    setTimerMinimized,
    finishing,
    finishWorkout,
    confirm,
    onFinish,
    completedSets,
    totalSets,
    remainingSets,
    currentExSetsCount,
    currentExDoneSets,
  } = useWorkoutContext();

  // Team pause/resume — gracefully degrades if no team session
  const teamCtx = useTeamWorkout() as unknown as {
    teamSession: { id: string } | null
    sessionPaused: boolean
    pauseSession: () => void
    resumeSession: () => void
  }
  const inTeamSession = !!teamCtx?.teamSession?.id
  const isPaused = inTeamSession && !!teamCtx?.sessionPaused

  const doneSets = completedSets;
  const allSets = totalSets;
  const allDone = allSets > 0 && doneSets >= allSets;

  const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
  const toNum = (v: unknown) => {
    const n = Number(String(v ?? '').replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  const ui = isRecord(session?.ui) ? (session?.ui as Record<string, unknown>) : null
  const activeExec = ui && isRecord(ui.activeExecution) ? (ui.activeExecution as Record<string, unknown>) : null
  const startedAtMs = activeExec ? Number(activeExec.startedAtMs) : 0
  const isExecuting = Number.isFinite(startedAtMs) && startedAtMs > 0
  const timerTargetTime = toNum((session as Record<string, unknown>)?.timerTargetTime)
  const hasRecovery = Number.isFinite(timerTargetTime) && timerTargetTime > 0
  const recoveryRemaining = hasRecovery ? Math.ceil((timerTargetTime - ticker) / 1000) : 0
  const recoverySeconds = hasRecovery ? Math.max(0, recoveryRemaining) : 0
  const recoveryExtraSeconds = hasRecovery ? Math.max(0, -recoveryRemaining) : 0
  const displaySeconds = hasRecovery ? recoverySeconds : isExecuting ? Math.max(0, Math.floor((ticker - startedAtMs) / 1000)) : elapsedSeconds
  const displayLabel = hasRecovery ? 'Recuperação' : isExecuting ? 'Exercício' : 'Treino'
  const plannedRestSec = toNum(
    currentExercise?.restTime ?? (currentExercise as Record<string, unknown>)?.rest_time ?? (currentExercise as Record<string, unknown>)?.rest ?? currentExercise?.rest_time
  )
  const displayTime = `${formatElapsed(displaySeconds)}${recoveryExtraSeconds > 0 ? ` (+${formatElapsed(recoveryExtraSeconds)})` : ''}`

  // Recovery ring: shows progress from plannedRestSec → 0
  const { recoveryRingPct, recoveryRingColor } = React.useMemo(() => {
    const pct = hasRecovery && plannedRestSec > 0
      ? Math.max(0, Math.min(100, (recoverySeconds / plannedRestSec) * 100))
      : 0
    const color = pct > 60 ? '#22c55e' : pct > 30 ? '#f59e0b' : '#ef4444'
    return { recoveryRingPct: pct, recoveryRingColor: color }
  }, [hasRecovery, plannedRestSec, recoverySeconds])

  return (
    <>
      {/* ── Timer strip — full width, sits above the bottom bar ── */}
      <div
        className="fixed left-0 right-0 px-4 z-40"
        style={{ bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}
      >
        {timerMinimized ? (
          /* Minimized: slim full-width strip */
          <button
            type="button"
            onClick={() => setTimerMinimized(false)}
            className="w-full flex items-center justify-between gap-3 rounded-2xl bg-neutral-900/95 border border-neutral-700 px-4 py-2.5 backdrop-blur-sm shadow-xl hover:bg-neutral-800 active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-2">
              <Clock size={13} className={isPaused ? 'text-yellow-400 animate-pulse' : 'text-yellow-500'} />
              <span className="text-[11px] font-black text-neutral-300">{isPaused ? 'Pausado' : displayLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-black font-mono ${isPaused ? 'text-yellow-400 animate-pulse' : 'text-yellow-500'}`}>{displayTime}</span>
              <ChevronUp size={13} className="text-neutral-500" />
            </div>
          </button>
        ) : (
          /* Expanded card — full width */
          <div className="w-full rounded-2xl bg-neutral-900/98 border border-neutral-700 shadow-2xl overflow-hidden">
            {/* Header — tap to collapse */}
            <button
              type="button"
              onClick={() => setTimerMinimized(true)}
              className="w-full flex items-center justify-between gap-2 px-4 pt-3 pb-2 text-left"
            >
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold">Timer</div>
                <div className="text-sm font-black text-white truncate">{currentExercise?.name || 'Treino ativo'}</div>
                <div className="text-[10px] text-neutral-500">
                  {currentExSetsCount > 0 ? `${currentExDoneSets}/${currentExSetsCount} séries` : `Descanso: ${plannedRestSec > 0 ? `${Math.round(plannedRestSec)}s` : '—'}`}
                </div>
              </div>
              <ChevronDown size={14} className="text-neutral-500 shrink-0" />
            </button>

            {/* Time display + recovery ring */}
            <div className="flex items-center justify-between px-4 pt-0.5 pb-3 gap-3">
              <div className={`text-2xl font-black font-mono ${isPaused ? 'text-yellow-400 animate-pulse' : 'text-white'}`}>
                {displayTime}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-[9px] uppercase tracking-widest text-yellow-500 font-black">{displayLabel}</div>
                {/* Recovery ring — visible only during active recovery */}
                <AnimatePresence>
                  {hasRecovery && plannedRestSec > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={{ duration: 0.2 }}
                    >
                      {(() => {
                        const size = 38;
                        const stroke = 3.5;
                        const radius = (size - stroke) / 2;
                        const circumference = 2 * Math.PI * radius;
                        const offset = circumference - (recoveryRingPct / 100) * circumference;
                        return (
                          <div className="relative" style={{ width: size, height: size }}>
                            <svg width={size} height={size} className="rotate-[-90deg]">
                              <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
                              <circle
                                cx={size / 2} cy={size / 2} r={radius} fill="none"
                                stroke={recoveryRingColor}
                                strokeWidth={stroke}
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={offset}
                                style={{
                                  transition: 'stroke-dashoffset 0.9s linear, stroke 0.5s',
                                  filter: `drop-shadow(0 0 4px ${recoveryRingColor}90)`,
                                }}
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black tabular-nums" style={{ color: recoveryRingColor }}>
                              {recoverySeconds}
                            </span>
                          </div>
                        );
                      })()}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Pause / Resume button — only for team sessions */}
            {inTeamSession && (
              <div className="border-t border-neutral-800 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => isPaused ? teamCtx.resumeSession() : teamCtx.pauseSession()}
                  className={[
                    'w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all active:scale-95',
                    isPaused
                      ? 'bg-yellow-500 text-black hover:bg-yellow-400'
                      : 'bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 hover:border-yellow-500/40',
                  ].join(' ')}
                >
                  {isPaused
                    ? <><Play size={12} /> Retomar</>
                    : <><Pause size={12} /> Pausar treino</>
                  }
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom bar — Cancelar / Finalizar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur border-t border-neutral-800 px-4 md:px-6 py-3 pb-safe">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={async () => {
              const ok = await confirm('Cancelar treino em andamento? (não salva no histórico)', 'Cancelar');
              if (!ok) return;
              try {
                if (typeof onFinish === 'function') onFinish(null, false);
              } catch { }
            }}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-neutral-900 border border-neutral-700/50 text-neutral-500 hover:text-red-400 hover:border-red-500/30 active:scale-95 transition-all"
            title="Cancelar treino"
          >
            <X size={18} />
          </button>

          {/* Finalizar — with glow celebration ring when allDone */}
          <div className="relative">
            {allDone && !finishing && (
              <motion.div
                className="absolute inset-0 rounded-xl pointer-events-none"
                animate={{
                  boxShadow: [
                    '0 0 0px 0px rgba(251,191,36,0)',
                    '0 0 16px 4px rgba(251,191,36,0.6)',
                    '0 0 0px 0px rgba(251,191,36,0)',
                  ],
                }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            <button
              type="button"
              disabled={finishing}
              onClick={finishWorkout}
              className={[
                'inline-flex items-center gap-2 px-5 py-3 rounded-xl font-black text-black text-sm transition-all duration-300',
                finishing
                  ? 'bg-yellow-500/60 cursor-wait'
                  : allDone
                    ? 'bg-gradient-to-r from-yellow-400 to-amber-400 shadow-lg shadow-yellow-500/40'
                    : 'bg-gradient-to-r from-yellow-500 to-amber-400 shadow-md shadow-yellow-900/30 hover:shadow-yellow-500/40 hover:from-yellow-400 hover:to-amber-300',
              ].join(' ')}
            >
              <Save size={16} />
              {allDone && !finishing && <Zap size={14} className="text-yellow-300" />}
              <span>{finishing ? 'Salvando...' : allDone ? 'FINALIZAR' : remainingSets <= 3 && remainingSets > 0 ? `Finalizar (${remainingSets})` : 'Finalizar'}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
