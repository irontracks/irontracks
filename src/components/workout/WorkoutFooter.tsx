'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, X, Pause, Play, Zap } from 'lucide-react';
import { useWorkoutContext } from './WorkoutContext';
import { useWorkoutTimer } from './WorkoutTimerContext';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';

export default function WorkoutFooter() {
  const {
    session,
    currentExercise,
    finishing,
    finishWorkout,
    confirm,
    cancelWorkout,
    completedSets,
    totalSets,
    remainingSets,
  } = useWorkoutContext();

  // Separate guards for Cancel and Finalizar — shared ref would make one block the other
  const cancelBusyRef = React.useRef(false);
  const finishBusyRef = React.useRef(false);

  const { ticker, elapsedSeconds, formatElapsed } = useWorkoutTimer();

  // Team pause/resume — gracefully degrades if no team session
  const teamCtx = useTeamWorkout() as unknown as {
    teamSession: { id: string } | null
    sessionPaused: boolean
    pauseSession: () => void
    resumeSession: () => void
  }
  const inTeamSession = !!teamCtx?.teamSession?.id
  const isPaused = inTeamSession && !!teamCtx?.sessionPaused

  const allSets = totalSets;
  const allDone = allSets > 0 && completedSets >= allSets;

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
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur border-t border-neutral-800 px-4 md:px-6 py-3 pb-safe">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
        {/* Cancel button — uses cancelWorkout (bypasses triggerExit) */}
        <button
          type="button"
          onClick={async () => {
            if (cancelBusyRef.current) return;
            cancelBusyRef.current = true;
            try {
              const ok = await confirm('Cancelar treino em andamento? (não salva no histórico)', 'Cancelar');
              if (!ok) { cancelBusyRef.current = false; return; }
              // cancelWorkout bypasses the exit animation guard (exitTimerRef)
              // which can be permanently blocked after a failed Finalizar attempt.
              if (typeof cancelWorkout === 'function') {
                cancelWorkout();
              } else {
                console.error('[WorkoutFooter] cancelWorkout is not available');
              }
            } catch (e) {
              console.error('[WorkoutFooter] cancel failed:', e);
            } finally {
              // Always reset after a delay so the user can retry if navigation fails
              setTimeout(() => { cancelBusyRef.current = false; }, 1500);
            }
          }}
          className="w-11 h-11 flex items-center justify-center rounded-xl bg-neutral-900 border border-neutral-700/50 text-neutral-500 hover:text-red-400 hover:border-red-500/30 active:scale-95 transition-all shrink-0"
          title="Cancelar treino"
        >
          <X size={18} />
        </button>

        {/* ── Timer display — center ── */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Recovery ring — visible during active recovery */}
          <AnimatePresence>
            {hasRecovery && plannedRestSec > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.2 }}
                className="shrink-0"
              >
                {(() => {
                  const size = 36;
                  const stroke = 3;
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
                            filter: `drop-shadow(0 0 3px ${recoveryRingColor}90)`,
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

          {/* Time + label */}
          <div className="flex flex-col items-center min-w-0">
            <span className="text-[9px] uppercase tracking-widest text-yellow-500 font-black leading-tight">
              {isPaused ? 'Pausado' : displayLabel}
            </span>
            <span className={`text-lg font-black font-mono leading-tight ${isPaused ? 'text-yellow-400 animate-pulse' : 'text-white'}`}>
              {displayTime}
            </span>
          </div>

          {/* Team pause/resume — only for team sessions */}
          {inTeamSession && (
            <button
              type="button"
              onClick={() => isPaused ? teamCtx.resumeSession() : teamCtx.pauseSession()}
              className={[
                'w-8 h-8 flex items-center justify-center rounded-lg shrink-0 transition-all active:scale-90',
                isPaused
                  ? 'bg-yellow-500 text-black'
                  : 'bg-neutral-800 border border-neutral-700 text-neutral-300',
              ].join(' ')}
            >
              {isPaused ? <Play size={12} /> : <Pause size={12} />}
            </button>
          )}
        </div>

        {/* Finalizar — with glow celebration ring when allDone */}
        <div className="relative shrink-0">
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
            onClick={() => {
              if (finishBusyRef.current) return;
              finishBusyRef.current = true;
              setTimeout(() => { finishBusyRef.current = false; }, 1000);
              finishWorkout();
            }}
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
  );
}
