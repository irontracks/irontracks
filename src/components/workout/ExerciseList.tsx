'use client';

import React from 'react';
import { useWorkoutContext } from './WorkoutContext';
import ExerciseCard from './ExerciseCard';
import dynamic from 'next/dynamic';

const TeamProgressPanel = dynamic(
  () => import('@/components/TeamProgressPanel').then(m => ({ default: m.TeamProgressPanel })),
  { ssr: false }
);

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
      } catch { }
    };
    const raf = requestAnimationFrame(scrollToTop);
    return () => cancelAnimationFrame(raf);
  }, [session?.id, exercises.length]);

  const exerciseList = Array.isArray(exercises) ? exercises as Array<{ name?: string }> : [];

  return (
    <div ref={containerRef} className="flex-1 w-full max-w-6xl mx-auto py-4 pb-36 space-y-4">
      {/* Team progress panel — inline accordion, scrolls with content (no floating overlay) */}
      <TeamProgressPanel exercises={exerciseList} />

      <div className="px-4 md:px-6 space-y-4">
        {exerciseList.length === 0 ? (
          <div className="rounded-xl bg-neutral-800 border border-neutral-700 p-6 text-neutral-300">Sem exercícios neste treino.</div>
        ) : (
          exerciseList.map((_ex, exIdx) => <ExerciseCard key={`ex-${exIdx}`} ex={exercises[exIdx]} exIdx={exIdx} />)
        )}
      </div>
    </div>
  );
}
