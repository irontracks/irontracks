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
            const { data } = await supabase
                .from('invites')
                .select('*, profiles:from_uid(display_name, photo_url)')
                .eq('to_uid', user.id)
                .eq('status', 'pending');
            if (data) {
                // Map to match expected structure
                const mapped = data.map(inv => ({
                    id: inv.id,
                    from: {
                        displayName: inv.profiles?.display_name || 'Unknown',
                        photoURL: inv.profiles?.photo_url,
                        uid: inv.from_uid
                    },
                    workout: inv.workout_data
                }));
                setIncomingInvites(mapped);
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
                    console.log("INVITE RECEIVED:", payload);
                    const newInvite = payload.new;
                    if (newInvite.status !== 'pending') return;

                    // Fetch sender profile info
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('display_name, photo_url')
                        .eq('id', newInvite.from_uid)
                        .single();

                    setIncomingInvites(prev => [...prev, {
                        id: newInvite.id,
                        from: {
                            displayName: profile?.display_name || 'Unknown',
                            photoURL: profile?.photo_url,
                            uid: newInvite.from_uid
                        },
                        workout: newInvite.workout_data
                    }]);
                    try { playStartSound(); } catch {}
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
                    const updated = payload.new;
                    if (updated.status === 'finished') {
                        setTeamSession(null); // End session
                    } else {
                        // Update participants list
                        setTeamSession(prev => ({
                            ...prev,
                            participants: updated.participants || []
                        }));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, teamSession?.id]);

    const sendInvite = async (targetUser, workout, currentTeamSessionId = null) => {
        let sessionId = currentTeamSessionId;

        // Create a session if it doesn't exist yet
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
            sessionId = session.id;
            
            // Set me as host
            setTeamSession({
                id: sessionId,
                isHost: true,
                hostName: user.displayName,
                participants: session.participants
            });
        }

        // Send the invite
        const { error: inviteError } = await supabase
            .from('invites')
            .insert({
                from_uid: user.id,
                to_uid: targetUser.id, // targetUser must have 'id' (which is uid)
                workout_data: workout,
                team_session_id: sessionId,
                status: 'pending'
            });

        if (inviteError) throw inviteError;
        return sessionId;
    };

    const acceptInvite = async (invite, onStartSession) => {
        // 1. Get the session details
        const { data: inviteData } = await supabase
            .from('invites')
            .select('team_session_id')
            .eq('id', invite.id)
            .single();

        if (!inviteData) throw new Error("Convite inválido");

        // 2. Update session participants
        const { data: sessionData } = await supabase
            .from('team_sessions')
            .select('participants')
            .eq('id', inviteData.team_session_id)
            .single();

        if (sessionData) {
            const newParticipants = [
                ...(sessionData.participants || []),
                { uid: user.id, name: user.displayName, photo: user.photoURL }
            ];

            await supabase
                .from('team_sessions')
                .update({ participants: newParticipants })
                .eq('id', inviteData.team_session_id);
            
            // Set local state
            setTeamSession({
                id: inviteData.team_session_id,
                isHost: false,
                participants: newParticipants
            });
        }

        // 3. Mark invite as accepted
        await supabase
            .from('invites')
            .update({ status: 'accepted' })
            .eq('id', invite.id);

        // 4. Remove from local list
        setIncomingInvites(prev => prev.filter(i => i.id !== invite.id));

        // 5. Trigger app start
        if (onStartSession) onStartSession(invite.workout);
    };

    const rejectInvite = async (inviteId) => {
        await supabase
            .from('invites')
            .update({ status: 'rejected' })
            .eq('id', inviteId);
        
        setIncomingInvites(prev => prev.filter(i => i.id !== inviteId));
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
