'use client';

import React from 'react';
import { ChevronDown, ChevronUp, Clock, Save, X } from 'lucide-react';
import { useWorkoutContext } from './WorkoutContext';

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
  } = useWorkoutContext();

  const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
  const toNum = (v: unknown) => {
    const n = Number(String(v ?? '').replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  const ui = isRecord(session?.ui) ? (session?.ui as Record<string, unknown>) : null
  const activeExec = ui && isRecord(ui.activeExecution) ? (ui.activeExecution as Record<string, unknown>) : null
  const startedAtMs = activeExec ? Number(activeExec.startedAtMs) : 0
  const isExecuting = Number.isFinite(startedAtMs) && startedAtMs > 0
  const timerTargetTime = toNum((session as unknown as Record<string, unknown>)?.timerTargetTime)
  const hasRecovery = Number.isFinite(timerTargetTime) && timerTargetTime > 0
  const recoveryRemaining = hasRecovery ? Math.ceil((timerTargetTime - ticker) / 1000) : 0
  const recoverySeconds = hasRecovery ? Math.max(0, recoveryRemaining) : 0
  const recoveryExtraSeconds = hasRecovery ? Math.max(0, -recoveryRemaining) : 0
  const displaySeconds = hasRecovery ? recoverySeconds : isExecuting ? Math.max(0, Math.floor((ticker - startedAtMs) / 1000)) : elapsedSeconds
  const displayLabel = hasRecovery ? 'Recuperação' : isExecuting ? 'Exercício' : 'Treino'
  const plannedRestSec = toNum(
    currentExercise?.restTime ?? (currentExercise as unknown as Record<string, unknown>)?.rest_time ?? (currentExercise as unknown as Record<string, unknown>)?.rest ?? currentExercise?.rest_time
  )
  const displayTime = `${formatElapsed(displaySeconds)}${recoveryExtraSeconds > 0 ? ` (+${formatElapsed(recoveryExtraSeconds)})` : ''}`

  return (
    <>
      <div className="fixed right-3 bottom-24 sm:bottom-5 z-[60]">
        {timerMinimized ? (
          <button
            type="button"
            onClick={() => setTimerMinimized(false)}
            className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900/95 border border-neutral-700 px-2.5 py-1.5 text-neutral-200 shadow-xl hover:bg-neutral-800"
          >
            <Clock size={14} className="text-yellow-500" />
            <span className="text-[11px] font-black">Tempo</span>
            <span className="text-xs font-mono text-yellow-500">{displayTime}</span>
            <ChevronUp size={14} className="text-neutral-400" />
          </button>
        ) : (
          <div className="w-[200px] rounded-2xl bg-neutral-900/95 border border-neutral-700 p-2.5 shadow-2xl">
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold">Timer</div>
                <div className="text-xs font-black text-white truncate">{currentExercise?.name || 'Treino ativo'}</div>
                <div className="text-[10px] text-neutral-500">Descanso (plan): {plannedRestSec > 0 ? `${Math.round(plannedRestSec)}s` : '—'}</div>
              </div>
              <button
                type="button"
                onClick={() => setTimerMinimized(true)}
                className="h-7 w-7 inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700"
                aria-label="Minimizar timer"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <div className="text-lg font-black text-white font-mono">{displayTime}</div>
              <div className="text-[9px] uppercase tracking-widest text-yellow-500 font-black">{displayLabel}</div>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur border-t border-neutral-800 px-4 md:px-6 py-3 pb-safe">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={async () => {
              const ok = await confirm('Cancelar treino em andamento? (não salva no histórico)', 'Cancelar');
              if (!ok) return;
              try {
                if (typeof onFinish === 'function') onFinish(null, false);
              } catch {}
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
            className={
              finishing
                ? 'inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-yellow-500/70 text-black font-black cursor-wait'
                : 'inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400'
            }
          >
            <Save size={16} />
            <span className="text-sm">Finalizar</span>
          </button>
        </div>
      </div>
    </>
  );
}
