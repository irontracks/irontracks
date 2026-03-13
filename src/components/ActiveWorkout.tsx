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
import { buildFinishWorkoutPayload } from '@/lib/finishWorkoutPayload';
import dynamic from 'next/dynamic';
import { useTeamWorkout, WorkoutEditPayload } from '@/contexts/TeamWorkoutContext';

const TeamChatDrawer = dynamic(
  () => import('@/components/TeamChatDrawer').then(m => ({ default: m.TeamChatDrawer })),
  { ssr: false }
);

export default function ActiveWorkout(props: ActiveWorkoutProps) {
  const controller = useActiveWorkoutController(props);
  const { session, workout, exercises } = controller;

  // Team context for chat, pause banner, and workout edit notifications
  const teamCtx = useTeamWorkout() as unknown as {
    teamSession: { id: string } | null
    sessionPaused: boolean
    pauseSession: () => void
    resumeSession: () => void
    chatMessages: unknown[]
    sendChatMessage: (text: string) => void
    pendingWorkoutEdit: WorkoutEditPayload | null
    dismissWorkoutEdit: () => void
  }

  const finishPayload = React.useMemo(() => {
    if (!session || !workout) return null;
    try {
      return buildFinishWorkoutPayload({
        workout,
        elapsedSeconds: 0,
        logs: (session?.logs ?? {}) as Record<string, unknown>,
        ui: (session?.ui ?? {}) as Record<string, unknown>,
        postCheckin: null,
      });
    } catch {
      return null;
    }
  }, [session, workout]);
  void finishPayload;

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

        {/* Workout Edit banner — shown when a teammate edits the workout structure */}
        {inTeamSession && pendingEdit && (
          <div className="border-b border-blue-500/30 bg-blue-500/10 px-4 py-3 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <span className="text-blue-300 font-black">✏️ {pendingEdit.fromName}</span>
              <span className="text-blue-200 ml-1">editou o treino. Aceitar as mudanças?</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  try { props.onUpdateSession?.(pendingEdit.workout); } catch { }
                  teamCtx.dismissWorkoutEdit();
                }}
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
