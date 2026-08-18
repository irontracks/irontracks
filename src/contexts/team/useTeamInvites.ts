'use client'

import { useState, useEffect, useMemo } from 'react'
import { useLazyRef } from '@/hooks/useLazyRef'
import type { SupabaseClient } from '@supabase/supabase-js'
import { playStartSound } from '@/lib/sounds'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'
import type {
    TeamSession,
    TeamParticipant,
    IncomingInvite,
    AcceptedInviteNotice,
} from './types'
import { MAX_TEAM_PARTICIPANTS, buildParticipantRecord } from './types'

interface UseTeamInvitesParams {
    user: { id: string; email?: string | null } | null
    supabase: SupabaseClient
    canReceiveInvites: boolean
    teamSession: TeamSession | null
    setTeamSession: React.Dispatch<React.SetStateAction<TeamSession | null>>
    teamworkV2Enabled: boolean
    soundOpts: { enabled: boolean; volume: number }
    notify: (notification: Record<string, unknown>) => void
    onStartSession?: (workout: Record<string, unknown>) => void
    /** Nome/foto reais do usuário (perfil) — pro host ser gravado corretamente. */
    myDisplayNameRef: React.MutableRefObject<string>
    myPhotoUrlRef: React.MutableRefObject<string | null>
}

export function useTeamInvites({
    user,
    supabase,
    canReceiveInvites,
    teamSession,
    setTeamSession,
    teamworkV2Enabled,
    soundOpts,
    notify,
    onStartSession: _onStartSession,
    myDisplayNameRef,
    myPhotoUrlRef,
}: UseTeamInvitesParams) {
    const [incomingInvites, setIncomingInvites] = useState<IncomingInvite[]>([])
    const [acceptedInviteNotice, setAcceptedInviteNotice] = useState<AcceptedInviteNotice | null>(null)
    // Lazy init pra evitar alocação de Set a cada render (audit Finding #12).
    const seenAcceptedInviteIdsRef = useLazyRef(() => new Set<unknown>())

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
                    .select('*')
                    .eq('to_uid', safeUserId)
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false });
                const list = Array.isArray(data) ? data : [];
                // O nome/foto do remetente vem de profiles_public (a tabela profiles
                // está trancada por RLS — o embed devolvia null e mostrava "Alguém").
                const fromIds = Array.from(new Set(list.map(i => String(i?.from_uid || '')).filter(Boolean)));
                const profById = new Map<string, { display_name?: string | null; photo_url?: string | null }>();
                if (fromIds.length) {
                    try {
                        const { data: profs } = await supabase
                            .from('profiles_public')
                            .select('id, display_name, photo_url')
                            .in('id', fromIds);
                        for (const p of Array.isArray(profs) ? profs : []) {
                            if (p?.id) profById.set(String(p.id), { display_name: p.display_name ?? null, photo_url: p.photo_url ?? null });
                        }
                    } catch (e) { logError('useTeamInvites.refetchInvites.profiles', e); }
                }
                const mapped = list
                    .filter((inv) => inv && typeof inv === 'object')
                    .map(inv => {
                        const prof = profById.get(String(inv.from_uid || '')) ?? null;
                        return {
                            id: inv.id,
                            created_at: inv.created_at,
                            from_uid: inv.from_uid,
                            team_session_id: inv.team_session_id ?? null,
                            status: inv.status,
                            workout_data: inv.workout_data ?? null,
                            profiles: prof,
                            from: {
                                displayName: prof?.display_name || 'Alguém',
                                photoURL: prof?.photo_url,
                                uid: inv.from_uid
                            },
                            workout: inv.workout_data
                        };
                    });
                setIncomingInvites(mapped as IncomingInvite[]);
            } catch (e) {
                logError('useTeamInvites.refetchInvites', e);
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
                            .from('profiles_public')
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
                                workout_data: (newInvite.workout_data ?? null) as Record<string, unknown> | null,
                                profiles: profile && typeof profile === 'object' ? { display_name: profile.display_name ?? null, photo_url: profile.photo_url ?? null } : null,
                                from: {
                                    displayName: profile?.display_name || 'Alguém',
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
                        } catch (e) { logError('useTeamInvites.notifyInvite', e) }
                        try { playStartSound(soundOpts); } catch { }
                    } catch (e) {
                        logError('useTeamInvites.onInsertInvite', e);
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
                    } catch (e) {
                        logError('useTeamInvites.onUpdateInvite', e);
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
        const _refetch = async () => {
            try {
                const { data } = await supabase
                    .from('invites')
                    .select('*')
                    .eq('to_uid', safeUserId)
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false });
                if (!mounted) return;
                const list = Array.isArray(data) ? data : [];
                const fromIds = Array.from(new Set(list.map(i => String(i?.from_uid || '')).filter(Boolean)));
                const profById = new Map<string, { display_name?: string | null; photo_url?: string | null }>();
                if (fromIds.length) {
                    try {
                        const { data: profs } = await supabase
                            .from('profiles_public')
                            .select('id, display_name, photo_url')
                            .in('id', fromIds);
                        for (const p of Array.isArray(profs) ? profs : []) {
                            if (p?.id) profById.set(String(p.id), { display_name: p.display_name ?? null, photo_url: p.photo_url ?? null });
                        }
                    } catch (e) { logError('useTeamInvites.fallbackRefetch.profiles', e); }
                }
                if (!mounted) return;
                const mapped = list
                    .filter((inv) => inv && typeof inv === 'object')
                    .map(inv => {
                        const prof = profById.get(String(inv.from_uid || '')) ?? null;
                        return {
                            id: inv.id,
                            created_at: inv.created_at,
                            from_uid: inv.from_uid,
                            team_session_id: inv.team_session_id ?? null,
                            status: inv.status,
                            workout_data: inv.workout_data ?? null,
                            profiles: prof,
                            from: {
                                displayName: prof?.display_name || 'Alguém',
                                photoURL: prof?.photo_url,
                                uid: inv.from_uid
                            },
                            workout: inv.workout_data
                        };
                    });
                setIncomingInvites(mapped as IncomingInvite[]);
            } catch (e) {
                logError('useTeamInvites.fallbackRefetch', e);
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
                    } catch (e) {
                        logError('useTeamInvites.onNotificationInsert', e);
                        return;
                    }
                }
            )
            .subscribe();

        const POLL_MS = 20_000;
        // B-010: pausa o poll de 20s quando aba está em background (drenava quota Supabase).
        // Integra com o handleVisibility existente (que já faz refetch ao retornar) pra
        // não duplicar listener — pausa o interval em hidden e retoma em visible.
        let pollId: ReturnType<typeof setInterval> | null = null;
        const startPoll = () => {
            if (pollId !== null) return;
            pollId = setInterval(() => {
                try { refetchInvites(); } catch { }
            }, POLL_MS);
        };
        const stopPoll = () => {
            if (pollId !== null) {
                clearInterval(pollId);
                pollId = null;
            }
        };

        const handleVisibility = () => {
            try {
                if (typeof document === 'undefined') return;
                if (document.visibilityState === 'visible') {
                    refetchInvites();
                    startPoll();
                } else {
                    stopPoll();
                }
            } catch { }
        };
        const handleFocus = () => {
            try { refetchInvites(); } catch { }
        };

        // Inicia o poll só se já estivermos visíveis.
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
            startPoll();
        }

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
            stopPoll();
            try {
                if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibility);
            } catch { }
            try {
                if (typeof window !== 'undefined') window.removeEventListener('focus', handleFocus);
            } catch { }
        };
    }, [supabase, user?.id, refetchInvites, canReceiveInvites, soundOpts]);

    // 3. Host: listen for invite acceptance (realtime + polling fallback)
    useEffect(() => {
        const userId = user?.id ? String(user.id) : '';
        if (!userId) return;
        let mounted = true;
        let channel = null;

        const showAccepted = async (inviteRow: unknown) => {
            try {
                if (!mounted) return;
                const row = inviteRow && typeof inviteRow === 'object' ? (inviteRow as Record<string, unknown>) : {};
                const id = row?.id ? String(row.id) : '';
                if (!id) return;
                if (seenAcceptedInviteIdsRef.current.has(id)) return;
                seenAcceptedInviteIdsRef.current.add(id);

                const toUid = row?.to_uid ? String(row.to_uid) : '';
                const teamSessionId = row?.team_session_id ? String(row.team_session_id) : '';

                let profile = null;
                if (toUid) {
                    const { data } = await supabase
                        .from('profiles_public')
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
            } catch (e) {
                logError('useTeamInvites.showAccepted', e);
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
            } catch (e) {
                logError('useTeamInvites.pollAccepted', e);
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
                        } catch (e) {
                            logError('useTeamInvites.onAcceptedUpdate', e);
                            return;
                        }
                    }
                )
                .subscribe();
        } catch (e) { logError('useTeamInvites.subscribeAccepted', e) }

        // B-010: pausa o poll de 20s quando aba está em background (drenava quota Supabase).
        // Ao voltar pra visible, dispara 1 pollAccepted imediato pra recuperar invites
        // aceitos durante o background sem esperar o próximo tick.
        let pollId: ReturnType<typeof setInterval> | null = null;
        const startPoll = () => {
            if (pollId !== null) return;
            pollId = setInterval(() => {
                try { pollAccepted(); } catch { }
            }, 20_000);
        };
        const stopPoll = () => {
            if (pollId !== null) {
                clearInterval(pollId);
                pollId = null;
            }
        };
        const onVisibilityChange = () => {
            try {
                if (typeof document === 'undefined' || !mounted) return;
                if (document.hidden) {
                    stopPoll();
                } else {
                    pollAccepted();
                    startPoll();
                }
            } catch { }
        };

        if (typeof document === 'undefined' || !document.hidden) startPoll();
        try {
            if (typeof document !== 'undefined') {
                document.addEventListener('visibilitychange', onVisibilityChange);
            }
        } catch { }

        try { pollAccepted(); } catch { }

        return () => {
            mounted = false;
            try {
                if (channel) supabase.removeChannel(channel);
            } catch { }
            stopPoll();
            try {
                if (typeof document !== 'undefined') {
                    document.removeEventListener('visibilitychange', onVisibilityChange);
                }
            } catch { }
        };
    }, [supabase, user?.id, teamSession?.id, soundOpts, seenAcceptedInviteIdsRef]);

    const sendInvite = async (targetUser: unknown, workout: Record<string, unknown>, currentTeamSessionId: string | null = null) => {
        try {
            if (!user?.id) throw new Error('Usuário inválido');
            const targetUserObj = targetUser && typeof targetUser === 'object' ? (targetUser as { id: string }) : null;
            if (!targetUserObj?.id) throw new Error('Aluno inválido');
            const targetUserId = String(targetUserObj.id);

            // Reaproveita a sessão existente quando o caller não passa o id
            // (ex.: botão de convite no header do treino ativo) — sem isto, um
            // segundo convite criava outra team_session e abandonava o 1º parceiro.
            let sessionId = currentTeamSessionId || (teamSession?.id ? String(teamSession.id) : undefined);
            // Enforce max participants (5)
            const currentParticipants = teamSession?.participants ?? [];
            if (currentParticipants.length >= MAX_TEAM_PARTICIPANTS) {
                throw new Error(`Sessão cheia. Máximo de ${MAX_TEAM_PARTICIPANTS} participantes.`);
            }

            if (!sessionId) {
                const { data: session, error } = await supabase
                    .from('team_sessions')
                    .insert({
                        host_uid: user.id,
                        status: 'active',
                        participants: [buildParticipantRecord(user.id, myDisplayNameRef.current, myPhotoUrlRef.current)]
                    })
                    .select()
                    .single();

                if (error) throw error;
                sessionId = session?.id;
                if (!sessionId) throw new Error('Falha ao criar sessão');

                setTeamSession({
                    id: sessionId,
                    isHost: true,
                    hostName: myDisplayNameRef.current || undefined,
                    participants: (Array.isArray(session?.participants) ? session.participants : []) as unknown as TeamParticipant[]
                });

                if (teamworkV2Enabled) {
                    try {
                        await supabase.from('team_session_presence').upsert(
                            { session_id: sessionId, user_id: user.id, status: 'online' },
                            { onConflict: 'session_id,user_id' }
                        );
                    } catch (e) { logError('useTeamInvites.upsertPresence', e) }
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

            // Fire a lock-screen push to the recipient. The invite row itself
            // is realtime-delivered by the 'invites' subscription, but realtime
            // only fires if the recipient's app is running. Without this push
            // the user sees nothing on the lock screen when their friend invites
            // them to a workout.
            try {
                const workoutTitle =
                    (typeof workout?.title === 'string' && workout.title) ||
                    (typeof workout?.name === 'string' && workout.name) ||
                    'Treino';
                void fetch('/api/team/invite/notify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    cache: 'no-store',
                    body: JSON.stringify({
                        targetUserId,
                        workoutTitle: String(workoutTitle).slice(0, 120),
                        sessionId: sessionId ?? undefined,
                    }),
                }).catch((e) => { logError('useTeamInvites.notifyPush.fetch', e); });
            } catch (e) {
                logError('useTeamInvites.notifyPush', e);
            }

            return sessionId;
        } catch (e: unknown) {
            const msg = getErrorMessage(e) || String(e || 'Erro ao enviar convite');
            throw new Error(msg);
        }
    };

    const sendMultipleInvitesImpl = async (targets: unknown[], workout: Record<string, unknown>, _sendInvite: typeof sendInvite): Promise<Array<{ userId: string; ok: boolean; error?: string }>> => {
        const targetList = Array.isArray(targets) ? targets : []
        const slots = MAX_TEAM_PARTICIPANTS - (teamSession?.participants?.length ?? 0)
        const toInvite = targetList.slice(0, Math.max(0, slots))
        if (toInvite.length === 0) {
            return [{ userId: '', ok: false, error: `Sessão cheia. Máximo de ${MAX_TEAM_PARTICIPANTS} participantes.` }]
        }
        let createdSessionId: string | null = teamSession?.id ?? null
        const results: Array<{ userId: string; ok: boolean; error?: string }> = []
        for (const target of toInvite) {
            const tObj = target && typeof target === 'object' ? (target as { id?: string }) : null
            const uid = String(tObj?.id || '').trim()
            try {
                // Usa o sessionId RETORNADO (o state teamSession não atualiza dentro
                // do loop) — assim todos os convites entram na MESMA sessão.
                const sid = await _sendInvite(target, workout, createdSessionId)
                if (!createdSessionId && sid) createdSessionId = String(sid)
                results.push({ userId: uid, ok: true })
            } catch (e: unknown) {
                results.push({ userId: uid, ok: false, error: e instanceof Error ? e.message : String(e || '') })
            }
        }
        return results
    }

    // sendMultipleInvites must be declared AFTER sendInvite to avoid forward-reference lint errors
    const sendMultipleInvites = (targets: unknown[], workout: Record<string, unknown>) =>
        sendMultipleInvitesImpl(targets, workout, sendInvite)

    const acceptInvite = async (invite: IncomingInvite, onStartSessionCb?: (workout: Record<string, unknown>) => void) => {
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
                participants: newParticipants as TeamParticipant[]
            });

            setIncomingInvites(prev => {
                const current = Array.isArray(prev) ? prev : [];
                return current.filter(i => String(i?.id || '') !== inviteId);
            });

            // R9#2: Only mark this specific invite's notification as read (was marking ALL)
            try {
                await supabase
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('user_id', user.id)
                    .eq('type', 'invite')
                    .filter('metadata->>invite_id', 'eq', inviteId);
            } catch (e) {
                logError('useTeamInvites.markNotificationRead', e)
            }

            if (onStartSessionCb) onStartSessionCb(workoutFromInvite);

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
            // R9#1: Add to_uid filter to prevent IDOR — any user could reject any invite
            await supabase
                .from('invites')
                .update({ status: 'rejected' })
                .eq('id', safeId)
                .eq('to_uid', user?.id || '')
                // Só recusa se ainda estiver pendente — evita reverter um 'accepted'
                // feito em outro device (usuário logado em 2 aparelhos).
                .eq('status', 'pending');

            setIncomingInvites(prev => {
                const current = Array.isArray(prev) ? prev : [];
                return current.filter(i => String(i?.id || '') !== safeId);
            });
        } catch {
            setIncomingInvites(prev => (Array.isArray(prev) ? prev : []));
        }
    };

    const dismissAcceptedInvite = () => {
        setAcceptedInviteNotice(null);
    };

    return {
        incomingInvites,
        acceptedInviteNotice,
        sendInvite,
        acceptInvite,
        rejectInvite,
        refetchInvites,
        dismissAcceptedInvite,
        sendMultipleInvites,
    }
}
