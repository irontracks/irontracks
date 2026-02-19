'use client';

import React from 'react';
import { ChevronDown, ChevronUp, Clock, Save, X } from 'lucide-react';
import { useWorkoutContext } from './WorkoutContext';

export default function WorkoutFooter() {
  const {
    currentExercise,
    elapsedSeconds,
    formatElapsed,
    timerMinimized,
    setTimerMinimized,
    finishing,
    finishWorkout,
    confirm,
    onFinish,
  } = useWorkoutContext();

  return (
    <>
      <div className="fixed right-4 bottom-24 sm:bottom-6 z-[60]">
        {timerMinimized ? (
          <button
            type="button"
            onClick={() => setTimerMinimized(false)}
            className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900/95 border border-neutral-700 px-3 py-2 text-neutral-200 shadow-xl hover:bg-neutral-800"
          >
            <Clock size={16} className="text-yellow-500" />
            <span className="text-xs font-black">Tempo</span>
            <span className="text-sm font-mono text-yellow-500">{formatElapsed(elapsedSeconds)}</span>
            <ChevronUp size={16} className="text-neutral-400" />
          </button>
        ) : (
          <div className="w-[240px] rounded-2xl bg-neutral-900/95 border border-neutral-700 p-3 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Timer</div>
                <div className="text-sm font-black text-white truncate">{currentExercise?.name || 'Treino ativo'}</div>
                <div className="text-[11px] text-neutral-500">Descanso: {currentExercise?.rest ? `${currentExercise.rest}s` : '-'}</div>
              </div>
              <button
                type="button"
                onClick={() => setTimerMinimized(true)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700"
                aria-label="Minimizar timer"
              >
                <ChevronDown size={16} />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-2xl font-black text-white font-mono">{formatElapsed(elapsedSeconds)}</div>
              <div className="text-[10px] uppercase tracking-widest text-yellow-500 font-black">Sessão</div>
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
