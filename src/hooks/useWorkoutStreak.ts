'use client';

import { useState, useEffect } from 'react';
import { computeWorkoutStreakAndStats } from '@/actions/workout-actions';
import type { WorkoutStreak } from '@/types/app';
import { logError } from '@/lib/logger';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export function useWorkoutStreak(userId?: string | null) {
  const [streakStats, setStreakStats] = useState<WorkoutStreak | null>(null);

  useEffect(() => {
    if (!userId) return;

    computeWorkoutStreakAndStats()
      .then((res) => {
        if (!res?.ok || !res?.data) return;
        const d = isRecord(res.data) ? (res.data as Record<string, unknown>) : {};

        const badgesRaw = Array.isArray(d.badges) ? d.badges : [];
        const badges = badgesRaw
          .filter(isRecord)
          .map((b) => ({
            id: String(b.id ?? ''),
            label: String(b.label ?? ''),
            kind: String(b.kind ?? ''),
          }))
          .filter((b) => !!b.id);

        const streak: WorkoutStreak = {
          currentStreak: Number(d.currentStreak ?? d.current_streak ?? 0) || 0,
          bestStreak:
            Number(
              d.bestStreak ?? d.best_streak ?? d.longestStreak ?? d.longest_streak ?? 0
            ) || 0,
          totalWorkouts: Number(d.totalWorkouts ?? d.total_workouts ?? 0) || 0,
          totalVolumeKg: Number(d.totalVolumeKg ?? d.total_volume_kg ?? 0) || 0,
          badges,
          lastWorkoutDate:
            d.lastWorkoutDate != null ? String(d.lastWorkoutDate) : null,
          longestStreak:
            d.longestStreak != null ? Number(d.longestStreak) : undefined,
        };

        setStreakStats(streak);
      })
      .catch((err) => logError('useWorkoutStreak', err));
  }, [userId]);

  return { streakStats, setStreakStats };
}
