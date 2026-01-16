import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { playStartSound } from '@/lib/sounds';

const TeamWorkoutContext = createContext({
    incomingInvites: [],
    acceptedInviteNotice: null,
    teamSession: null,
    sendInvite: async () => { },
    acceptInvite: async () => { },
    rejectInvite: async () => { },
    leaveSession: async () => { },
    dismissAcceptedInvite: () => { },
    loading: false
});

export const useTeamWorkout = () => {
    const context = useContext(TeamWorkoutContext);
    if (context === undefined) {
        throw new Error('useTeamWorkout must be used within a TeamWorkoutProvider');
    }
    return context;
};

export const TeamWorkoutProvider = ({ children, user }) => {
    const [incomingInvites, setIncomingInvites] = useState([]);
    const [acceptedInviteNotice, setAcceptedInviteNotice] = useState(null);
    const [teamSession, setTeamSession] = useState(null);
    const [loading, setLoading] = useState(false);
    const supabase = useMemo(() => createClient(), []);
    const seenAcceptedInviteIdsRef = useRef(new Set());

    const canReceiveInvites = useMemo(() => {
        const uid = user?.id ? String(user.id) : '';
        if (!uid) return true;
        try {
            if (typeof window === 'undefined') return true;
            const raw = window.localStorage.getItem(`irontracks.userSettings.v1.${uid}`) || '';
            const parsed = raw ? JSON.parse(raw) : null;
            const allow = parsed && typeof parsed === 'object' ? parsed.allowTeamInvites : undefined;
            return allow !== false;
        } catch {
            return true;
        }
    }, [user?.id]);

    const soundOpts = useMemo(() => {
        const uid = user?.id ? String(user.id) : '';
        if (!uid) return { enabled: true, volume: 1 };
        try {
            if (typeof window === 'undefined') return { enabled: true, volume: 1 };
            const raw = window.localStorage.getItem(`irontracks.userSettings.v1.${uid}`) || '';
            const parsed = raw ? JSON.parse(raw) : null;
            const enabled = parsed && typeof parsed === 'object' ? parsed.enableSounds !== false : true;
            const volumeRaw = parsed && typeof parsed === 'object' ? Number(parsed.soundVolume ?? 100) : 100;
            const volume = Number.isFinite(volumeRaw) ? Math.max(0, Math.min(1, volumeRaw / 100)) : 1;
            return { enabled, volume };
        } catch {
            return { enabled: true, volume: 1 };
        }
    }, [user?.id]);

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
                        from: {
                            displayName: inv.profiles?.display_name || 'Unknown',
                            photoURL: inv.profiles?.photo_url,
                            uid: inv.from_uid
                        },
                        workout: inv.workout_data
                    }));
                setIncomingInvites(mapped);
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
                                from: {
                                    displayName: profile?.display_name || 'Unknown',
                                    photoURL: profile?.photo_url,
                                    uid: newInvite.from_uid
                                },
                                workout: newInvite.workout_data
                            }, ...current];
                        });
                        try { playStartSound(soundOpts); } catch {}
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
    }, [supabase, user?.id, refetchInvites, canReceiveInvites, soundOpts]);

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
                        from: {
                            displayName: inv.profiles?.display_name || 'Unknown',
                            photoURL: inv.profiles?.photo_url,
                            uid: inv.from_uid
                        },
                        workout: inv.workout_data
                    }));
                setIncomingInvites(mapped);
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
                        try { playStartSound(soundOpts); } catch {}
                    } catch {
                        return;
                    }
                }
            )
            .subscribe();

        const POLL_MS = 20_000;
        const pollId = setInterval(() => {
            try { refetchInvites(); } catch {}
        }, POLL_MS);

        const handleVisibility = () => {
            try {
                if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                    refetchInvites();
                }
            } catch {}
        };
        const handleFocus = () => {
            try { refetchInvites(); } catch {}
        };

        try {
            if (typeof document !== 'undefined') document.addEventListener('visibilitychange', handleVisibility);
        } catch {}
        try {
            if (typeof window !== 'undefined') window.addEventListener('focus', handleFocus);
        } catch {}

        return () => {
            mounted = false;
            try {
                supabase.removeChannel(channel);
            } catch {
                return;
            }
            try { clearInterval(pollId); } catch {}
            try {
                if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibility);
            } catch {}
            try {
                if (typeof window !== 'undefined') window.removeEventListener('focus', handleFocus);
            } catch {}
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
                        if (updated.status === 'finished') {
                            setTeamSession(null);
                            return;
                        }

                        const nextParticipants = Array.isArray(updated.participants) ? updated.participants : [];
                        setTeamSession(prev => {
                            const base = prev && typeof prev === 'object' ? prev : {};
                            const nextId = base.id ?? teamSession?.id ?? updated.id ?? null;
                            return {
                                ...base,
                                id: nextId,
                                participants: nextParticipants
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

    // 3. Host: listen for invite acceptance (realtime + polling fallback)
    useEffect(() => {
        const userId = user?.id ? String(user.id) : '';
        if (!userId) return;
        let mounted = true;
        let channel = null;

        const showAccepted = async (inviteRow) => {
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
                setAcceptedInviteNotice({
                    inviteId: id,
                    teamSessionId: teamSessionId || null,
                    user: {
                        displayName: profile?.display_name || 'Seu parceiro',
                        photoURL: profile?.photo_url || null,
                        uid: toUid || null,
                    }
                });
                try { playStartSound(soundOpts); } catch {}
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
                    .order('created_at', { ascending: false })
                    .limit(5);

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
        } catch {}

        const pollId = setInterval(() => {
            try { pollAccepted(); } catch {}
        }, 20_000);

        try { pollAccepted(); } catch {}

        return () => {
            mounted = false;
            try {
                if (channel) supabase.removeChannel(channel);
            } catch {}
            try { clearInterval(pollId); } catch {}
        };
    }, [supabase, user?.id, teamSession?.id, soundOpts]);

    const sendInvite = async (targetUser, workout, currentTeamSessionId = null) => {
        try {
            if (!user?.id) throw new Error('Usuário inválido');
            const targetUserId = targetUser?.id ? String(targetUser.id) : '';
            if (!targetUserId) throw new Error('Aluno inválido');

            let sessionId = currentTeamSessionId;

            if (!sessionId) {
                const { data: session, error } = await supabase
                    .from('team_sessions')
                    .insert({
                        host_uid: user.id,
                        status: 'active',
                        participants: [{ uid: user.id, name: user.displayName, photo: user.photoURL }]
                    })
                    .select()
                    .single();

                if (error) throw error;
                sessionId = session?.id;
                if (!sessionId) throw new Error('Falha ao criar sessão');

                setTeamSession({
                    id: sessionId,
                    isHost: true,
                    hostName: user.displayName,
                    participants: Array.isArray(session?.participants) ? session.participants : []
                });
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
        } catch (e) {
            const msg = e?.message || String(e || 'Erro ao enviar convite');
            throw new Error(msg);
        }
    };

    const acceptInvite = async (invite, onStartSession) => {
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
                participants: newParticipants
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
        } catch (e) {
            const msg = e?.message || String(e || 'Erro ao aceitar convite');
            throw new Error(msg);
        }
    };

    const rejectInvite = async (inviteId) => {
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
        setTeamSession(null);
        // Ideally we would remove ourselves from the participants list in DB too
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
            dismissAcceptedInvite,
            loading
        }}>
            {children}
        </TeamWorkoutContext.Provider>
    );
};
