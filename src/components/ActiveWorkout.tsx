"use client";

import React from 'react';
import { BackButton } from '@/components/ui/BackButton';
import { useActiveWorkoutController } from './workout/useActiveWorkoutController';
import { WorkoutProvider } from './workout/WorkoutContext';
import WorkoutHeader from './workout/WorkoutHeader';
import ExerciseList from './workout/ExerciseList';
import WorkoutFooter from './workout/WorkoutFooter';
import Modals from './workout/Modals';
import { ActiveWorkoutProps } from './workout/types';
import dynamic from 'next/dynamic';
const CardioGPSPanel = dynamic(() => import('@/components/workout/CardioGPSPanel'), { ssr: false });
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';

const TeamChatDrawer = dynamic(
  () => import('@/components/TeamChatDrawer').then(m => ({ default: m.TeamChatDrawer })),
  { ssr: false }
);

export default function ActiveWorkout(props: ActiveWorkoutProps) {
  const controller = useActiveWorkoutController(props);
  const { session, workout, exercises } = controller;

  // Team context for chat, pause banner and workout edit sync
  const teamCtx = useTeamWorkout() as unknown as {
    teamSession: { id: string } | null
    sessionPaused: boolean
    pauseSession: () => void
    resumeSession: () => void
    chatMessages: unknown[]
    sendChatMessage: (text: string) => void
    pendingWorkoutEdit: { id: string; fromName: string; workout: Record<string, unknown> } | null
    dismissWorkoutEdit: () => void
  }

  // Accept incoming workout edit from a teammate.
  // Instead of replacing the entire workout (which erases B's exercises),
  // we do a smart merge: keep all of B's current exercises and append
  // any NEW exercises from A that don't already exist in B's list.
  const handleAcceptWorkoutEdit = React.useCallback(() => {
    const edit = teamCtx.pendingWorkoutEdit
    if (!edit?.workout || !props.onUpdateSession) return
    try {
      const incomingExercises: Array<Record<string, unknown>> = Array.isArray(
        (edit.workout as Record<string, unknown>).exercises
      )
        ? (edit.workout as Record<string, unknown>).exercises as Array<Record<string, unknown>>
        : []

      // Current exercises of this user (B)
      const currentWorkout = props.session?.workout as Record<string, unknown> | null | undefined
      const currentExercises: Array<Record<string, unknown>> = Array.isArray(
        (currentWorkout as Record<string, unknown> | null)?.exercises
      )
        ? (currentWorkout as Record<string, unknown>).exercises as Array<Record<string, unknown>>
        : []

      const normalise = (s: unknown) => String(s ?? '').toLowerCase().trim()
      const existingNames = new Set(currentExercises.map(ex => normalise(ex.name)))

      // Only add exercises that B doesn't already have
      const newExercises = incomingExercises.filter(
        ex => !existingNames.has(normalise(ex.name))
      )

      if (newExercises.length === 0) {
        // No new exercises — nothing to merge; just dismiss
        teamCtx.dismissWorkoutEdit()
        return
      }

      // Merge: B's exercises first, then new ones from A
      const mergedWorkout = {
        ...(currentWorkout ?? {}),
        exercises: [...currentExercises, ...newExercises],
      }

      props.onUpdateSession({ workout: mergedWorkout })
    } catch { }
    teamCtx.dismissWorkoutEdit()
  }, [teamCtx, props])


  if (!session || !workout) {
    return (
      <div aria-live="polite" className="min-h-screen bg-neutral-900 text-white p-6">
        <div className="max-w-lg mx-auto rounded-xl bg-neutral-800 border border-neutral-700 p-6">
          <div className="text-sm text-neutral-300">Sessão inválida.</div>
          <div className="mt-4">
            <BackButton onClick={props?.onBack} />
          </div>
        </div>
      </div>
    );
  }

  const panelExercises = Array.isArray(exercises) ? exercises as Array<{ name?: string }> : [];
  void panelExercises;
  const inTeamSession = !!teamCtx.teamSession?.id;
  const pendingEdit = teamCtx.pendingWorkoutEdit;

  return (
    <WorkoutProvider value={controller}>
      <div className="fixed inset-0 z-[50] overflow-y-auto bg-neutral-900 text-white flex flex-col">
        <WorkoutHeader />

        {/* Pause banner — shown when a partner paused the session */}
        {inTeamSession && teamCtx.sessionPaused && (
          <div className="bg-yellow-500/15 border-b border-yellow-500/30 px-4 py-2 flex items-center justify-between text-sm">
            <span className="text-yellow-300 font-bold">⏸ Parceiro pausou o treino</span>
            <button
              onClick={() => teamCtx.resumeSession()}
              className="text-[11px] font-black bg-yellow-500 text-black px-3 py-1 rounded-lg hover:bg-yellow-400 transition-colors"
            >
              Retomar
            </button>
          </div>
        )}

        {/* Workout edit sync banner — shown when a teammate edited the workout */}
        {inTeamSession && pendingEdit && (
          <div className="bg-blue-500/15 border-b border-blue-500/30 px-4 py-2.5 flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg">✏️</span>
              <span className="text-blue-200 font-semibold truncate">
                <strong className="text-blue-100">{pendingEdit.fromName}</strong> editou o treino
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={handleAcceptWorkoutEdit}
                className="text-[11px] font-black bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-400 transition-colors"
              >
                Aceitar
              </button>
              <button
                onClick={() => teamCtx.dismissWorkoutEdit()}
                className="text-[11px] font-black bg-neutral-700 text-neutral-300 px-3 py-1.5 rounded-lg hover:bg-neutral-600 transition-colors"
              >
                Ignorar
              </button>
            </div>
          </div>
        )}

        {/* GPS Cardio Tracking Panel */}
        <CardioGPSPanel workoutId={props.session?.workout?.id} />
        <ExerciseList />
        <WorkoutFooter />
        <Modals />

        {inTeamSession && (
          <TeamChatDrawer
            myUserId={String(props.settings?.userId ?? props.session?.userId ?? '')}
            myDisplayName={String(props.settings?.displayName ?? '')}
            myPhotoURL={null}
          />
        )}
      </div>
    </WorkoutProvider>
  );
}
