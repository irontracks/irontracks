'use client'

import { useState, useEffect, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TeamSession, TeamParticipant } from './types'

interface UseTeamSessionParams {
    user: { id: string; email?: string | null } | null
    supabase: SupabaseClient
    teamworkV2Enabled: boolean
}

export function useTeamSession({ user, supabase, teamworkV2Enabled }: UseTeamSessionParams) {
    const [teamSession, setTeamSession] = useState<TeamSession | null>(null)
    const [loading, setLoading] = useState(false)
    const joinHandledRef = useRef(new Set())

    // 2. Listen to Active Team Session
    useEffect(() => {
        if (!teamSession?.id) return;

        const channel = supabase
            .channel(`session:${teamSession.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'team_sessions',
                    filter: `id=eq.${teamSession.id}`
                },
                (payload) => {
                    try {
                        const updated = payload?.new;
                        if (!updated || typeof updated !== 'object') return;
                        const st = String(updated.status || '').toLowerCase();
                        if (st === 'finished' || st === 'ended') {
                            setTeamSession(null);
                            return;
                        }

                        const nextParticipants = Array.isArray(updated.participants) ? updated.participants : [];
                        const nextId = teamSession?.id ?? String(updated.id ?? '');
                        if (!nextId) return;
                        setTeamSession((prev) => ({
                            ...(prev && typeof prev === 'object' ? prev : {}),
                            id: nextId,
                            participants: nextParticipants as TeamParticipant[]
                        } as TeamSession));
                    } catch {
                        return;
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, teamSession?.id]);

    // Auto-join from URL
    useEffect(() => {
        // joinByCode is created in the provider facade; auto-join is handled there.
        // This effect is intentionally empty here — see TeamWorkoutContext.tsx provider.
    }, [])

    return {
        teamSession,
        setTeamSession,
        loading,
        setLoading,
        joinHandledRef,
    }
}
