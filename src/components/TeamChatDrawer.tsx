'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, Send, ChevronDown } from 'lucide-react'
import Image from 'next/image'
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext'
import { useWorkoutContext } from './workout/WorkoutContext'
import { normalizeParticipant } from '@/contexts/team/types'

export interface ChatMessage {
    id: string
    userId: string
    displayName: string
    photoURL: string | null
    text: string
    ts: number
}

interface TeamChatDrawerProps {
    myUserId: string
    myDisplayName: string
    myPhotoURL?: string | null
    participants?: Array<{ user_id?: string; display_name?: string; photo_url?: string | null }>
}

const QUICK_REACTIONS = ['🔥', '💪', '👏', '🏆', '😤', '💀']

/**
 * TeamChatDrawer — real-time team workout chat using Supabase Realtime broadcast.
 * Renders as a floating button (💬) that opens a chat drawer during a team session.
 * Messages are ephemeral (in-memory only, broadcast via the team_logs channel).
 */
export function TeamChatDrawer({ myUserId, myPhotoURL, participants }: TeamChatDrawerProps) {
    const { teamSession, chatMessages, sendChatMessage } = useTeamWorkout() as unknown as {
        teamSession: { id: string } | null
        chatMessages: ChatMessage[]
        sendChatMessage: (text: string) => void
    }

    // The rest-timer overlay bar (z-[2100]) sits at the bottom during recovery
    // and is ~120px tall (68px ring + padding + pb-safe). The default floating
    // chat button at bottom-[88px] z-[60] ended up BEHIND it — during rest the
    // user lost access to team chat right when it's most useful. We read the
    // workout session's timerTargetTime to detect rest, push the button up to
    // 188px, and bump its z-index above the overlay so it always clears it.
    //
    // Using `> 0` (same check WorkoutFooter uses) instead of `> Date.now()` to
    // keep this pure at render time — the orchestrator clears timerTargetTime
    // back to 0/null when rest ends, so this stays in sync without needing a
    // live clock read.
    const workout = useWorkoutContext() as unknown as { session: Record<string, unknown> | null; anyModalOpen?: boolean } | null
    const timerTargetRaw = workout?.session ? (workout.session as Record<string, unknown>)?.timerTargetTime : null
    const timerTargetNum = Number(timerTargetRaw ?? 0)
    const hasRecovery = Number.isFinite(timerTargetNum) && timerTargetNum > 0
    // Esconde o FAB quando um modal do treino está aberto — senão, durante o
    // descanso (quando o FAB sobe pra z alto), ele flutua por cima do modal
    // "Editar exercício" e cobre o botão Salvar.
    const anyModalOpen = !!workout?.anyModalOpen

    const [open, setOpen] = useState(false)
    const [unread, setUnread] = useState(0)
    const [input, setInput] = useState('')
    const bottomRef = useRef<HTMLDivElement>(null)
    const lastSeenCount = useRef(0)

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (open && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [chatMessages, open])

    // Track unread messages when drawer is closed
    useEffect(() => {
        if (!open) {
            const newCount = chatMessages.length - lastSeenCount.current
            if (newCount > 0) setUnread(n => n + newCount)
        }
        lastSeenCount.current = chatMessages.length
    }, [chatMessages, open])

    const handleOpen = () => {
        setOpen(true)
        setUnread(0)
        lastSeenCount.current = chatMessages.length
    }

    const handleSend = useCallback(() => {
        const text = input.trim()
        if (!text) return
        sendChatMessage(text)
        setInput('')
    }, [input, sendChatMessage])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    }

    const getParticipantName = (uid: string, msgDisplayName?: string) => {
        if (uid === myUserId) return 'Você'
        // Prefer the displayName from the broadcast message payload
        if (msgDisplayName && msgDisplayName !== 'Parceiro') return msgDisplayName
        const match = Array.isArray(participants) ? participants.map(normalizeParticipant).find(n => n.userId === uid) : null
        return String(match?.displayName || msgDisplayName || 'Parceiro').trim()
    }
    const getParticipantPhoto = (uid: string) => {
        if (uid === myUserId) return myPhotoURL ?? null
        const match = Array.isArray(participants) ? participants.map(normalizeParticipant).find(n => n.userId === uid) : null
        return match?.photoUrl ?? null
    }

    if (!teamSession?.id) return null

    return (
        <>
            {/* Floating chat button — repositions above the rest-timer bar during
                recovery so it's never buried by the z-[2100] overlay. Smooth
                transition on bottom so the jump isn't jarring when rest starts. */}
            {!open && !anyModalOpen && (
                <button
                    onClick={handleOpen}
                    style={{
                        bottom: hasRecovery ? 188 : 88,
                        zIndex: hasRecovery ? 2200 : 60,
                        transition: 'bottom 220ms ease, z-index 0s',
                    }}
                    className="fixed right-4 w-12 h-12 rounded-full bg-yellow-500 text-black flex items-center justify-center shadow-xl shadow-yellow-900/30 hover:bg-yellow-400 transition-transform active:scale-95"
                    aria-label="Abrir chat da equipe"
                >
                    <MessageCircle size={20} />
                    {unread > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                            {unread > 9 ? '9+' : unread}
                        </span>
                    )}
                </button>
            )}

            {/* Chat drawer */}
            {open && (
                <div
                    className="fixed bottom-0 right-0 z-[70] w-80 max-w-[100vw] h-[420px] flex flex-col rounded-t-2xl border border-b-0 shadow-2xl overflow-hidden"
                    style={{
                        background: 'linear-gradient(160deg, rgba(20,18,10,0.99) 0%, rgba(10,10,10,1) 40%)',
                        borderColor: 'rgba(234,179,8,0.12)',
                        boxShadow: '0 -8px 32px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(234,179,8,0.1)',
                    }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center gap-2">
                            <MessageCircle size={14} className="text-yellow-400" />
                            <span className="text-[10px] font-black text-yellow-500/80 uppercase tracking-[0.2em]">Chat da equipe</span>
                        </div>
                        <button onClick={() => setOpen(false)} className="min-w-[44px] min-h-[44px] rounded-xl border flex items-center justify-center text-neutral-500 hover:text-white hover:border-yellow-500/40 transition-all" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }} aria-label="Fechar chat da equipe" title="Fechar chat">
                            <ChevronDown size={14} />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {chatMessages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center gap-2 text-neutral-600">
                                <MessageCircle size={24} />
                                <p className="text-xs text-center">Nenhuma mensagem ainda.<br />Seja o primeiro a mandar fogo! 🔥</p>
                            </div>
                        ) : (
                            chatMessages.map((msg, msgIdx) => {
                                const isMine = msg.userId === myUserId
                                const name = getParticipantName(msg.userId, msg.displayName)
                                const photo = getParticipantPhoto(msg.userId)
                                // Show name label when sender differs from previous message
                                const prevMsg = msgIdx > 0 ? chatMessages[msgIdx - 1] : null
                                const showName = !isMine && (!prevMsg || prevMsg.userId !== msg.userId)
                                return (
                                    <div key={msg.id} className={`flex gap-2 items-end ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                        {/* Avatar */}
                                        <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-neutral-700">
                                            {photo ? (
                                                <Image src={photo} alt={name} width={24} height={24} className="object-cover" unoptimized />
                                            ) : (
                                                <div className="w-full h-full bg-yellow-500 flex items-center justify-center text-[9px] font-black text-black">
                                                    {name[0]?.toUpperCase() ?? '?'}
                                                </div>
                                            )}
                                        </div>
                                        {/* Bubble */}
                                        <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-xs ${isMine ? 'bg-yellow-500 text-black rounded-br-sm' : 'bg-neutral-800 text-white rounded-bl-sm'}`}>
                                            {showName && <p className="text-[10px] font-black text-yellow-400 mb-0.5">{name}</p>}
                                            <p className="leading-snug break-words">{msg.text}</p>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* Quick reactions */}
                    <div className="flex gap-1 px-3 py-1.5 border-t border-neutral-800 shrink-0">
                        {QUICK_REACTIONS.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => sendChatMessage(emoji)}
                                className="flex-1 text-base h-8 rounded-lg hover:bg-neutral-700 transition-colors active:scale-90"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>

                    {/* Input */}
                    <div className="flex items-center gap-2 px-3 py-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <input
                            type="text"
                            aria-label="Mensagem"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Mensagem…"
                            maxLength={200}
                            className="flex-1 bg-neutral-800 text-white text-xs rounded-xl px-3 py-2 outline-none placeholder:text-neutral-500 border border-neutral-700 focus:border-yellow-500/40 transition-colors"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim()}
                            className="w-8 h-8 rounded-xl bg-yellow-500 text-black flex items-center justify-center disabled:opacity-30 hover:bg-yellow-400 transition-colors active:scale-95"
                        >
                            <Send size={13} />
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}
