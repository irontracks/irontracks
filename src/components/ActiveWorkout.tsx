"use client";

import React, { useRef, useEffect } from 'react';
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

const TeamProgressPanel = dynamic(
  () => import('@/components/TeamProgressPanel').then(m => ({ default: m.TeamProgressPanel })),
  { ssr: false }
);
const TeamChatDrawer = dynamic(
  () => import('@/components/TeamChatDrawer').then(m => ({ default: m.TeamChatDrawer })),
  { ssr: false }
);

export default function ActiveWorkout(props: ActiveWorkoutProps) {
  const controller = useActiveWorkoutController(props);
  const { session, workout, exercises } = controller;

  // Team context for chat, pause banner, and workout edit sync
  const teamCtx = useTeamWorkout() as unknown as {
    teamSession: { id: string } | null
    sessionPaused: boolean
    pauseSession: () => void
    resumeSession: () => void
    chatMessages: unknown[]
    sendChatMessage: (text: string) => void
    broadcastWorkoutEdit: (workout: Record<string, unknown>) => void
    pendingWorkoutEdit: WorkoutEditPayload | null
    dismissWorkoutEdit: () => void
  }

  const inTeamSession = !!teamCtx.teamSession?.id

  // ── Broadcast workout edits to teammates ──────────────────────────────────
  const isFirstMountRef = useRef(true)
  const prevWorkoutStringRef = useRef<string>('')
  const isApplyingRemoteEditRef = useRef(false)

  useEffect(() => {
    if (!inTeamSession || !workout) return
    const currentStr = JSON.stringify(workout)
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false
      prevWorkoutStringRef.current = currentStr
      return
    }
    if (currentStr === prevWorkoutStringRef.current) return
    prevWorkoutStringRef.current = currentStr
    // Skip broadcast when the change came from accepting a teammate's edit
    if (isApplyingRemoteEditRef.current) {
      isApplyingRemoteEditRef.current = false
      return
    }
    try {
      teamCtx.broadcastWorkoutEdit(workout as unknown as Record<string, unknown>)
    } catch { }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout, inTeamSession])

  // ── Accept incoming workout edit ──────────────────────────────────────────
  const handleAcceptEdit = () => {
    const edit = teamCtx.pendingWorkoutEdit
    if (!edit?.workout) { teamCtx.dismissWorkoutEdit(); return }
    try {
      if (typeof props.onPersistWorkoutTemplate === 'function') {
        // Flag to skip re-broadcasting this incoming change
        isApplyingRemoteEditRef.current = true
        props.onPersistWorkoutTemplate(edit.workout as unknown as import('./workout/types').WorkoutDraft)
      }
    } catch {
      isApplyingRemoteEditRef.current = false
    }
    teamCtx.dismissWorkoutEdit()
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

        {/* Workout edit banner — shown when a teammate edits the workout */}
        {inTeamSession && teamCtx.pendingWorkoutEdit && (
          <div className="border-b border-blue-500/40 bg-blue-900/30 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-widest text-blue-400 mb-0.5">✏️ Treino editado</div>
              <div className="text-xs text-blue-200 truncate">
                <span className="font-bold">{teamCtx.pendingWorkoutEdit.fromName}</span> modificou o treino. Aceitar as alterações?
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleAcceptEdit}
                className="text-[11px] font-black bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Aceitar
              </button>
              <button
                onClick={() => teamCtx.dismissWorkoutEdit()}
                className="text-[11px] font-black bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-3 py-1.5 rounded-lg transition-colors"
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

