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
  const { exercises, session, logs } = useWorkoutContext();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const prevCompletedRef = React.useRef<Set<number>>(new Set());

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

  // Auto-scroll to next incomplete exercise when one finishes
  React.useEffect(() => {
    const completedNow = new Set<number>();
    exercises.forEach((ex, exIdx) => {
      const setsHeader = Math.max(0, parseInt(String(ex?.sets ?? '0'), 10) || 0);
      const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray((ex as Record<string, unknown>)?.set_details) ? (ex as Record<string, unknown>).set_details as unknown[] : [];
      const count = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
      if (count === 0) return;
      let done = 0;
      for (let i = 0; i < count; i++) {
        const log = (logs as Record<string, Record<string, unknown>>)[`${exIdx}-${i}`];
        if (log?.done) done++;
      }
      if (done >= count) completedNow.add(exIdx);
    });

    // Detect newly completed exercises
    const prev = prevCompletedRef.current;
    let newlyCompleted = -1;
    completedNow.forEach(idx => { if (!prev.has(idx)) newlyCompleted = idx; });
    prevCompletedRef.current = completedNow;

    if (newlyCompleted >= 0) {
      // Find next incomplete exercise after the completed one
      const nextIdx = exercises.findIndex((_, idx) => idx > newlyCompleted && !completedNow.has(idx));
      if (nextIdx >= 0) {
        requestAnimationFrame(() => {
          try {
            const el = document.querySelector(`[data-exercise-idx="${nextIdx}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch { }
        });
      }
    }
  }, [exercises, logs]);

  const exerciseList = Array.isArray(exercises) ? exercises as Array<{ name?: string }> : [];

  return (
    <div ref={containerRef} className="flex-1 w-full max-w-6xl mx-auto py-4 space-y-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 160px)' }}>
      {/* Team progress panel — inline accordion, scrolls with content (no floating overlay) */}
      <TeamProgressPanel exercises={exerciseList} />

      <div className="px-4 md:px-6 space-y-4">
        {exerciseList.length === 0 ? (
          <div className="rounded-xl bg-neutral-800 border border-neutral-700 p-6 text-neutral-300">Sem exercícios neste treino.</div>
        ) : (
          exerciseList.map((_ex, exIdx) => <ExerciseCard key={String(exercises[exIdx]?.id ?? exercises[exIdx]?.name ?? exIdx)} ex={exercises[exIdx]} exIdx={exIdx} />)
        )}
      </div>
    </div>
  );
}
