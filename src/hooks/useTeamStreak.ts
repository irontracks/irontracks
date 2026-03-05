'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'

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
    const [streaks, setStreaks] = useState<TeamStreakData[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetch = useCallback(async () => {
        if (!myUserId) return
        setLoading(true)
        setError(null)
        try {
            const supabase = createClient()
            // Fetch all team sessions this user participated in
            const { data, error: err } = await supabase
                .from('team_sessions')
                .select('id, created_at, participants')
                .filter('participants', 'cs', JSON.stringify([{ uid: myUserId }]))
                .order('created_at', { ascending: false })
                .limit(200)
            if (err) throw err

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

            const result: TeamStreakData[] = Object.entries(coSessions)
                .map(([partnerId, d]) => ({
                    partnerId,
                    partnerName: d.name,
                    count: d.count,
                    lastSessionAt: d.lastAt,
                    badge: getBadgeInfo(d.count)?.badge ?? null,
                }))
                .sort((a, b) => b.count - a.count)

            setStreaks(result)
        } catch (e: unknown) {
            setError('Erro ao carregar streak.')
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [myUserId, partnerUserId])

    useEffect(() => { fetch() }, [fetch])

    return { streaks, loading, error, refetch: fetch }
}
