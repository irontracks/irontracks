"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useInAppNotifications } from '@/contexts/InAppNotificationsContext';
import { FEATURE_KEYS, isFeatureEnabled } from '@/utils/featureFlags';
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'

import { useTeamSession } from './team/useTeamSession'
import { useTeamInvites } from './team/useTeamInvites'
import { useTeamBroadcast } from './team/useTeamBroadcast'
import { useTeamPresence } from './team/useTeamPresence'
import type { TeamWorkoutContextValue, TeamWorkoutProviderProps, JoinResult, TeamParticipant } from './team/types'

// Re-export types and constants so existing consumers don't break
export type { SharedLogsMap, SharedLogEntry, ChatMessage, SetChallengePayload, WorkoutEditPayload, ExerciseSharePayload, ExerciseControlUpdate } from './team/types'
export { MAX_TEAM_PARTICIPANTS, MAX_CHAT_MESSAGES } from './team/types'

const TeamWorkoutContext = createContext<TeamWorkoutContextValue | null>(null);

export const useTeamWorkout = () => {
    const context = useContext(TeamWorkoutContext);
    if (!context) {
        throw new Error('useTeamWorkout must be used within a TeamWorkoutProvider');
    }
    return context;
};

export const TeamWorkoutProvider = ({ children, user, settings, onStartSession }: TeamWorkoutProviderProps) => {
    const supabase = useMemo(() => createClient(), []);
    const { notify } = useInAppNotifications();
    const myDisplayNameRef = useRef<string>('')
    const myPhotoUrlRef = useRef<string | null>(null)

    // ── Settings memos ──────────────────────────────────────────────────────────
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

    // ── Populate display name and photo refs from the user's profile ────────────
    useEffect(() => {
        if (!user?.id) return
        const fetchProfile = async () => {
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('display_name, photo_url')
                    .eq('id', user.id)
                    .maybeSingle()
                if (data?.display_name) myDisplayNameRef.current = String(data.display_name).trim()
                if (data?.photo_url) myPhotoUrlRef.current = String(data.photo_url).trim()
            } catch (e) { logError('TeamWorkoutContext.fetchProfile', e) }
        }
        fetchProfile()
    }, [user?.id, supabase])

    // ── Compose hooks ───────────────────────────────────────────────────────────
    const session = useTeamSession({ user, supabase, teamworkV2Enabled })
    const { teamSession, setTeamSession } = session

    const invites = useTeamInvites({
        user,
        supabase,
        canReceiveInvites,
        teamSession,
        setTeamSession,
        teamworkV2Enabled,
        soundOpts,
        notify: notify as (notification: Record<string, unknown>) => void,
        onStartSession,
    })

    const presenceHook = useTeamPresence({ user, supabase, teamSession, teamworkV2Enabled })

    const broadcast = useTeamBroadcast({
        user,
        supabase,
        teamSession,
        setPresence: presenceHook.setPresence,
        notify: notify as (notification: Record<string, unknown>) => void,
        soundOpts,
        myDisplayNameRef,
        myPhotoUrlRef,
    })

    // ── Cross-cutting operations (need both session + broadcast) ────────────────

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
            setTeamSession({ id: sessionId, isHost: false, participants: parts as TeamParticipant[] });
            return { ok: true, teamSessionId: sessionId, participants: parts as TeamParticipant[], workout: (payload?.workout ?? null) as Record<string, unknown> | null };
        } catch (e: unknown) {
            return { ok: false, error: getErrorMessage(e) || String(e || '') };
        }
    }, [supabase, teamworkV2Enabled, setTeamSession]);

    const generateJoinCode = () => {
        const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let out = '';
        for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
        return out;
    };

    const createJoinCode = useCallback(async (workout: Record<string, unknown>, ttlMinutes = 90) => {
        try {
            if (!teamworkV2Enabled) return { ok: false, error: 'disabled' };
            if (!user?.id) throw new Error('Usuário inválido');
            const expiresAt = new Date(Date.now() + Math.max(10, Number(ttlMinutes) || 90) * 60_000).toISOString();
            const code = generateJoinCode();

            let sessionId = teamSession?.id ? String(teamSession.id) : '';
            let participants = teamSession?.participants || [];
            const u = user as { id: string; email?: string | null; displayName?: string; photoURL?: string | null };
            if (!sessionId) {
                const { data: sess, error } = await supabase
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
                sessionId = sess?.id ? String(sess.id) : '';
                participants = Array.isArray(sess?.participants) ? sess.participants : [];
                if (!sessionId) throw new Error('Falha ao criar sessão');
                setTeamSession({ id: sessionId, isHost: true, hostName: u.displayName, participants: participants as TeamParticipant[] });
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
    }, [supabase, teamworkV2Enabled, user, teamSession, setTeamSession]);

    const leaveSession = useCallback(async () => {
        try {
            const sid = teamSession?.id ? String(teamSession.id) : '';
            const u = user as { id: string; email?: string | null; displayName?: string }
            // Broadcast leave event to partners instantly
            const ch = broadcast.teamBroadcastChannelRef.current
            if (ch && user?.id) {
                try {
                    ch.send({
                        type: 'broadcast',
                        event: 'leave',
                        payload: { userId: user.id, displayName: u?.displayName || 'Usuário', ts: Date.now() },
                    })
                } catch { }
            }
            if (!sid) {
                setTeamSession(null);
                broadcast.clearSharedLogs();
                return;
            }
            if (teamworkV2Enabled) {
                try {
                    await supabase.rpc('leave_team_session', { p_session_id: sid });
                } catch (e) {
                    logError('TeamWorkoutContext.leaveSession', e)
                }
            }
            setTeamSession(null);
            broadcast.clearSharedLogs();
        } catch {
            setTeamSession(null);
            broadcast.clearSharedLogs();
        }
    }, [teamSession, user, broadcast, teamworkV2Enabled, supabase, setTeamSession]);

    // ── Auto-join from URL ──────────────────────────────────────────────────────
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
            if (session.joinHandledRef.current.has(key)) return;
            session.joinHandledRef.current.add(key);
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
    }, [joinByCode, onStartSession, teamworkV2Enabled, user?.id, session.joinHandledRef]);

    // ── Context value ───────────────────────────────────────────────────────────
    const ctxValue = useMemo(() => ({
        incomingInvites: invites.incomingInvites,
        acceptedInviteNotice: invites.acceptedInviteNotice,
        teamSession,
        sendInvite: invites.sendInvite,
        acceptInvite: invites.acceptInvite,
        rejectInvite: invites.rejectInvite,
        leaveSession,
        createJoinCode,
        joinByCode,
        setPresenceStatus: presenceHook.setPresenceStatus,
        presence: presenceHook.presence,
        dismissAcceptedInvite: invites.dismissAcceptedInvite,
        loading: session.loading,
        presenceStatus: presenceHook.presenceStatus,
        refetchInvites: invites.refetchInvites,
        sharedLogs: broadcast.sharedLogs,
        broadcastMyLog: broadcast.broadcastMyLog,
        chatMessages: broadcast.chatMessages,
        sendChatMessage: broadcast.sendChatMessage,
        sessionPaused: broadcast.sessionPaused,
        pauseSession: broadcast.pauseSession,
        resumeSession: broadcast.resumeSession,
        sendMultipleInvites: invites.sendMultipleInvites,
        pendingChallenge: broadcast.pendingChallenge,
        sendSetChallenge: broadcast.sendSetChallenge,
        dismissChallenge: broadcast.dismissChallenge,
        pendingWorkoutEdit: broadcast.pendingWorkoutEdit,
        broadcastWorkoutEdit: broadcast.broadcastWorkoutEdit,
        dismissWorkoutEdit: broadcast.dismissWorkoutEdit,
        incomingExerciseShare: broadcast.incomingExerciseShare,
        exerciseControlUpdates: broadcast.exerciseControlUpdates,
        shareExerciseWithPartner: broadcast.shareExerciseWithPartner,
        sendExerciseControlUpdate: broadcast.sendExerciseControlUpdate,
        endExerciseShare: broadcast.endExerciseShare,
        dismissExerciseShare: broadcast.dismissExerciseShare,
    }), [
        invites.incomingInvites, invites.acceptedInviteNotice, invites.sendInvite,
        invites.acceptInvite, invites.rejectInvite, invites.dismissAcceptedInvite,
        invites.refetchInvites, invites.sendMultipleInvites,
        teamSession, leaveSession, createJoinCode, joinByCode,
        presenceHook.setPresenceStatus, presenceHook.presence, presenceHook.presenceStatus,
        session.loading,
        broadcast.sharedLogs, broadcast.broadcastMyLog, broadcast.chatMessages,
        broadcast.sendChatMessage, broadcast.sessionPaused, broadcast.pauseSession,
        broadcast.resumeSession, broadcast.pendingChallenge, broadcast.sendSetChallenge,
        broadcast.dismissChallenge, broadcast.pendingWorkoutEdit, broadcast.broadcastWorkoutEdit,
        broadcast.dismissWorkoutEdit, broadcast.incomingExerciseShare,
        broadcast.exerciseControlUpdates, broadcast.shareExerciseWithPartner,
        broadcast.sendExerciseControlUpdate, broadcast.endExerciseShare,
        broadcast.dismissExerciseShare,
    ]);

    return (
        <TeamWorkoutContext.Provider value={ctxValue}>
            {children}
        </TeamWorkoutContext.Provider>
    );
};
