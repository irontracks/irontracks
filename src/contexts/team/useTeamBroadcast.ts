'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { playStartSound } from '@/lib/sounds'
import { logError } from '@/lib/logger'
import type {
    TeamSession,
    SharedLogsMap,
    ChatMessage,
    SetChallengePayload,
    WorkoutEditPayload,
    ExerciseSharePayload,
    ExerciseControlUpdate,
} from './types'
import { MAX_CHAT_MESSAGES } from './types'

import type { PresenceStatus } from './types'

interface UseTeamBroadcastParams {
    user: { id: string; email?: string | null } | null
    supabase: SupabaseClient
    teamSession: TeamSession | null
    setPresence: React.Dispatch<React.SetStateAction<Record<string, { status: PresenceStatus; last_seen?: string }>>>
    notify: (notification: Record<string, unknown>) => void
    soundOpts: { enabled: boolean; volume: number }
    myDisplayNameRef: React.MutableRefObject<string>
    myPhotoUrlRef: React.MutableRefObject<string | null>
}

export function useTeamBroadcast({
    user,
    supabase,
    teamSession,
    setPresence,
    notify,
    soundOpts,
    myDisplayNameRef,
    myPhotoUrlRef,
}: UseTeamBroadcastParams) {
    // Live progress sync
    const [sharedLogs, setSharedLogs] = useState<SharedLogsMap>({})
    const teamBroadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
    // Chat
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
    // Pause state
    const [sessionPaused, setSessionPaused] = useState(false)
    // Set challenge
    const [pendingChallenge, setPendingChallenge] = useState<SetChallengePayload | null>(null)
    // Workout edit sync
    const [pendingWorkoutEdit, setPendingWorkoutEdit] = useState<WorkoutEditPayload | null>(null)
    // Partner exercise control
    const [incomingExerciseShare, setIncomingExerciseShare] = useState<ExerciseSharePayload | null>(null)
    const [exerciseControlUpdates, setExerciseControlUpdates] = useState<ExerciseControlUpdate[]>([])

    // ── Broadcast channel for real-time log sharing between teammates ─────────
    useEffect(() => {
        if (!teamSession?.id || !user?.id) {
            setSharedLogs({})
            if (teamBroadcastChannelRef.current) {
                try { supabase.removeChannel(teamBroadcastChannelRef.current) } catch { }
                teamBroadcastChannelRef.current = null
            }
            return
        }
        if (teamBroadcastChannelRef.current) {
            try { supabase.removeChannel(teamBroadcastChannelRef.current) } catch { }
        }
        const ch = supabase
            .channel(`team_logs:${teamSession.id}`, { config: { broadcast: { self: false, ack: true } } })
            .on('broadcast', { event: 'log_update' }, (msg) => {
                const payload = msg?.payload && typeof msg.payload === 'object' ? msg.payload as Record<string, unknown> : null
                if (!payload) return
                const fromUid = String(payload.userId || '').trim()
                const exIdx = Number(payload.exIdx)
                const sIdx = Number(payload.sIdx)
                const weight = String(payload.weight ?? '')
                const reps = String(payload.reps ?? '')
                const ts = Number(payload.ts || Date.now())
                if (!fromUid || !Number.isFinite(exIdx) || !Number.isFinite(sIdx)) return
                if (fromUid === String(user.id || '').trim()) return
                const key = `${exIdx}-${sIdx}`
                setSharedLogs(prev => ({
                    ...prev,
                    [fromUid]: { ...(prev[fromUid] ?? {}), [key]: { exIdx, sIdx, weight, reps, ts } }
                }))
            })
            .on('broadcast', { event: 'leave' }, (msg) => {
                const payload = msg?.payload && typeof msg.payload === 'object' ? msg.payload as Record<string, unknown> : null
                if (!payload) return
                const fromUid = String(payload.userId || '').trim()
                if (!fromUid) return
                try {
                    const name = String(payload.displayName || 'Seu parceiro').trim()
                    notify({
                        id: `leave:${fromUid}:${Date.now()}`,
                        type: 'team_leave',
                        senderName: name,
                        displayName: name,
                        photoURL: null,
                        text: `${name} saiu do treino em equipe.`,
                    })
                } catch { }
                setSharedLogs(prev => { const next = { ...prev }; delete next[fromUid]; return next })
                setPresence(prev => { const next = { ...prev }; delete next[fromUid]; return next })
            })
            // Chat messages are now delivered via postgres_changes on `messages` table (see useEffect below)
            // Broadcast is no longer used for chat — removed for reliability
            .on('broadcast', { event: 'pause' }, (msg) => {
                const payload = msg?.payload && typeof msg.payload === 'object' ? msg.payload as Record<string, unknown> : null
                if (!payload) return
                const fromUid = String(payload.userId || '').trim()
                if (!fromUid || fromUid === String(user?.id || '').trim()) return
                const name = String(payload.displayName || 'Seu parceiro').trim()
                setSessionPaused(true)
                try {
                    notify({ id: `pause:${fromUid}:${Date.now()}`, type: 'team_pause', senderName: name, displayName: name, photoURL: null, text: `${name} pausou o treino.` })
                } catch { }
            })
            .on('broadcast', { event: 'resume' }, (msg) => {
                const payload = msg?.payload && typeof msg.payload === 'object' ? msg.payload as Record<string, unknown> : null
                if (!payload) return
                const fromUid = String(payload.userId || '').trim()
                if (!fromUid || fromUid === String(user?.id || '').trim()) return
                const name = String(payload.displayName || 'Seu parceiro').trim()
                setSessionPaused(false)
                try {
                    notify({ id: `resume:${fromUid}:${Date.now()}`, type: 'team_resume', senderName: name, displayName: name, photoURL: null, text: `${name} retomou o treino! 💪` })
                } catch { }
            })
            .on('broadcast', { event: 'set_challenge' }, (msg) => {
                const payload = msg?.payload && typeof msg.payload === 'object' ? msg.payload as Record<string, unknown> : null
                if (!payload) return
                const fromUid = String(payload.fromUserId || '').trim()
                if (!fromUid || fromUid === String(user?.id || '').trim()) return
                const challenge: SetChallengePayload = {
                    id: String(payload.id || `${fromUid}:${Date.now()}`),
                    fromUserId: fromUid,
                    fromName: String(payload.fromName || 'Parceiro'),
                    exName: String(payload.exName || ''),
                    weight: Number(payload.weight ?? 0),
                    reps: Number(payload.reps ?? 0),
                    ts: Number(payload.ts || Date.now()),
                }
                setPendingChallenge(challenge)
                try {
                    notify({ id: `challenge:${fromUid}:${Date.now()}`, type: 'team_challenge', senderName: challenge.fromName, displayName: challenge.fromName, photoURL: null, text: `${challenge.fromName} te desafiou no ${challenge.exName || 'treino'}! 🔥` })
                } catch { }
            })
            // ─ Workout edit sync ─────────────────────────────────────────────
            .on('broadcast', { event: 'workout_edit' }, (msg) => {
                const payload = msg?.payload && typeof msg.payload === 'object' ? msg.payload as Record<string, unknown> : null
                if (!payload) return
                const fromUid = String(payload.fromUserId || '').trim()
                if (!fromUid || fromUid === String(user?.id || '').trim()) return
                const workout = payload.workout && typeof payload.workout === 'object' ? payload.workout as Record<string, unknown> : null
                if (!workout) return
                const edit: WorkoutEditPayload = {
                    id: String(payload.id || `${fromUid}:${Date.now()}`),
                    fromUserId: fromUid,
                    fromName: String(payload.fromName || 'Parceiro'),
                    workout,
                    ts: Number(payload.ts || Date.now()),
                }
                setPendingWorkoutEdit(edit)
                try {
                    notify({ id: `workout_edit:${fromUid}:${Date.now()}`, type: 'team_workout_edit', senderName: edit.fromName, displayName: edit.fromName, photoURL: null, text: `${edit.fromName} editou o treino. Aceitar as mudanças?` })
                } catch { }
                try { playStartSound(soundOpts); } catch { }
            })
            // ─ Partner exercise share ───────────────────────────────────────
            .on('broadcast', { event: 'exercise_share_request' }, (msg) => {
                const payload = msg?.payload && typeof msg.payload === 'object' ? msg.payload as Record<string, unknown> : null
                if (!payload) return
                const fromUid = String(payload.fromUserId || '').trim()
                if (!fromUid || fromUid === String(user?.id || '').trim()) return
                const share: ExerciseSharePayload = {
                    id: String(payload.id || `${fromUid}:${Date.now()}`),
                    fromUserId: fromUid,
                    fromName: String(payload.fromName || 'Parceiro'),
                    exerciseIdx: Number(payload.exerciseIdx ?? 0),
                    exercise: payload.exercise && typeof payload.exercise === 'object' ? payload.exercise as Record<string, unknown> : {},
                    logs: payload.logs && typeof payload.logs === 'object' ? payload.logs as Record<string, unknown> : {},
                    context: payload.context && typeof payload.context === 'object' ? payload.context as Record<string, unknown> : null,
                    ts: Number(payload.ts || Date.now()),
                }
                setIncomingExerciseShare(share)
                try {
                    notify({ id: `exercise_share:${fromUid}:${Date.now()}`, type: 'team_exercise_share', senderName: share.fromName, displayName: share.fromName, photoURL: null, text: `${share.fromName} compartilhou ${String(share.exercise?.name || 'exercício')} com você! 🏋️` })
                } catch { }
                try { playStartSound(soundOpts) } catch { }
            })
            .on('broadcast', { event: 'exercise_control_update' }, (msg) => {
                const payload = msg?.payload && typeof msg.payload === 'object' ? msg.payload as Record<string, unknown> : null
                if (!payload) return
                const fromUid = String(payload.fromUserId || '').trim()
                if (!fromUid || fromUid === String(user?.id || '').trim()) return
                const update: ExerciseControlUpdate = {
                    fromUserId: fromUid,
                    exerciseIdx: Number(payload.exerciseIdx ?? 0),
                    setIdx: Number(payload.setIdx ?? 0),
                    patch: payload.patch && typeof payload.patch === 'object' ? payload.patch as Record<string, unknown> : {},
                    ts: Number(payload.ts || Date.now()),
                }
                setExerciseControlUpdates(prev => [...prev, update])
            })
            .on('broadcast', { event: 'exercise_share_end' }, (msg) => {
                const payload = msg?.payload && typeof msg.payload === 'object' ? msg.payload as Record<string, unknown> : null
                if (!payload) return
                const fromUid = String(payload.fromUserId || '').trim()
                if (!fromUid || fromUid === String(user?.id || '').trim()) return
                const name = String(payload.fromName || 'Parceiro')
                try {
                    notify({ id: `exercise_share_end:${fromUid}:${Date.now()}`, type: 'team_exercise_share_end', senderName: name, displayName: name, photoURL: null, text: `${name} finalizou o controle do exercício ✅` })
                } catch { }
                setExerciseControlUpdates([])
            })
            .subscribe()
        teamBroadcastChannelRef.current = ch
        return () => {
            try { supabase.removeChannel(ch) } catch { }
            teamBroadcastChannelRef.current = null
        }
    }, [supabase, teamSession?.id, user?.id, notify])

    const broadcastMyLog = useCallback((exIdx: number, sIdx: number, weight: string, reps: string) => {
        const ch = teamBroadcastChannelRef.current
        if (!ch || !user?.id) return
        try {
            ch.send({ type: 'broadcast', event: 'log_update', payload: { userId: user.id, exIdx, sIdx, weight, reps, ts: Date.now() } })
        } catch (e) { logError('useTeamBroadcast.broadcastMyLog', e) }
    }, [user?.id])

    const sendSetChallenge = useCallback((exName: string, weight: number, reps: number) => {
        const ch = teamBroadcastChannelRef.current
        if (!ch || !user?.id) return
        const id = `${user.id}:${Date.now()}`
        const payload: SetChallengePayload = {
            id,
            fromUserId: user.id,
            fromName: myDisplayNameRef.current || 'Parceiro',
            exName,
            weight,
            reps,
            ts: Date.now(),
        }
        try {
            ch.send({ type: 'broadcast', event: 'set_challenge', payload })
        } catch (e) { logError('useTeamBroadcast.sendSetChallenge', e) }
    }, [user?.id, myDisplayNameRef])

    const dismissChallenge = useCallback(() => setPendingChallenge(null), [])

    const broadcastWorkoutEdit = useCallback((workout: Record<string, unknown>) => {
        const ch = teamBroadcastChannelRef.current
        if (!ch || !user?.id) return
        const id = `${user.id}:${Date.now()}`
        const payload: WorkoutEditPayload = {
            id,
            fromUserId: user.id,
            fromName: myDisplayNameRef.current || 'Parceiro',
            workout,
            ts: Date.now(),
        }
        try {
            ch.send({ type: 'broadcast', event: 'workout_edit', payload })
        } catch (e) { logError('useTeamBroadcast.broadcastWorkoutEdit', e) }
    }, [user?.id, myDisplayNameRef])

    const dismissWorkoutEdit = useCallback(() => setPendingWorkoutEdit(null), [])

    // ── Partner exercise control ─────────────────────────────────────────────────────
    const shareExerciseWithPartner = useCallback((exerciseIdx: number, exercise: Record<string, unknown>, logs: Record<string, unknown>, context?: Record<string, unknown> | null) => {
        const ch = teamBroadcastChannelRef.current
        if (!ch || !user?.id) return
        const id = `${user.id}:${Date.now()}`
        const payload: ExerciseSharePayload = {
            id,
            fromUserId: user.id,
            fromName: myDisplayNameRef.current || 'Parceiro',
            exerciseIdx,
            exercise,
            logs,
            context: context || null,
            ts: Date.now(),
        }
        try {
            ch.send({ type: 'broadcast', event: 'exercise_share_request', payload })
        } catch (e) { logError('useTeamBroadcast.shareExerciseWithPartner', e) }
    }, [user?.id, myDisplayNameRef])

    const sendExerciseControlUpdate = useCallback((exerciseIdx: number, setIdx: number, patch: Record<string, unknown>) => {
        const ch = teamBroadcastChannelRef.current
        if (!ch || !user?.id) return
        try {
            ch.send({ type: 'broadcast', event: 'exercise_control_update', payload: { fromUserId: user.id, exerciseIdx, setIdx, patch, ts: Date.now() } })
        } catch (e) { logError('useTeamBroadcast.sendExerciseControlUpdate', e) }
    }, [user?.id])

    const endExerciseShare = useCallback(() => {
        const ch = teamBroadcastChannelRef.current
        if (!ch || !user?.id) return
        try {
            ch.send({ type: 'broadcast', event: 'exercise_share_end', payload: { fromUserId: user.id, fromName: myDisplayNameRef.current || 'Parceiro', ts: Date.now() } })
        } catch (e) { logError('useTeamBroadcast.endExerciseShare', e) }
        setIncomingExerciseShare(null)
    }, [user?.id, myDisplayNameRef])

    const dismissExerciseShare = useCallback(() => setIncomingExerciseShare(null), [])

    const sendChatMessage = useCallback((text: string) => {
        if (!user?.id || !teamSession?.id) return
        const trimmed = String(text || '').trim().slice(0, 200)
        if (!trimmed) return
        const tempId = `temp:${user.id}:${Date.now()}`
        const newMsg: ChatMessage = {
            id: tempId,
            userId: user.id,
            displayName: String(myDisplayNameRef.current || 'Eu'),
            photoURL: myPhotoUrlRef.current,
            text: trimmed,
            ts: Date.now(),
        }
        // Optimistic add for sender
        setChatMessages(prev => [...prev, newMsg].slice(-MAX_CHAT_MESSAGES))
        // Send via API (persists to DB → arrives via postgres_changes + push)
        void fetch('/api/team/chat/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: teamSession.id,
                senderId: user.id,
                senderName: String(myDisplayNameRef.current || 'Parceiro'),
                senderPhoto: myPhotoUrlRef.current,
                text: trimmed,
            }),
        }).catch((e) => { logError('useTeamBroadcast.sendChatMessage', e) })
    }, [user?.id, teamSession?.id, myDisplayNameRef, myPhotoUrlRef])

    // ── Reliable chat: postgres_changes on team_chat_messages + polling fallback ──
    useEffect(() => {
        if (!teamSession?.id || !user?.id) return
        const sessionId = teamSession.id
        const myUid = user.id

        // Helper to fetch persisted messages from DB
        const loadPersistedMessages = async () => {
            try {
                const res = await fetch(`/api/team/chat/messages?sessionId=${sessionId}`)
                const json = await res.json().catch(() => ({}))
                if (!json.ok || !Array.isArray(json.data)) return
                const dbMessages: ChatMessage[] = json.data.map((row: Record<string, unknown>) => ({
                    id: String(row.id || ''),
                    userId: String(row.user_id || ''),
                    displayName: String(row.display_name || 'Parceiro'),
                    photoURL: row.photo_url ? String(row.photo_url) : null,
                    text: String(row.content || ''),
                    ts: new Date(String(row.created_at || '')).getTime() || Date.now(),
                }))
                setChatMessages(prev => {
                    // Merge: keep optimistic temp messages, replace with DB versions, add new ones
                    const merged = new Map<string, ChatMessage>()
                    for (const m of dbMessages) merged.set(m.id, m)
                    for (const m of prev) {
                        if (m.id.startsWith('temp:') && !dbMessages.some(d => d.userId === m.userId && d.text === m.text)) {
                            merged.set(m.id, m) // keep temp messages not yet in DB
                        }
                    }
                    return Array.from(merged.values()).sort((a, b) => a.ts - b.ts).slice(-MAX_CHAT_MESSAGES)
                })
            } catch (e) { logError('useTeamBroadcast.loadPersistedMessages', e) }
        }

        // Initial load
        loadPersistedMessages()

        // Subscribe to postgres_changes for real-time delivery
        const rtChannel = supabase
            .channel(`team_chat_rt:${sessionId}`)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'team_chat_messages', filter: `session_id=eq.${sessionId}` },
                (payload: Record<string, unknown>) => {
                    const row = payload?.new && typeof payload.new === 'object' ? (payload.new as Record<string, unknown>) : null
                    if (!row) return
                    const senderId = String(row.user_id || '')
                    const msgId = String(row.id || '')
                    const newMsg: ChatMessage = {
                        id: msgId,
                        userId: senderId,
                        displayName: String(row.display_name || 'Parceiro'),
                        photoURL: row.photo_url ? String(row.photo_url) : null,
                        text: String(row.content || ''),
                        ts: new Date(String(row.created_at || '')).getTime() || Date.now(),
                    }
                    setChatMessages(prev => {
                        // Skip if already have this message
                        if (prev.some(m => m.id === msgId)) return prev
                        // Remove matching temp message from same sender with same text
                        const filtered = senderId === myUid
                            ? prev.filter(m => !(m.id.startsWith('temp:') && m.userId === senderId && m.text === newMsg.text))
                            : prev
                        return [...filtered, newMsg].slice(-MAX_CHAT_MESSAGES)
                    })
                }
            )
            .subscribe()

        // Polling fallback every 5s (catches anything postgres_changes missed)
        // R9#3: Reduced from 5s to 15s — N users × 5s poll = excessive DB queries
        const poll = setInterval(loadPersistedMessages, 15_000)

        return () => {
            supabase.removeChannel(rtChannel)
            clearInterval(poll)
        }
    }, [teamSession?.id, user?.id, supabase])

    const pauseSession = useCallback(() => {
        const ch = teamBroadcastChannelRef.current
        if (!user?.id) return
        setSessionPaused(true)
        if (!ch) return
        try {
            ch.send({ type: 'broadcast', event: 'pause', payload: { userId: user.id, displayName: myDisplayNameRef.current || 'Eu', ts: Date.now() } })
        } catch (e) { logError('useTeamBroadcast.pauseSession', e) }
    }, [user?.id, myDisplayNameRef])

    const resumeSession = useCallback(() => {
        const ch = teamBroadcastChannelRef.current
        if (!user?.id) return
        setSessionPaused(false)
        if (!ch) return
        try {
            ch.send({ type: 'broadcast', event: 'resume', payload: { userId: user.id, displayName: myDisplayNameRef.current || 'Eu', ts: Date.now() } })
        } catch (e) { logError('useTeamBroadcast.resumeSession', e) }
    }, [user?.id, myDisplayNameRef])

    const clearSharedLogs = useCallback(() => {
        setSharedLogs({})
    }, [])

    return {
        sharedLogs,
        broadcastMyLog,
        chatMessages,
        sendChatMessage,
        sessionPaused,
        pauseSession,
        resumeSession,
        pendingChallenge,
        sendSetChallenge,
        dismissChallenge,
        pendingWorkoutEdit,
        broadcastWorkoutEdit,
        dismissWorkoutEdit,
        // Partner exercise control
        incomingExerciseShare,
        exerciseControlUpdates,
        shareExerciseWithPartner,
        sendExerciseControlUpdate,
        endExerciseShare,
        dismissExerciseShare,
        teamBroadcastChannelRef,
        clearSharedLogs,
    }
}
