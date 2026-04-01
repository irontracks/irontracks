'use client';

import React from 'react';
import { Clock, GripVertical, Plus, UserPlus } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import InviteManager from '@/components/InviteManager';
import { useWorkoutContext } from './WorkoutContext';
import HeartRateMonitor from './HeartRateMonitor';

export default function WorkoutHeader() {
  const {
    workout,
    exercises,
    elapsedSeconds,
    inviteOpen,
    setInviteOpen,
    setAddExerciseOpen,
    openOrganizeModal,
    formatElapsed,
    sendInvite,
    alert,
    completedSets,
    totalSets,
    progressPct,
  } = useWorkoutContext();

  // Helper function extracted from ActiveWorkout_OLD
  const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

  return (
    <>
      <div
        className="sticky top-0 z-40 bg-neutral-950 border-b border-neutral-800 px-4 md:px-6 pb-3"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BackButton />
            <button
              type="button"
              onClick={() => setAddExerciseOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black hover:bg-yellow-400 transition-colors active:scale-95"
              title="Adicionar exercício extra"
            >
              <Plus size={16} />
              <span className="text-sm font-black hidden sm:inline">Exercício</span>
            </button>
            <button
              type="button"
              onClick={openOrganizeModal}
              disabled={exercises.length < 2}
              className={
                exercises.length < 2
                  ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-700'
                  : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:text-yellow-400 hover:bg-neutral-800 transition-colors active:scale-95'
              }
              title="Organizar exercícios"
            >
              <GripVertical size={16} />
              <span className="text-sm font-black hidden sm:inline">Organizar</span>
            </button>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:text-yellow-400 hover:bg-neutral-800 transition-colors active:scale-95"
              title="Convidar para treinar junto"
            >
              <UserPlus size={16} />
              <span className="text-sm font-black hidden sm:inline">Convidar</span>
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-black text-white truncate text-right">{String(workout?.title || 'Treino')}</div>
            <div className="text-xs text-neutral-400 flex items-center justify-end gap-2 mt-1">
              {/* Progress Ring SVG */}
              {totalSets > 0 && (() => {
                const size = 28
                const stroke = 3
                const radius = (size - stroke) / 2
                const circumference = 2 * Math.PI * radius
                const offset = circumference - (progressPct / 100) * circumference
                const ringColor = progressPct >= 90 ? '#10b981' : progressPct >= 50 ? '#f59e0b' : '#d97706'
                return (
                  <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
                    {/* Track */}
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
                    {/* Center percentage */}
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black tabular-nums" style={{ color: ringColor }}>
                      {progressPct}
                    </span>
                  </div>
                )
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
            {/* Shimmer overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" style={{ animation: 'shimmer 2s ease-in-out infinite' }} />
          </div>
          {/* Completion pulse at 100% */}
          {progressPct >= 100 && (
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.4), transparent)',
              animation: 'shimmer 1.5s ease-in-out infinite',
            }} />
          )}
        </div>
      )}

      {/* Heart Rate from Apple Watch */}
      <div className="px-4 py-1">
        <HeartRateMonitor />
      </div>

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
            const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || '');
            await alert('Falha ao enviar convite: ' + msg);
          }
        }}
      />
    </>
  );
}
