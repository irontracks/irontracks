'use client';

import React from 'react';
import { ArrowDown, Clock, GripVertical, Plus, UserPlus, X } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import InviteManager from '@/components/InviteManager';
import { useWorkoutContext } from './WorkoutContext';

export default function WorkoutHeader() {
  const {
    session,
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
  } = useWorkoutContext();

  // Helper function extracted from ActiveWorkout_OLD
  const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

  return (
    <>
      <div className="sticky top-0 z-40 bg-neutral-950 border-b border-neutral-800 px-4 md:px-6 py-4 pt-safe">
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
              <Clock size={14} className="text-yellow-500" />
              <span className="font-mono text-yellow-500">{formatElapsed(elapsedSeconds)}</span>
            </div>
          </div>
        </div>
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
