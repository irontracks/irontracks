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

import { useState, useEffect, useRef } from 'react';
import { computeWorkoutStreakAndStats } from '@/actions/workout-actions';
import type { WorkoutStreak } from '@/types/app';
import { logError } from '@/lib/logger';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export function useWorkoutStreak(userId?: string | null) {
  const [streakStats, setStreakStats] = useState<WorkoutStreak | null>(null);
  // Track whether the async fetch has completed (set only inside async callbacks)
  const [resolved, setResolved] = useState(false);
  // Track the userId that triggered the last fetch so we can detect changes
  // without calling setState synchronously inside the effect body.
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  // Reset resolved state when userId changes (outside effect, in render phase)
  if (userId !== prevUserIdRef.current) {
    prevUserIdRef.current = userId;
    if (resolved) setResolved(false);
  }

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
      .finally(() => { if (!cancelled) setResolved(true); });

    return () => { cancelled = true; };
  }, [userId]);

  // Loading when userId exists but the async fetch hasn't resolved yet
  const streakLoading = !!userId && !resolved;

  return { streakStats, setStreakStats, streakLoading };
}
