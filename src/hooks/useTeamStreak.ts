/**
 * @module useTeamStreak
 *
 * Tracks shared workout streaks between training partners.
 * Fetches partner data and computes badge tier (bronze → iron) based
 * on consecutive co-sessions. Used by the community and dashboard pages.
 *
 * Reescrito em PR-C (REACT19_MIGRATION_PLAN) usando TanStack Query v5.
 * API pública preservada: `{ streaks, loading, error, refetch }`.
 *
 * @param myUserId - Current user ID
 * @param partnerUserId - Optional filter pra estatísticas com um parceiro específico
 * @returns `{ streaks, loading, error, refetch }`
 */
'use client'
import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStableSupabaseClient } from '@/hooks/useStableSupabaseClient'
import { logError } from '@/lib/logger'

export interface TeamStreakData {
    partnerId: string
    partnerName: string
    count: number            // total shared sessions
    lastSessionAt: string | null
    badge: 'bronze' | 'silver' | 'gold' | 'iron' | null
}

const BADGE_THRESHOLDS: Array<{ min: number; badge: TeamStreakData['badge']; label: string; emoji: string }> = [
    { min: 30, badge: 'gold', label: 'Dupla Lendária', emoji: '🏆' },
    { min: 15, badge: 'silver', label: 'Dupla de Ferro', emoji: '⚔️' },
    { min: 5, badge: 'bronze', label: 'Dupla em Chamas', emoji: '🔥' },
    { min: 1, badge: 'iron', label: 'Iniciantes', emoji: '💪' },
]

export function getBadgeInfo(count: number) {
    return BADGE_THRESHOLDS.find(t => count >= t.min) ?? null
}

/**
 * useTeamStreak — fetches the number of shared team sessions between myUserId and
 * each partner. Partners are identified from the team_sessions table where both
 * users appear in the participants JSON array.
 */
export function useTeamStreak(myUserId: string, partnerUserId?: string | null) {
    const supabase = useStableSupabaseClient()

    const query = useQuery<TeamStreakData[]>({
        queryKey: ['team-streak', myUserId, partnerUserId ?? null],
        enabled: !!myUserId,
        queryFn: async (): Promise<TeamStreakData[]> => {
            try {
                const { data, error } = await supabase
                    .from('team_sessions')
                    .select('id, created_at, participants')
                    .filter('participants', 'cs', JSON.stringify([{ uid: myUserId }]))
                    .order('created_at', { ascending: false })
                    .limit(200)
                if (error) throw error

                const rows = Array.isArray(data) ? data : []

                // Count co-sessions per partner
                const coSessions: Record<string, { count: number; name: string; lastAt: string | null }> = {}
                for (const row of rows) {
                    const parts = Array.isArray(row.participants) ? row.participants as Array<Record<string, unknown>> : []
                    for (const p of parts) {
                        const uid = String(p.uid || p.user_id || '')
                        if (!uid || uid === myUserId) continue
                        if (partnerUserId && uid !== partnerUserId) continue
                        const prev = coSessions[uid]
                        coSessions[uid] = {
                            count: (prev?.count ?? 0) + 1,
                            name: prev?.name || String(p.name || p.display_name || 'Parceiro'),
                            lastAt: prev?.lastAt ?? (row.created_at ? String(row.created_at) : null),
                        }
                    }
                }

                return Object.entries(coSessions)
                    .map(([partnerId, d]) => ({
                        partnerId,
                        partnerName: d.name,
                        count: d.count,
                        lastSessionAt: d.lastAt,
                        badge: getBadgeInfo(d.count)?.badge ?? null,
                    }))
                    .sort((a, b) => b.count - a.count)
            } catch (e) {
                logError('useTeamStreak', e)
                throw e
            }
        },
        staleTime: 60_000,
    })

    const refetch = useCallback(() => {
        void query.refetch()
    }, [query])

    return {
        streaks: query.data ?? [],
        loading: query.isLoading,
        error: query.error ? 'Erro ao carregar streak.' : null,
        refetch,
    }
}
