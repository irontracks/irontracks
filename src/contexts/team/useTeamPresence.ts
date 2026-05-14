'use client'

import { useState, useEffect } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { TeamSession, PresenceStatus } from './types'
import { logWarn } from '@/lib/logger'

interface UseTeamPresenceParams {
    user: { id: string; email?: string | null } | null
    supabase: SupabaseClient
    teamSession: TeamSession | null
    teamworkV2Enabled: boolean
}

export function useTeamPresence({ user, supabase, teamSession, teamworkV2Enabled }: UseTeamPresenceParams) {
    const [presence, setPresence] = useState<Record<string, { status: PresenceStatus; last_seen?: string }>>({})
    const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>('online')

    // Presence subscription
    useEffect(() => {
        if (!teamworkV2Enabled) return;
        if (!teamSession?.id) return;
        if (!user?.id) return;
        let cancelled = false;
        let channel: RealtimeChannel | null = null;

        const hydrate = async () => {
            try {
                const { data } = await supabase
                    .from('team_session_presence')
                    .select('user_id, status, updated_at')
                    .eq('session_id', teamSession.id);
                if (cancelled) return;
                const rows = Array.isArray(data) ? data : [];
                const next: Record<string, { status: PresenceStatus; last_seen?: string }> = {};
                for (const r of rows) {
                    const uid = String(r?.user_id || '').trim();
                    if (!uid) continue;
                    next[uid] = { status: String(r?.status || 'online') as PresenceStatus, last_seen: r?.updated_at ? String(r.updated_at) : undefined };
                }
                setPresence(next);
            } catch (e) { logWarn("useTeamPresence", "silenced", e)
            }
        };

        (async () => {
            await hydrate();
            if (cancelled) return;
            try {
                channel = supabase
                    .channel(`team_session_presence:${teamSession.id}`)
                    .on(
                        'postgres_changes',
                        { event: '*', schema: 'public', table: 'team_session_presence', filter: `session_id=eq.${teamSession.id}` },
                        (payload: unknown) => {
                            try {
                                const p = payload as { eventType?: string; old?: Record<string, unknown>; new?: Record<string, unknown> }
                                const ev = String(p?.eventType || '').toUpperCase();
                                const row = ev === 'DELETE' ? p?.old : p?.new;
                                const uid = String(row?.user_id || '').trim();
                                if (!uid) return;
                                setPresence((prev) => {
                                    const base = prev && typeof prev === 'object' ? { ...prev } : {};
                                    if (ev === 'DELETE') {
                                        delete base[uid];
                                        return base;
                                    }
                                    base[uid] = { status: String(row?.status || 'online') as PresenceStatus };
                                    return base;
                                });
                            } catch (e) { logWarn("useTeamPresence", "silenced", e)
                            }
                        }
                    )
                    .subscribe();
            } catch (e) { logWarn("useTeamPresence", "silenced", e)
            }
        })();

        return () => {
            cancelled = true;
            try {
                if (channel) supabase.removeChannel(channel);
            } catch (e) { logWarn("useTeamPresence", "silenced", e)
            }
        };
    }, [supabase, teamSession?.id, teamworkV2Enabled, user?.id]);

    // Presence heartbeat
    // B-009: pausa o heartbeat quando aba está em background (drenava quota Supabase
    // sem benefício, pois ninguém vê o status). Ao voltar pra visible, faz upsert
    // imediato pra atualizar last_seen e sinalizar pro server que o usuário voltou.
    useEffect(() => {
        if (!teamworkV2Enabled) return;
        if (!teamSession?.id) return;
        if (!user?.id) return;
        let cancelled = false;
        let intervalId: ReturnType<typeof setInterval> | null = null;

        const upsert = async () => {
            try {
                await supabase
                    .from('team_session_presence')
                    .upsert(
                        { session_id: teamSession.id, user_id: user.id, status: String(presenceStatus || 'online') },
                        { onConflict: 'session_id,user_id' }
                    );
            } catch (e) { logWarn("useTeamPresence", "silenced", e)
            }
        };
        const tick = () => {
            if (cancelled) return;
            upsert();
        };
        const start = () => {
            if (intervalId !== null) return;
            intervalId = setInterval(tick, 15000);
        };
        const stop = () => {
            if (intervalId !== null) {
                clearInterval(intervalId);
                intervalId = null;
            }
        };
        const onVisibilityChange = () => {
            if (typeof document === 'undefined' || cancelled) return;
            if (document.hidden) {
                stop();
            } else {
                upsert();
                start();
            }
        };

        // Disparo inicial + inicia interval só se já estivermos visíveis.
        upsert();
        if (typeof document === 'undefined' || !document.hidden) start();
        try {
            if (typeof document !== 'undefined') {
                document.addEventListener('visibilitychange', onVisibilityChange);
            }
        } catch { /* SSR guard */ }

        return () => {
            cancelled = true;
            stop();
            try {
                if (typeof document !== 'undefined') {
                    document.removeEventListener('visibilitychange', onVisibilityChange);
                }
            } catch { /* SSR guard */ }
        };
    }, [presenceStatus, supabase, teamSession?.id, teamworkV2Enabled, user?.id]);

    return {
        presence,
        presenceStatus,
        setPresence,
        setPresenceStatus,
    }
}
