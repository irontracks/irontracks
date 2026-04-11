'use client';

import React from 'react';
import { Clock, GripVertical, MoreHorizontal, Plus, UserPlus } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import InviteManager from '@/components/InviteManager';
import { useWorkoutContext } from './WorkoutContext';
import { useWorkoutTimer } from './WorkoutTimerContext';
import HeartRateMonitor from './HeartRateMonitor';

export default function WorkoutHeader() {
  const {
    workout,
    exercises,
    inviteOpen,
    setInviteOpen,
    setAddExerciseOpen,
    openOrganizeModal,
    sendInvite,
    alert,
    completedSets,
    totalSets,
    progressPct,
    session,
    _exitOnBack: exitOnBack,
  } = useWorkoutContext();
  const { ticker, elapsedSeconds, formatElapsed } = useWorkoutTimer();

  // Detect if a set is actively being executed — collapse action buttons to reduce distraction
  const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  const ui = isRecord(session?.ui) ? (session?.ui as Record<string, unknown>) : null;
  const activeExec = ui && isRecord(ui.activeExecution) ? (ui.activeExecution as Record<string, unknown>) : null;
  const startedAtMs = activeExec ? Number(activeExec.startedAtMs) : 0;
  const isExecuting = Number.isFinite(startedAtMs) && startedAtMs > 0 && ticker > startedAtMs;

  const [overflowOpen, setOverflowOpen] = React.useState(false);
  const overflowRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

  return (
    <>
      <div
        className="bg-neutral-950 border-b border-neutral-800 px-4 md:px-6 pb-1 flex-shrink-0 relative"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0px)' }}
      >
        {/* Fills status bar area with same color — no transparent strip */}
        <div
          className="absolute left-0 right-0 top-0 bg-neutral-950"
          style={{ height: 'env(safe-area-inset-top)' }}
        />
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BackButton onClick={exitOnBack} />

            {/* Action buttons — hidden during active set execution to reduce distraction */}
            <div
              className={`flex items-center gap-2 transition-opacity duration-200 ${isExecuting ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            >
              <button
                type="button"
                onClick={() => setAddExerciseOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-yellow-500 text-black hover:bg-yellow-400 transition-colors active:scale-95 whitespace-nowrap"
                title="Adicionar exercício extra"
              >
                <Plus size={16} />
                <span className="text-sm font-black hidden sm:inline">Exercício</span>
              </button>

              {/* Overflow menu */}
              <div className="relative" ref={overflowRef}>
                <button
                  type="button"
                  onClick={() => setOverflowOpen(v => !v)}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-yellow-400 hover:border-yellow-500/30 hover:bg-neutral-800 transition-colors active:scale-95"
                  title="Mais opções"
                >
                  <MoreHorizontal size={16} />
                </button>

                {overflowOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-48 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl z-10 overflow-hidden animate-dropdown-in">
                    <button
                      type="button"
                      onClick={() => { openOrganizeModal(); setOverflowOpen(false); }}
                      disabled={exercises.length < 2}
                      className={[
                        'w-full flex items-center gap-3 px-4 py-3 text-sm font-black text-left transition-colors',
                        exercises.length < 2
                          ? 'text-neutral-700 cursor-not-allowed'
                          : 'text-yellow-400 hover:bg-neutral-800',
                      ].join(' ')}
                    >
                      <GripVertical size={15} />
                      Organizar
                    </button>
                    <div className="h-px bg-neutral-800" />
                    <button
                      type="button"
                      onClick={() => { setInviteOpen(true); setOverflowOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-black text-left text-yellow-400 hover:bg-neutral-800 transition-colors"
                    >
                      <UserPlus size={15} />
                      Convidar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-end gap-2">
              <div className="font-black text-white truncate">{String(workout?.title || 'Treino')}</div>
              <HeartRateMonitor />
            </div>
            <div className="text-xs text-neutral-400 flex items-center justify-end gap-2 mt-0.5">
              {/* Progress Ring SVG */}
              {totalSets > 0 && (() => {
                const size = 32;
                const stroke = 3.5;
                const radius = (size - stroke) / 2;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (progressPct / 100) * circumference;
                const ringColor = progressPct >= 90 ? '#10b981' : progressPct >= 50 ? '#f59e0b' : '#d97706';
                return (
                  <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
                    <svg width={size} height={size} className="rotate-[-90deg]">
                      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
                      <circle
                        cx={size / 2} cy={size / 2} r={radius} fill="none"
                        stroke={ringColor}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        style={{
                          transition: 'stroke-dashoffset 0.5s ease-out, stroke 0.3s',
                          filter: progressPct >= 80 ? `drop-shadow(0 0 4px ${ringColor}80)` : 'none',
                        }}
                      />
                    </svg>
                  </div>
                );
              })()}
              {totalSets > 0 && (
                <span className="font-mono text-neutral-500">
                  {completedSets}/{totalSets}
                </span>
              )}
              <Clock size={14} className="text-yellow-500" />
              <span className="font-mono text-yellow-500">{formatElapsed(elapsedSeconds)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar — premium animated gradient */}
      {totalSets > 0 && (
        <div className="h-[3px] bg-neutral-800 w-full relative overflow-hidden">
          <div
            className="h-full transition-all duration-500 ease-out relative"
            style={{
              width: `${progressPct}%`,
              background: progressPct >= 90
                ? 'linear-gradient(90deg, #d97706, #f59e0b, #10b981, #34d399)'
                : progressPct >= 50
                  ? 'linear-gradient(90deg, #92400e, #d97706, #f59e0b, #fbbf24)'
                  : 'linear-gradient(90deg, #78350f, #b45309, #d97706, #f59e0b)',
              boxShadow: progressPct >= 80 ? '0 0 12px rgba(251,191,36,0.5)' : 'none',
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" style={{ animation: 'shimmer 2s ease-in-out infinite' }} />
          </div>
          {progressPct >= 100 && (
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.4), transparent)',
              animation: 'shimmer 1.5s ease-in-out infinite',
            }} />
          )}
        </div>
      )}

      <InviteManager
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={async (targetUser: unknown) => {
          try {
            const payloadWorkout = workout && typeof workout === 'object'
              ? { ...workout, exercises: Array.isArray(workout?.exercises) ? workout.exercises : [] }
              : { title: 'Treino', exercises: [] };
            await sendInvite(targetUser, payloadWorkout);
          } catch (e: unknown) {
            const msg = isRecord(e) && typeof e.message === 'string' ? e.message : String(e || '');
            await alert('Falha ao enviar convite: ' + msg);
          }
        }}
      />
    </>
  );
}
