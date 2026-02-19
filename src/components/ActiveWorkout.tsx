"use client";

import React from 'react';
import { BackButton } from '@/components/ui/BackButton';
import { ActiveWorkoutProvider } from './active-workout/ActiveWorkoutContext';
import { useActiveWorkoutController, ActiveWorkoutProps } from './active-workout/useActiveWorkoutController';
import { Header } from './active-workout/Header';
import { ExerciseList } from './active-workout/ExerciseList';
import { Modals } from './active-workout/Modals';
import { UnknownRecord } from './active-workout/types';
import { z } from 'zod';

const UnknownRecordSchema: z.ZodType<UnknownRecord> = z.record(z.unknown());

export default function ActiveWorkout(props: ActiveWorkoutProps) {
  const controller = useActiveWorkoutController(props);
  const { 
    session, workout, 
    ticker, exercises, 
    collapsed, toggleCollapse,
    addExtraSetToExercise, 
    openOrganizeModal, 
    finishWorkout,
    openEditExercise,
    openDeloadModal,
    finishing,
    setAddExerciseOpen,
    setInviteOpen
  } = controller;

  // Derive elapsedSeconds from session.startedAt and ticker
  const startedAtMs = session?.startedAt ? new Date(session.startedAt).getTime() : 0;
  const elapsedSeconds = startedAtMs > 0 ? Math.max(0, Math.floor((ticker - startedAtMs) / 1000)) : 0;

  if (!props.session || !workout) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white p-6">
        <div className="max-w-lg mx-auto rounded-xl bg-neutral-800 border border-neutral-700 p-6">
          <div className="text-sm text-neutral-300">Sessão inválida.</div>
          <div className="mt-4">
            <BackButton onClick={props?.onBack} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ActiveWorkoutProvider value={controller}>
      <div className="min-h-screen bg-neutral-900 text-white flex flex-col">
        <Header 
          title={String(workout?.title || 'Treino')}
          elapsedSeconds={elapsedSeconds}
          exercisesCount={exercises.length}
          onBack={props.onBack}
          onAddExercise={() => setAddExerciseOpen(true)}
          onOrganize={openOrganizeModal}
          onInvite={() => setInviteOpen(true)}
        />
        
        <ExerciseList 
          exercises={exercises}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          onAddSet={addExtraSetToExercise}
          onOpenEdit={openEditExercise}
          onOpenDeload={(ex, idx) => {
            const parsed = UnknownRecordSchema.safeParse(ex);
            if (!parsed.success) return;
            openDeloadModal(parsed.data, idx);
          }}
          onOpenVideo={(url) => {
             if (typeof window !== 'undefined' && url) {
                 window.open(url, '_blank', 'noopener,noreferrer');
             }
          }}
        />

        <div className="p-4 md:px-6 pb-safe safe-area-bottom mt-auto">
            <button
              onClick={finishWorkout}
              disabled={finishing}
              className="w-full py-4 rounded-xl bg-yellow-500 text-black font-black uppercase tracking-widest hover:bg-yellow-400 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-yellow-500/20"
            >
              {finishing ? 'Finalizando...' : 'Finalizar Treino'}
            </button>
        </div>

        <Modals />
      </div>
    </ActiveWorkoutProvider>
  );
}
