'use client';

import React from 'react';
import { useWorkoutContext } from './WorkoutContext';
import ExerciseCard from './ExerciseCard';

export default function ExerciseList() {
  const { exercises, session } = useWorkoutContext();
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const scrollToTop = () => {
      try {
        if (containerRef.current) {
          containerRef.current.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }
      } catch {}
    };
    const raf = requestAnimationFrame(scrollToTop);
    return () => cancelAnimationFrame(raf);
  }, [session?.id, exercises.length]);

  return (
    <div ref={containerRef} className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-4 pb-28 space-y-4">
      {exercises.length === 0 ? (
        <div className="rounded-xl bg-neutral-800 border border-neutral-700 p-6 text-neutral-300">Sem exercícios neste treino.</div>
      ) : (
        exercises.map((ex, exIdx) => <ExerciseCard key={`ex-${exIdx}`} ex={ex} exIdx={exIdx} />)
      )}
    </div>
  );
}
