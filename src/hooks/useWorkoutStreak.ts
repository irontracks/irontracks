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

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { computeWorkoutStreakAndStats } from '@/actions/workout-actions';
import type { WorkoutStreak } from '@/types/app';
import { logError } from '@/lib/logger';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Streak/stats via React Query — a action varre os treinos do usuário e era
 * refeita do ZERO a cada montagem do dashboard (nenhum cache). Com
 * `staleTime` de 5 min o valor sobrevive a remounts e navegações; o número só
 * muda quando um treino é finalizado, e nesse caminho o cache é invalidado por
 * quem grava (ou expira sozinho).
 */
const STREAK_STALE_MS = 5 * 60_000;

export function useWorkoutStreak(userId?: string | null) {
  const queryClient = useQueryClient();
  // Memoizada: é dependência do setter otimista abaixo — array literal novo a
  // cada render faria o React Compiler recusar a memoização manual.
  const queryKey = useMemo(() => ['workout-streak', userId ?? ''] as const, [userId]);

  const query = useQuery<WorkoutStreak | null>({
    queryKey,
    enabled: !!userId,
    staleTime: STREAK_STALE_MS,
    queryFn: async (): Promise<WorkoutStreak | null> => {
      try {
        const res = await computeWorkoutStreakAndStats();
        if (!res?.ok || !res?.data) return null;
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
          weekWorkouts:
            d.weekWorkouts != null ? Number(d.weekWorkouts) : undefined,
        };

        return streak;
      } catch (err) {
        logError('useWorkoutStreak', err);
        return null;
      }
    },
  });

  // Atualização otimista preservada (contrato antigo do hook): escreve direto
  // no cache do Query em vez de num useState paralelo, senão os dois
  // divergiriam no próximo refetch.
  const setStreakStats = useCallback(
    (next: WorkoutStreak | null | ((prev: WorkoutStreak | null) => WorkoutStreak | null)) => {
      queryClient.setQueryData<WorkoutStreak | null>(queryKey, (prev) =>
        typeof next === 'function'
          ? (next as (p: WorkoutStreak | null) => WorkoutStreak | null)(prev ?? null)
          : next,
      );
    },
    [queryClient, queryKey],
  );

  return {
    streakStats: query.data ?? null,
    setStreakStats,
    streakLoading: !!userId && query.isPending,
  };
}
