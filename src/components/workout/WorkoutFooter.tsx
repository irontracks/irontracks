'use client';

import React from 'react';
import { ChevronUp, Clock, Save, X, Pause, Play } from 'lucide-react';
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
    exercises,
    logs,
    completedSets,
    totalSets,
    remainingSets,
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

  return (
    <>
      {/* ── Timer card — bottom-left, tap header to collapse ── */}
      <div className="fixed left-3 pl-safe bottom-[88px] z-[60]">
        {timerMinimized ? (
          /* Minimized pill — tap anywhere to expand */
          <button
            type="button"
            onClick={() => setTimerMinimized(false)}
            className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900/95 border border-neutral-700 px-2.5 py-1.5 text-neutral-200 shadow-xl hover:bg-neutral-800 active:scale-95 transition-transform"
          >
            <Clock size={13} className={isPaused ? 'text-yellow-400 animate-pulse' : 'text-yellow-500'} />
            <span className="text-[11px] font-black">{isPaused ? '⏸ Pausado' : 'Tempo'}</span>
            <span className="text-xs font-mono text-yellow-500">{displayTime}</span>
            <ChevronUp size={13} className="text-neutral-500" />
          </button>
        ) : (
          /* Expanded card */
          <div className="w-[210px] rounded-2xl bg-neutral-900/98 border border-neutral-700 shadow-2xl overflow-hidden">
            {/* Header — tap to collapse */}
            <button
              type="button"
              onClick={() => setTimerMinimized(true)}
              className="w-full flex items-start justify-between gap-2 px-3 pt-2.5 pb-1 text-left"
            >
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold">Timer</div>
                <div className="text-xs font-black text-white truncate">{currentExercise?.name || 'Treino ativo'}</div>
                <div className="text-[10px] text-neutral-500">
                  {allSets > 0 ? `${doneSets}/${allSets} séries` : `Descanso: ${plannedRestSec > 0 ? `${Math.round(plannedRestSec)}s` : '—'}`}
                </div>
              </div>
              {/* Collapse hint */}
              <div className="w-5 h-5 mt-0.5 shrink-0 flex items-center justify-center rounded-lg bg-neutral-800 border border-neutral-700">
                <Clock size={10} className="text-neutral-400" />
              </div>
            </button>

            {/* Time display */}
            <div className="flex items-center justify-between px-3 pt-1 pb-2.5">
              <div className={`text-xl font-black font-mono ${isPaused ? 'text-yellow-400 animate-pulse' : 'text-white'}`}>
                {displayTime}
              </div>
              <div className="text-[9px] uppercase tracking-widest text-yellow-500 font-black">{displayLabel}</div>
            </div>

            {/* Pause / Resume button — only for team sessions */}
            {inTeamSession && (
              <div className="border-t border-neutral-800 px-2.5 py-2">
                <button
                  type="button"
                  onClick={() => isPaused ? teamCtx.resumeSession() : teamCtx.pauseSession()}
                  className={[
                    'w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95',
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
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
          >
            <X size={16} />
            <span className="text-sm">Cancelar</span>
          </button>

          <button
            type="button"
            disabled={finishing}
            onClick={finishWorkout}
            className={[
              'inline-flex items-center gap-2 px-5 py-3 rounded-xl font-black text-black text-sm transition-all duration-300',
              finishing
                ? 'bg-yellow-500/60 cursor-wait'
                : allDone
                  ? 'bg-gradient-to-r from-yellow-400 to-amber-400 shadow-lg shadow-yellow-500/40 animate-pulse'
                  : 'bg-gradient-to-r from-yellow-500 to-amber-400 shadow-md shadow-yellow-900/30 hover:shadow-yellow-500/40 hover:from-yellow-400 hover:to-amber-300',
            ].join(' ')}
          >
            <Save size={16} />
            <span>{finishing ? 'Salvando...' : allDone ? 'FINALIZAR ⚡' : remainingSets <= 3 && remainingSets > 0 ? `Finalizar (${remainingSets})` : 'Finalizar'}</span>
          </button>
        </div>
      </div>
    </>
  );
}
