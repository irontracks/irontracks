import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { playStartSound } from '@/lib/sounds';

const TeamWorkoutContext = createContext({
    incomingInvites: [],
    teamSession: null,
    sendInvite: async () => { },
    acceptInvite: async () => { },
    rejectInvite: async () => { },
    leaveSession: async () => { },
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
    const [teamSession, setTeamSession] = useState(null);
    const [loading, setLoading] = useState(false);
    const supabase = useMemo(() => createClient(), []);

    // 1. Listen for Incoming Invites
    useEffect(() => {
        if (!user?.id) return;

        // Fetch initial pending invites
        const fetchInvites = async () => {
            try {
                const { data } = await supabase
                    .from('invites')
                    .select('*, profiles:from_uid(display_name, photo_url)')
                    .eq('to_uid', user.id)
                    .eq('status', 'pending');
                const list = Array.isArray(data) ? data : [];
                const mapped = list
                    .filter((inv) => inv && typeof inv === 'object')
                    .map(inv => ({
                        id: inv.id,
                        from: {
                            displayName: inv.profiles?.display_name || 'Unknown',
                            photoURL: inv.profiles?.photo_url,
                            uid: inv.from_uid
                        },
                        workout: inv.workout_data
                    }));
                setIncomingInvites(mapped);
            } catch {
                setIncomingInvites([]);
            }
        };
        fetchInvites();

        // Subscribe to new invites
        console.log("Subscribing to invites for user:", user.id);
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
                        console.log("INVITE RECEIVED:", payload);
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
                            return [...current, {
                                id: newInvite.id,
                                from: {
                                    displayName: profile?.display_name || 'Unknown',
                                    photoURL: profile?.photo_url,
                                    uid: newInvite.from_uid
                                },
                                workout: newInvite.workout_data
                            }];
                        });
                        try { playStartSound(); } catch {}
                    } catch {
                        return;
                    }
                }
            )
            .subscribe((status) => {
                console.log("SUBSCRIPTION STATUS:", status);
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, user?.id]);

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

            const { data: inviteData } = await supabase
                .from('invites')
                .select('team_session_id')
                .eq('id', inviteId)
                .single();

            const teamSessionId = inviteData?.team_session_id;
            if (!teamSessionId) throw new Error('Sessão inválida');

            const { data: sessionData } = await supabase
                .from('team_sessions')
                .select('participants')
                .eq('id', teamSessionId)
                .single();

            const existingParticipants = Array.isArray(sessionData?.participants) ? sessionData.participants : [];
            const newParticipants = [
                ...existingParticipants,
                { uid: user.id, name: user.displayName, photo: user.photoURL }
            ];

            await supabase
                .from('team_sessions')
                .update({ participants: newParticipants })
                .eq('id', teamSessionId);

            setTeamSession({
                id: teamSessionId,
                isHost: false,
                participants: newParticipants
            });

            await supabase
                .from('invites')
                .update({ status: 'accepted' })
                .eq('id', inviteId);

            setIncomingInvites(prev => {
                const current = Array.isArray(prev) ? prev : [];
                return current.filter(i => String(i?.id || '') !== inviteId);
            });

            if (onStartSession) onStartSession(invite?.workout);
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

    return (
        <TeamWorkoutContext.Provider value={{
            incomingInvites,
            teamSession,
            sendInvite,
            acceptInvite,
            rejectInvite,
            leaveSession,
            loading
        }}>
            {children}
        </TeamWorkoutContext.Provider>
    );
};
