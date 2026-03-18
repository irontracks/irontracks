export interface TeamParticipant {
    id?: string
    user_id?: string
    display_name?: string
    photo_url?: string | null
    status?: string
}

export interface TeamSession {
    id: string
    isHost: boolean
    participants: TeamParticipant[]
    code?: string
    hostName?: string
}

export interface IncomingInvite {
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

export interface AcceptedInviteNotice {
    inviteId: string
    fromName: string
    fromPhoto: string | null
    teamSessionId?: string | null
    user?: { displayName: string; photoURL: string | null; uid: string | null }
}

export type PresenceStatus = 'online' | 'away' | 'offline'

// Per-participant shared log entry
export interface SharedLogEntry {
    exIdx: number
    sIdx: number
    weight: string
    reps: string
    ts: number
}

// sharedLogs: userId -> logKey ("exIdx-sIdx") -> SharedLogEntry
export type SharedLogsMap = Record<string, Record<string, SharedLogEntry>>

// Chat message broadcasted via team_logs channel
export interface ChatMessage {
    id: string
    userId: string
    displayName: string
    photoURL: string | null
    text: string
    ts: number
}

export const MAX_TEAM_PARTICIPANTS = 5
export const MAX_CHAT_MESSAGES = 60

export interface JoinResult {
    ok: boolean
    teamSessionId?: string
    participants?: TeamParticipant[]
    workout?: Record<string, unknown> | null
    error?: string
}

export interface ActionOkResult {
    ok: boolean
    error?: string
}

export interface SetChallengePayload {
    id: string
    fromUserId: string
    fromName: string
    exName: string
    weight: number
    reps: number
    ts: number
}

export interface WorkoutEditPayload {
    id: string
    fromUserId: string
    fromName: string
    workout: Record<string, unknown>
    ts: number
}

export interface ExerciseSharePayload {
    id: string
    fromUserId: string
    fromName: string
    exerciseIdx: number
    exercise: Record<string, unknown>
    logs: Record<string, unknown>
    context?: Record<string, unknown> | null
    ts: number
}

export interface ExerciseControlUpdate {
    fromUserId: string
    exerciseIdx: number
    setIdx: number
    patch: Record<string, unknown>
    ts: number
}

export interface TeamWorkoutProviderProps {
    children: React.ReactNode
    user: { id: string; email?: string | null } | null
    settings?: Record<string, unknown> | null
    onStartSession?: (workout: Record<string, unknown>) => void
}

export interface TeamWorkoutContextValue {
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
    sendMultipleInvites: (targets: unknown[], workout: Record<string, unknown>) => Promise<Array<{ userId: string; ok: boolean; error?: string }>>
    // ─ Live progress sync ─────────────────────────────────────────────────────
    sharedLogs: SharedLogsMap
    broadcastMyLog: (exIdx: number, sIdx: number, weight: string, reps: string) => void
    // ─ Chat ────────────────────────────────────────────────────────────────
    chatMessages: ChatMessage[]
    sendChatMessage: (text: string) => void
    // ─ Pause/Resume ────────────────────────────────────────────────────────
    sessionPaused: boolean
    pauseSession: () => void
    resumeSession: () => void
    // ─ Set Challenge ─────────────────────────────────────────────────────
    pendingChallenge: SetChallengePayload | null
    sendSetChallenge: (exName: string, weight: number, reps: number) => void
    dismissChallenge: () => void
    // ─ Workout Edit Sync ─────────────────────────────────────────────────
    pendingWorkoutEdit: WorkoutEditPayload | null
    broadcastWorkoutEdit: (workout: Record<string, unknown>) => void
    dismissWorkoutEdit: () => void
    // ─ Partner Exercise Control ───────────────────────────────────────
    incomingExerciseShare: ExerciseSharePayload | null
    exerciseControlUpdates: ExerciseControlUpdate[]
    shareExerciseWithPartner: (exerciseIdx: number, exercise: Record<string, unknown>, logs: Record<string, unknown>, context?: Record<string, unknown> | null) => void
    sendExerciseControlUpdate: (exerciseIdx: number, setIdx: number, patch: Record<string, unknown>) => void
    endExerciseShare: () => void
    dismissExerciseShare: () => void
}
