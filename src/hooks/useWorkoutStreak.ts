/**
 * @module useWorkoutStreak
 *
 * Computes and caches the user's current workout streak (consecutive
 * days with at least one completed session) and summary stats (total
 * sessions, longest streak, weekly average). Displayed on the dashboard
 * motivation widget and profile page.
 *
 * @param userId - Current user ID
 * @returns `{ streak, stats, loading }`
 */
'use client';

import { useState, useEffect } from 'react';
import { computeWorkoutStreakAndStats } from '@/actions/workout-actions';
import type { WorkoutStreak } from '@/types/app';
import { logError } from '@/lib/logger';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export function useWorkoutStreak(userId?: string | null) {
  const [streakStats, setStreakStats] = useState<WorkoutStreak | null>(null);
  // Track which userId the last successful fetch was for.
  // Loading is derived: true when userId exists but doesn't match lastFetchedUserId.
  // This avoids both setState-in-effect (sync) and refs-during-render lint errors.
  const [lastFetchedUserId, setLastFetchedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    computeWorkoutStreakAndStats()
      .then((res) => {
        if (cancelled) return;
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
      .catch((err) => logError('useWorkoutStreak', err))
      .finally(() => { if (!cancelled) setLastFetchedUserId(userId); });

    return () => { cancelled = true; };
  }, [userId]);

  // Loading when userId exists but the fetch for this userId hasn't completed yet
  const streakLoading = !!userId && userId !== lastFetchedUserId;

  return { streakStats, setStreakStats, streakLoading };
}
