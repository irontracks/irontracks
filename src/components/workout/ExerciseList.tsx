'use client';

import React from 'react';
import { useWorkoutContext } from './WorkoutContext';
import ExerciseCard from './ExerciseCard';

export default function ExerciseList() {
  const { exercises } = useWorkoutContext();

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-4 pb-28 space-y-4">
      {exercises.length === 0 ? (
        <div className="rounded-xl bg-neutral-800 border border-neutral-700 p-6 text-neutral-300">Sem exercícios neste treino.</div>
      ) : (
        exercises.map((ex, exIdx) => <ExerciseCard key={`ex-${exIdx}`} ex={ex} exIdx={exIdx} />)
      )}
    </div>
  );
}
