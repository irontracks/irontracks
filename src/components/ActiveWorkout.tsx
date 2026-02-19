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

export default function ActiveWorkout(props: ActiveWorkoutProps) {
  const controller = useActiveWorkoutController(props);
  const { session, workout } = controller;

  if (!session || !workout) {
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
    <WorkoutProvider value={controller}>
      <div className="min-h-screen bg-neutral-900 text-white flex flex-col">
        <WorkoutHeader />
        <ExerciseList />
        <WorkoutFooter />
        <Modals />
      </div>
    </WorkoutProvider>
  );
}
