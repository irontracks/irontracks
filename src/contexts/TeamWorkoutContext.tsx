"use client";

import React, { createContext, useCallback, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { playStartSound } from '@/lib/sounds';
import { useInAppNotifications } from '@/contexts/InAppNotificationsContext';
import { FEATURE_KEYS, isFeatureEnabled } from '@/utils/featureFlags';
import { getErrorMessage } from '@/utils/errorMessage'

interface TeamParticipant {
    id?: string
    user_id?: string
    display_name?: string
    photo_url?: string | null
    status?: string
}

interface TeamSession {
    id: string
    isHost: boolean
    participants: TeamParticipant[]
    code?: string
    hostName?: string
}

interface IncomingInvite {
    id: string
    from_uid: string
    workout_data?: Record<string, unknown> | null
    team_session_id?: string | null
    status: 'pending' | 'accepted' | 'rejected'
    created_at: string
    createdAt?: string | number
    invite_id?: string
    from_display_name?: string
    fromName?: string
    profiles?: {
        display_name: string | null
        photo_url: string | null
    } | null
    from?: {
        displayName?: string
        photoURL?: string | null
        uid?: string
        display_name?: string | null
        photo_url?: string | null
    }
    workout?: Record<string, unknown> | null
}

interface AcceptedInviteNotice {
    inviteId: string
    fromName: string
    fromPhoto: string | null
    teamSessionId?: string | null
    user?: { displayName: string; photoURL: string | null; uid: string | null }
}

type PresenceStatus = 'online' | 'away' | 'offline'

interface JoinResult {
    ok: boolean
    teamSessionId?: string
    participants?: TeamParticipant[]
    workout?: Record<string, unknown> | null
    error?: string
}

interface ActionOkResult {
    ok: boolean
    error?: string
}

interface TeamWorkoutContextValue {
    incomingInvites: IncomingInvite[]
    acceptedInviteNotice: AcceptedInviteNotice | null
    teamSession: TeamSession | null
    loading: boolean
    presence: Record<string, { status: PresenceStatus; last_seen?: string }>
    presenceStatus: PresenceStatus
    setPresenceStatus: (status: PresenceStatus) => void
    joinByCode: (code: string) => Promise<JoinResult>
    leaveSession: () => Promise<void>
    sendInvite: (targetUser: unknown, workoutData: Record<string, unknown>, teamSessionId?: string | null) => Promise<unknown>
    acceptInvite: (invite: IncomingInvite, onStartSession?: (workout: Record<string, unknown>) => void) => Promise<unknown>
    rejectInvite: (inviteId: string) => Promise<void>
    createJoinCode: (workout: Record<string, unknown>, ttlMinutes?: number) => Promise<unknown>
    dismissAcceptedInvite: () => void
    refetchInvites: () => Promise<void>
}

interface TeamWorkoutProviderProps {
    children: React.ReactNode
    user: { id: string; email?: string | null } | null
    settings?: Record<string, unknown> | null
    onStartSession?: (workout: Record<string, unknown>) => void
}

const TeamWorkoutContext = createContext<TeamWorkoutContextValue | null>(null);

export const useTeamWorkout = () => {
    const context = useContext(TeamWorkoutContext);
    if (!context) {
        throw new Error('useTeamWorkout must be used within a TeamWorkoutProvider');
    }
    return context;
};

export const TeamWorkoutProvider = ({ children, user, settings, onStartSession }: TeamWorkoutProviderProps) => {
    const [incomingInvites, setIncomingInvites] = useState<IncomingInvite[]>([]);
    const [acceptedInviteNotice, setAcceptedInviteNotice] = useState<AcceptedInviteNotice | null>(null);
    const [teamSession, setTeamSession] = useState<TeamSession | null>(null);
    const [loading, setLoading] = useState(false);
    const [presence, setPresence] = useState<Record<string, { status: PresenceStatus }>>({});
    const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>('online');
    const supabase = useMemo(() => createClient(), []);
    const seenAcceptedInviteIdsRef = useRef(new Set());
    const { notify } = useInAppNotifications();
    const joinHandledRef = useRef(new Set());

    const canReceiveInvites = useMemo(() => {
        const s = settings && typeof settings === 'object' ? settings : null;
        const allow = s ? s.allowTeamInvites : undefined;
        return allow !== false;
    }, [settings]);

    const teamworkV2Enabled = useMemo(() => {
        return isFeatureEnabled(settings, FEATURE_KEYS.teamworkV2);
    }, [settings]);

    const soundOpts = useMemo(() => {
        const s = settings && typeof settings === 'object' ? settings : null;
        const enabled = s ? s.enableSounds !== false : true;
        const volumeRaw = s ? Number(s.soundVolume ?? 100) : 100;
        const volume = Number.isFinite(volumeRaw) ? Math.max(0, Math.min(1, volumeRaw / 100)) : 1;
        return { enabled, volume };
    }, [settings]);

    const joinByCode = useCallback(async (code: string): Promise<JoinResult> => {
        try {
            if (!teamworkV2Enabled) return { ok: false, error: 'disabled' };
            const safe = String(code || '').trim();
            if (!safe) throw new Error('Código inválido');
            const { data, error } = await supabase.rpc('join_team_session_by_code', { code: safe });
            if (error) throw error;
            const payload = data && typeof data === 'object' ? data : {};
            const sessionId = payload?.team_session_id ? String(payload.team_session_id) : '';
            if (!sessionId) throw new Error('Sessão inválida');
            const parts = Array.isArray(payload?.participants) ? payload.participants : [];
            setTeamSession({ id: sessionId, isHost: false, participants: parts as unknown as TeamParticipant[] });
            return { ok: true, teamSessionId: sessionId, participants: parts as unknown as TeamParticipant[], workout: (payload?.workout ?? null) as unknown as Record<string, unknown> | null };
        } catch (e: unknown) {
            return { ok: false, error: getErrorMessage(e) || String(e || '') };
        }
    }, [supabase, teamworkV2Enabled]);

    const refetchInvites = useMemo(() => {
        return async () => {
            try {
                const safeUserId = user?.id ? String(user.id) : '';
                if (!safeUserId) return;
                if (!canReceiveInvites) {
                    setIncomingInvites([]);
                    return;
                }
                const { data } = await supabase
                    .from('invites')
                    .select('*, profiles:from_uid(display_name, photo_url)')
                    .eq('to_uid', safeUserId)
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false });
                const list = Array.isArray(data) ? data : [];
                const mapped = list
                    .filter((inv) => inv && typeof inv === 'object')
                    .map(inv => ({
                        id: inv.id,
                        created_at: inv.created_at,
                        from_uid: inv.from_uid,
                        team_session_id: inv.team_session_id ?? null,
                        status: inv.status,
                        workout_data: inv.workout_data ?? null,
                        profiles: inv.profiles ?? null,
                        from: {
                            displayName: inv.profiles?.display_name || 'Unknown',
                            photoURL: inv.profiles?.photo_url,
                            uid: inv.from_uid
                        },
                        workout: inv.workout_data
                    }));
                setIncomingInvites(mapped as unknown as IncomingInvite[]);
            } catch {
                return;
            }
        };
    }, [supabase, user?.id, canReceiveInvites]);

    // 1. Listen for Incoming Invites
    useEffect(() => {
        if (!user?.id) return;

        if (!canReceiveInvites) {
            setIncomingInvites([]);
            return;
        }
        refetchInvites();

        // Subscribe to new invites
        const channel = supabase
            .channel(`invites:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'invites',
                    filter: `to_uid=eq.${user.id}`
                },
                async (payload) => {
                    try {
                        const newInvite = payload?.new;
                        if (!newInvite || typeof newInvite !== 'object') return;
                        if (newInvite.status !== 'pending') return;

                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('display_name, photo_url')
                            .eq('id', newInvite.from_uid)
                            .single();

                        setIncomingInvites(prev => {
                            const current = Array.isArray(prev) ? prev : [];
                            const id = newInvite?.id ? String(newInvite.id) : '';
                            if (id && current.some((i) => String(i?.id || '') === id)) return current;

                            return [{
                                id: newInvite.id,
                                created_at: newInvite.created_at,
                                from_uid: String(newInvite.from_uid),
                                team_session_id: newInvite.team_session_id ? String(newInvite.team_session_id) : null,
                                status: 'pending',
                                workout_data: (newInvite.workout_data ?? null) as unknown as Record<string, unknown> | null,
                                profiles: profile && typeof profile === 'object' ? { display_name: profile.display_name ?? null, photo_url: profile.photo_url ?? null } : null,
                                from: {
                                    displayName: profile?.display_name || 'Unknown',
                                    photoURL: profile?.photo_url,
                                    uid: newInvite.from_uid
                                },
                                workout: newInvite.workout_data
                            }, ...current];
                        });
                        try {
                            const fromName = String(profile?.display_name || 'Alguém').trim() || 'Alguém';
                            notify({
                                id: newInvite.id,
                                type: 'invite',
                                senderName: fromName,
                                displayName: 'Convite',
                                photoURL: profile?.photo_url || null,
                                text: `${fromName} te convidou para treinar junto.`,
                            });
                        } catch { }
                        try { playStartSound(soundOpts); } catch { }
                    } catch {
                        return;
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'invites',
                    filter: `to_uid=eq.${user.id}`
                },
                (payload) => {
                    try {
                        const updated = payload?.new;
                        if (!updated || typeof updated !== 'object') return;
                        const id = updated?.id ? String(updated.id) : '';
                        if (!id) return;
                        const status = updated?.status ? String(updated.status) : '';
                        if (status && status !== 'pending') {
                            setIncomingInvites((prev) => {
                                const current = Array.isArray(prev) ? prev : [];
                                return current.filter((i) => String(i?.id || '') !== id);
                            });
                        }
                    } catch {
                        return;
                    }
                }
            )
            .subscribe((status) => {
                void status;
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, user?.id, refetchInvites, canReceiveInvites, soundOpts, notify]);

    // Fallback: if invites realtime isn't enabled, notifications will still fire
    useEffect(() => {
        if (!user?.id) return;

        const safeUserId = String(user.id);
        let mounted = true;
        const refetch = async () => {
            try {
                const { data } = await supabase
                    .from('invites')
                    .select('*, profiles:from_uid(display_name, photo_url)')
                    .eq('to_uid', safeUserId)
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false });
                if (!mounted) return;
                const list = Array.isArray(data) ? data : [];
                const mapped = list
                    .filter((inv) => inv && typeof inv === 'object')
                    .map(inv => ({
                        id: inv.id,
                        created_at: inv.created_at,
                        from_uid: inv.from_uid,
                        team_session_id: inv.team_session_id ?? null,
                        status: inv.status,
                        workout_data: inv.workout_data ?? null,
                        profiles: inv.profiles ?? null,
                        from: {
                            displayName: inv.profiles?.display_name || 'Unknown',
                            photoURL: inv.profiles?.photo_url,
                            uid: inv.from_uid
                        },
                        workout: inv.workout_data
                    }));
                setIncomingInvites(mapped as unknown as IncomingInvite[]);
            } catch {
                return;
            }
        };

        const channel = supabase
            .channel(`invite-notifications:${safeUserId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${safeUserId}`
                },
                (payload) => {
                    try {
                        if (!mounted) return;
                        const n = payload?.new && typeof payload.new === 'object' ? payload.new : null;
                        if (!n) return;
                        const type = String(n?.type ?? '');
                        if (type !== 'invite') return;
                        refetchInvites();
                        try { playStartSound(soundOpts); } catch { }
                    } catch {
                        return;
                    }
                }
            )
            .subscribe();

        const POLL_MS = 20_000;
        const pollId = setInterval(() => {
            try { refetchInvites(); } catch { }
        }, POLL_MS);

        const handleVisibility = () => {
            try {
                if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                    refetchInvites();
                }
            } catch { }
        };
        const handleFocus = () => {
            try { refetchInvites(); } catch { }
        };

        try {
            if (typeof document !== 'undefined') document.addEventListener('visibilitychange', handleVisibility);
        } catch { }
        try {
            if (typeof window !== 'undefined') window.addEventListener('focus', handleFocus);
        } catch { }

        return () => {
            mounted = false;
            try {
                supabase.removeChannel(channel);
            } catch {
                return;
            }
            try { clearInterval(pollId); } catch { }
            try {
                if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibility);
            } catch { }
            try {
                if (typeof window !== 'undefined') window.removeEventListener('focus', handleFocus);
            } catch { }
        };
    }, [supabase, user?.id, refetchInvites, canReceiveInvites, soundOpts]);

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
                        setTeamSession(prev => {
                            const base = prev && typeof prev === 'object' ? prev : null;
                            const nextId = base?.id ?? teamSession?.id ?? updated.id ?? null;
                            return {
                                ...(base as unknown as TeamSession),
                                id: nextId,
                                participants: nextParticipants as unknown as TeamParticipant[]
                            };
                        });
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
                setPresence(next as unknown as Record<string, { status: PresenceStatus }>);
            } catch {
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
                            } catch {
                            }
                        }
                    )
                    .subscribe();
            } catch {
            }
        })();

        return () => {
            cancelled = true;
            try {
                if (channel) supabase.removeChannel(channel);
            } catch {
            }
        };
    }, [supabase, teamSession?.id, teamworkV2Enabled, user?.id]);

    useEffect(() => {
        if (!teamworkV2Enabled) return;
        if (!teamSession?.id) return;
        if (!user?.id) return;
        let cancelled = false;
        const upsert = async () => {
            try {
                await supabase
                    .from('team_session_presence')
                    .upsert(
                        { session_id: teamSession.id, user_id: user.id, status: String(presenceStatus || 'online') },
                        { onConflict: 'session_id,user_id' }
                    );
            } catch {
            }
        };
        const t = setInterval(() => {
            if (cancelled) return;
            upsert();
        }, 15000);
        upsert();
        return () => {
            cancelled = true;
            clearInterval(t);
        };
    }, [presenceStatus, supabase, teamSession?.id, teamworkV2Enabled, user?.id]);

    useEffect(() => {
        if (!teamworkV2Enabled) return;
        const uid = user?.id ? String(user.id) : '';
        if (!uid) return;
        try {
            if (typeof window === 'undefined') return;
            const url = new URL(window.location.href);
            const code = String(url.searchParams.get('join') || '').trim();
            if (!code) return;
            const key = `${uid}:${code.toLowerCase()}`;
            if (joinHandledRef.current.has(key)) return;
            joinHandledRef.current.add(key);
            window.setTimeout(async () => {
                try {
                    const res = await joinByCode(code);
                    if (res?.ok && res?.workout && typeof onStartSession === 'function') {
                        onStartSession(res.workout);
                    }
                    try {
                        const next = new URL(window.location.href);
                        next.searchParams.delete('join');
                        window.history.replaceState({}, '', next.pathname + next.search + next.hash);
                    } catch { }
                } catch { }
            }, 0);
        } catch { }
    }, [joinByCode, onStartSession, teamworkV2Enabled, user?.id]);

    // 3. Host: listen for invite acceptance (realtime + polling fallback)
    useEffect(() => {
        const userId = user?.id ? String(user.id) : '';
        if (!userId) return;
        let mounted = true;
        let channel = null;

        const showAccepted = async (inviteRow: any) => {
            try {
                if (!mounted) return;
                const id = inviteRow?.id ? String(inviteRow.id) : '';
                if (!id) return;
                if (seenAcceptedInviteIdsRef.current.has(id)) return;
                seenAcceptedInviteIdsRef.current.add(id);

                const toUid = inviteRow?.to_uid ? String(inviteRow.to_uid) : '';
                const teamSessionId = inviteRow?.team_session_id ? String(inviteRow.team_session_id) : '';

                let profile = null;
                if (toUid) {
                    const { data } = await supabase
                        .from('profiles')
                        .select('display_name, photo_url')
                        .eq('id', toUid)
                        .maybeSingle();
                    profile = data && typeof data === 'object' ? data : null;
                }

                if (!mounted) return;
                const fromName = String(profile?.display_name || 'Seu parceiro').trim() || 'Seu parceiro';
                setAcceptedInviteNotice({
                    inviteId: id,
                    fromName,
                    fromPhoto: profile?.photo_url || null,
                    teamSessionId: teamSessionId || null,
                    user: {
                        displayName: fromName,
                        photoURL: profile?.photo_url || null,
                        uid: toUid || null,
                    },
                });
                try { playStartSound(soundOpts); } catch { }
            } catch {
                return;
            }
        };

        const pollAccepted = async () => {
            try {
                if (!mounted) return;
                const currentSessionId = teamSession?.id ? String(teamSession.id) : '';
                if (!currentSessionId) return;

                const { data } = await supabase
                    .from('invites')
                    .select('id, to_uid, team_session_id, status')
                    .eq('from_uid', userId)
                    .eq('team_session_id', currentSessionId)
                    .eq('status', 'accepted')
                    .order('created_at', { ascending: false });

                const list = Array.isArray(data) ? data : [];
                for (const inv of list) {
                    const id = inv?.id ? String(inv.id) : '';
                    if (!id) continue;
                    if (seenAcceptedInviteIdsRef.current.has(id)) continue;
                    await showAccepted(inv);
                    break;
                }
            } catch {
                return;
            }
        };

        try {
            channel = supabase
                .channel(`invites-accepted:${userId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'invites',
                        filter: `from_uid=eq.${userId}`,
                    },
                    (payload) => {
                        try {
                            if (!mounted) return;
                            const updated = payload?.new && typeof payload.new === 'object' ? payload.new : null;
                            if (!updated) return;
                            const status = updated?.status ? String(updated.status) : '';
                            if (status !== 'accepted') return;
                            const currentSessionId = teamSession?.id ? String(teamSession.id) : '';
                            const inviteSessionId = updated?.team_session_id ? String(updated.team_session_id) : '';
                            if (currentSessionId && inviteSessionId && inviteSessionId !== currentSessionId) return;
                            showAccepted(updated);
                        } catch {
                            return;
                        }
                    }
                )
                .subscribe();
        } catch { }

        const pollId = setInterval(() => {
            try { pollAccepted(); } catch { }
        }, 20_000);

        try { pollAccepted(); } catch { }

        return () => {
            mounted = false;
            try {
                if (channel) supabase.removeChannel(channel);
            } catch { }
            try { clearInterval(pollId); } catch { }
        };
    }, [supabase, user?.id, teamSession?.id, soundOpts]);

    const sendInvite = async (targetUser: unknown, workout: Record<string, unknown>, currentTeamSessionId: string | null = null) => {
        try {
            if (!user?.id) throw new Error('Usuário inválido');
            const targetUserObj = targetUser && typeof targetUser === 'object' ? (targetUser as { id: string }) : null;
            if (!targetUserObj?.id) throw new Error('Aluno inválido');
            const targetUserId = String(targetUserObj.id);

            let sessionId = currentTeamSessionId;
            const u = user as unknown as { displayName?: string; photoURL?: string | null };

            if (!sessionId) {
                const { data: session, error } = await supabase
                    .from('team_sessions')
                    .insert({
                        host_uid: user.id,
                        status: 'active',
                        participants: [{ uid: user.id, name: u.displayName, photo: u.photoURL }]
                    })
                    .select()
                    .single();

                if (error) throw error;
                sessionId = session?.id;
                if (!sessionId) throw new Error('Falha ao criar sessão');

                setTeamSession({
                    id: sessionId,
                    isHost: true,
                    hostName: u.displayName,
                    participants: (Array.isArray(session?.participants) ? session.participants : []) as unknown as TeamParticipant[]
                });

                if (teamworkV2Enabled) {
                    try {
                        await supabase.from('team_session_presence').upsert(
                            { session_id: sessionId, user_id: user.id, status: 'online' },
                            { onConflict: 'session_id,user_id' }
                        );
                    } catch { }
                }
            }

            const { error: inviteError } = await supabase
                .from('invites')
                .insert({
                    from_uid: user.id,
                    to_uid: targetUserId,
                    workout_data: workout,
                    team_session_id: sessionId,
                    status: 'pending'
                });

            if (inviteError) throw inviteError;
            return sessionId;
        } catch (e: unknown) {
            const msg = getErrorMessage(e) || String(e || 'Erro ao enviar convite');
            throw new Error(msg);
        }
    };

    const generateJoinCode = () => {
        const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let out = '';
        for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
        return out;
    };

    const createJoinCode = async (workout: Record<string, unknown>, ttlMinutes = 90) => {
        try {
            if (!teamworkV2Enabled) return { ok: false, error: 'disabled' };
            if (!user?.id) throw new Error('Usuário inválido');
            const expiresAt = new Date(Date.now() + Math.max(10, Number(ttlMinutes) || 90) * 60_000).toISOString();
            const code = generateJoinCode();

            let sessionId = teamSession?.id ? String(teamSession.id) : '';
            let participants = teamSession?.participants || [];
            const u = user as unknown as { displayName?: string; photoURL?: string | null };
            if (!sessionId) {
                const { data: session, error } = await supabase
                    .from('team_sessions')
                    .insert({
                        host_uid: user.id,
                        status: 'active',
                        participants: [{ uid: user.id, name: u.displayName, photo: u.photoURL }],
                        workout_state: { workout_data: workout, join_code: code, join_expires_at: expiresAt }
                    })
                    .select()
                    .single();
                if (error) throw error;
                sessionId = session?.id ? String(session.id) : '';
                participants = Array.isArray(session?.participants) ? session.participants : [];
                if (!sessionId) throw new Error('Falha ao criar sessão');
                setTeamSession({ id: sessionId, isHost: true, hostName: u.displayName, participants: participants as unknown as TeamParticipant[] });
            } else {
                const { data: existing } = await supabase
                    .from('team_sessions')
                    .select('workout_state')
                    .eq('id', sessionId)
                    .maybeSingle();
                const prev = existing?.workout_state && typeof existing.workout_state === 'object' ? existing.workout_state : {};
                const nextState = { ...prev, workout_data: workout, join_code: code, join_expires_at: expiresAt };
                await supabase.from('team_sessions').update({ workout_state: nextState }).eq('id', sessionId);
            }

            const url = (() => {
                try {
                    if (typeof window === 'undefined') return '';
                    return `${window.location.origin}/dashboard?join=${encodeURIComponent(code)}`;
                } catch {
                    return '';
                }
            })();
            return { ok: true, sessionId, code, expiresAt, url };
        } catch (e: unknown) {
            return { ok: false, error: getErrorMessage(e) || String(e || '') };
        }
    };

    const acceptInvite = async (invite: IncomingInvite, onStartSession?: (workout: Record<string, unknown>) => void) => {
        if (!user) return;
        try {
            const inviteId = invite?.id ? String(invite.id) : '';
            if (!inviteId) throw new Error('Convite inválido');
            if (!user?.id) throw new Error('Usuário inválido');

            const { data, error } = await supabase
                .rpc('accept_team_invite', { invite_id: inviteId });
            if (error) throw error;

            const payload = data && typeof data === 'object' ? data : null;
            const teamSessionId = payload?.team_session_id ? String(payload.team_session_id) : '';
            if (!teamSessionId) throw new Error('Sessão inválida');

            const newParticipants = Array.isArray(payload?.participants) ? payload.participants : [];
            const workoutFromInvite = payload?.workout ?? invite?.workout;

            setTeamSession({
                id: teamSessionId,
                isHost: false,
                participants: newParticipants as unknown as TeamParticipant[]
            });

            setIncomingInvites(prev => {
                const current = Array.isArray(prev) ? prev : [];
                return current.filter(i => String(i?.id || '') !== inviteId);
            });

            try {
                await supabase
                    .from('notifications')
                    .update({ read: true })
                    .eq('user_id', user.id)
                    .eq('type', 'invite');
            } catch {
            }

            if (onStartSession) onStartSession(workoutFromInvite);

            return workoutFromInvite;
        } catch (e: unknown) {
            const msg = getErrorMessage(e) || String(e || 'Erro ao aceitar convite');
            throw new Error(msg);
        }
    };

    const rejectInvite = async (inviteId: string) => {
        try {
            const safeId = inviteId ? String(inviteId) : '';
            if (!safeId) return;
            await supabase
                .from('invites')
                .update({ status: 'rejected' })
                .eq('id', safeId);

            setIncomingInvites(prev => {
                const current = Array.isArray(prev) ? prev : [];
                return current.filter(i => String(i?.id || '') !== safeId);
            });
        } catch {
            setIncomingInvites(prev => (Array.isArray(prev) ? prev : []));
        }
    };

    const leaveSession = async () => {
        try {
            const sid = teamSession?.id ? String(teamSession.id) : '';
            if (!sid) {
                setTeamSession(null);
                return;
            }
            if (teamworkV2Enabled) {
                try {
                    await supabase.rpc('leave_team_session', { p_session_id: sid });
                } catch {
                }
            }
            setTeamSession(null);
        } catch {
            setTeamSession(null);
        }
    };

    const dismissAcceptedInvite = () => {
        setAcceptedInviteNotice(null);
    };

    return (
        <TeamWorkoutContext.Provider value={{
            incomingInvites,
            acceptedInviteNotice,
            teamSession,
            sendInvite,
            acceptInvite,
            rejectInvite,
            leaveSession,
            createJoinCode,
            joinByCode,
            setPresenceStatus,
            presence,
            dismissAcceptedInvite,
            loading,
            presenceStatus,
            refetchInvites,
        }}>
            {children}
        </TeamWorkoutContext.Provider>
    );
};
