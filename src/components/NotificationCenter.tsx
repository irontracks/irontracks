"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
    Bell, Check, X, Users, MessageSquare, Trophy, Dumbbell,
    Zap, Trash2, Sparkles, Activity, Heart, Star
} from 'lucide-react';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';
import { useDialog } from '@/contexts/DialogContext';
import { createClient } from '@/utils/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { getErrorMessage } from '@/utils/errorMessage'
import type { AppNotification } from '@/types/social'

type NotificationItem = AppNotification & { data?: Record<string, unknown> };

interface NotificationCenterProps {
    onStartSession?: (workout: unknown) => void;
    user?: { id: string | number } | null;
    initialOpen?: boolean;
    embedded?: boolean;
    open?: boolean; // When embedded, used to trigger markRead and control visibility awareness
}

// ─── Notification type config ─────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, {
    icon: React.ReactNode;
    bg: string;
    border: string;
    dot: string;
    label: string;
}> = {
    invite: {
        icon: <Users size={15} />,
        bg: 'from-blue-500/20 to-blue-600/10',
        border: 'border-blue-500/30',
        dot: 'bg-blue-400',
        label: 'Convite',
    },
    pr: {
        icon: <Trophy size={15} />,
        bg: 'from-yellow-500/20 to-amber-600/10',
        border: 'border-yellow-500/30',
        dot: 'bg-yellow-400',
        label: 'PR',
    },
    workout_finished: {
        icon: <Dumbbell size={15} />,
        bg: 'from-green-500/20 to-emerald-600/10',
        border: 'border-green-500/30',
        dot: 'bg-green-400',
        label: 'Treino',
    },
    workout_started: {
        icon: <Activity size={15} />,
        bg: 'from-orange-500/20 to-orange-600/10',
        border: 'border-orange-500/30',
        dot: 'bg-orange-400',
        label: 'Iniciado',
    },
    message: {
        icon: <MessageSquare size={15} />,
        bg: 'from-purple-500/20 to-purple-600/10',
        border: 'border-purple-500/30',
        dot: 'bg-purple-400',
        label: 'Mensagem',
    },
    broadcast: {
        icon: <Zap size={15} />,
        bg: 'from-red-500/20 to-red-600/10',
        border: 'border-red-500/30',
        dot: 'bg-red-400',
        label: 'Aviso',
    },
    milestone: {
        icon: <Star size={15} />,
        bg: 'from-pink-500/20 to-pink-600/10',
        border: 'border-pink-500/30',
        dot: 'bg-pink-400',
        label: 'Marco',
    },
    like: {
        icon: <Heart size={15} />,
        bg: 'from-rose-500/20 to-rose-600/10',
        border: 'border-rose-500/30',
        dot: 'bg-rose-400',
        label: 'Curtiu',
    },
    default: {
        icon: <Bell size={15} />,
        bg: 'from-neutral-700/40 to-neutral-800/20',
        border: 'border-neutral-700/40',
        dot: 'bg-neutral-500',
        label: 'Info',
    },
};

function getTypeConfig(type: string) {
    return TYPE_CONFIG[type] ?? TYPE_CONFIG.default;
}

// ─── Micro components ─────────────────────────────────────────────────────────

function NotifDot({ color }: { color: string }) {
    return (
        <span className={`flex-shrink-0 w-2 h-2 rounded-full ${color} shadow-lg ring-2 ring-black`} />
    );
}

function IconBubble({ children, bg, border }: { children: React.ReactNode; bg: string; border: string }) {
    return (
        <div className={`flex-shrink-0 w-9 h-9 rounded-2xl bg-gradient-to-br ${bg} border ${border} flex items-center justify-center text-white/90`}>
            {children}
        </div>
    );
}

// ─── Main component ────────────────────────────────────────────────────────────

const NotificationCenter = ({ onStartSession, user, initialOpen, embedded, open: externalOpen }: NotificationCenterProps) => {
    const { alert, confirm } = useDialog();
    const [isOpen, setIsOpen] = useState(() => !!initialOpen);
    // In embedded mode, use the externally-controlled `open` prop (showNotifCenter from parent)
    const effectiveOpen = embedded ? !!externalOpen : isOpen;
    const { incomingInvites, acceptInvite, rejectInvite } = useTeamWorkout();
    const [systemNotifications, setSystemNotifications] = useState<NotificationItem[]>([]);
    const safeUserId = user?.id ? String(user.id) : '';
    const supabase = useMemo(() => { try { return createClient(); } catch { return null; } }, []);

    // ─── Fetch + Realtime ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!supabase || !safeUserId) return;
        let isMounted = true;
        let channel: RealtimeChannel | null = null;

        const fetchNotifications = async () => {
            try {
                const { data } = await supabase
                    .from('notifications')
                    .select('id, user_id, type, title, body, message, data, read, is_read, read_at, created_at')
                    .eq('user_id', safeUserId)
                    .order('created_at', { ascending: false });
                if (isMounted) setSystemNotifications((data as NotificationItem[]) || []);
            } catch { if (isMounted) setSystemNotifications([]); }
        };

        fetchNotifications();

        channel = supabase
            .channel(`notifications:${safeUserId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${safeUserId}` },
                (payload) => {
                    setSystemNotifications((prev) => {
                        const safePrev = Array.isArray(prev) ? prev : [];
                        const next = payload?.new && typeof payload.new === 'object' ? (payload.new as NotificationItem) : null;
                        if (!next) return safePrev;
                        return [next, ...safePrev];
                    });
                })
            .subscribe();

        return () => { isMounted = false; if (channel) supabase.removeChannel(channel); };
    }, [supabase, safeUserId]);

    // ─── Mark all read on open ────────────────────────────────────────────────
    useEffect(() => {
        if (!effectiveOpen || !safeUserId || !supabase) return;
        let cancelled = false;
        const markRead = async () => {
            try {
                // Update ALL unread notifications — covers legacy rows where
                // one column may be true while the other is still false/null
                await supabase
                    .from('notifications')
                    .update({ read: true, is_read: true })
                    .eq('user_id', safeUserId)
                    .or('read.eq.false,is_read.eq.false,is_read.is.null');
                if (cancelled) return;
                setSystemNotifications(prev =>
                    (Array.isArray(prev) ? prev : []).map(n => ({ ...n, read: true, is_read: true }))
                );
            } catch { return; }
        };
        markRead();
        return () => { cancelled = true; };
    }, [effectiveOpen, supabase, safeUserId]);

    // ─── Actions ─────────────────────────────────────────────────────────────
    const handleDelete = async (id: string | null, e?: React.MouseEvent) => {
        try { e?.stopPropagation?.(); } catch { }
        if (!id || !supabase) return;
        setSystemNotifications(prev => (Array.isArray(prev) ? prev.filter(n => n?.id !== id) : []));
        try { await supabase.from('notifications').delete().eq('id', id); } catch { return; }
    };

    const handleClearAll = async () => {
        try {
            const confirmed = await confirm("Limpar todas as notificações?");
            if (!confirmed || !supabase) return;
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) return;
            await supabase.from('notifications').delete().eq('user_id', currentUser.id);
            setSystemNotifications([]);
        } catch { return; }
    };

    const handleAccept = async (item: { data?: unknown;[key: string]: unknown }) => {
        setIsOpen(false);
        try {
            const invite = item?.data ?? item?.metadata ?? null;
            if (!invite) return;
            const inv = invite as Record<string, unknown>;
            if (typeof acceptInvite === 'function') await acceptInvite(invite as Parameters<typeof acceptInvite>[0]);
            if (inv.workout && typeof onStartSession === 'function') onStartSession(inv.workout);
        } catch (e) { await alert("Erro ao aceitar: " + getErrorMessage(e)); }
    };

    const handleReject = async (item: { id?: unknown;[key: string]: unknown }) => {
        try { if (typeof rejectInvite === 'function') await rejectInvite(item?.id as string); } catch { return; }
    };

    // ─── Data assembly ────────────────────────────────────────────────────────
    const formatTime = (isoString?: string) => {
        if (!isoString) return 'Agora';
        // eslint-disable-next-line react-hooks/purity
        const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
        if (diff < 60) return 'Agora';
        if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
        return new Date(isoString).toLocaleDateString();
    };

    const safeIncomingInvites = Array.isArray(incomingInvites) ? incomingInvites.filter(Boolean) : [];
    const safeSystem = Array.isArray(systemNotifications) ? systemNotifications.map(n => ({
        ...n, type: String(n?.type ?? '').toLowerCase() === 'invite' ? 'broadcast' : String(n?.type ?? 'default')
    })) : [];

    const allNotifications = [
        ...safeIncomingInvites.map((inv, idx) => {
            const safeFrom = inv?.from && typeof inv.from === 'object' ? (inv.from as Record<string, unknown>) : null;
            const fromName = String(safeFrom?.displayName ?? safeFrom?.display_name ?? inv?.from_display_name ?? inv?.fromName ?? '').trim() || 'Alguém';
            const safeWorkout = inv?.workout && typeof inv.workout === 'object' ? (inv.workout as Record<string, unknown>) : null;
            const workoutTitle = String(safeWorkout?.title ?? safeWorkout?.name ?? 'Treino');
            const ts = (() => { const raw = inv?.created_at ?? inv?.createdAt ?? null; if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0; if (typeof raw === 'string') { const ms = Date.parse(raw); return Number.isFinite(ms) ? ms : 0; } return 0; })();
            return { id: inv?.id ?? inv?.invite_id ?? `invite_${idx}`, type: 'invite', title: `Convite de ${fromName}`, message: `Chamou você para treinar: ${workoutTitle}`, timeAgo: 'Agora', data: inv, timestamp: ts, read: false };
        }),
        ...safeSystem.map(n => ({
            id: n.id, type: n.type || 'default', title: n.title, message: n.message,
            timeAgo: formatTime(n.created_at), data: n,
            timestamp: (() => { try { const ms = new Date(n?.created_at || 0).getTime(); return Number.isFinite(ms) ? ms : 0; } catch { return 0; } })(),
            read: !!(n?.read === true),
        }))
    ].sort((a, b) => b.timestamp - a.timestamp);

    const unreadCount = allNotifications.filter(n => !n?.read).length;
    const hasItems = allNotifications.length > 0;

    // ─── Render list ──────────────────────────────────────────────────────────
    const renderList = () => (
        <div className="overflow-y-auto max-h-[420px] custom-scrollbar">
            {!hasItems ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 gap-3">
                    <div className="w-16 h-16 rounded-3xl bg-neutral-800/80 border border-neutral-700/50 flex items-center justify-center mb-1">
                        <Sparkles size={28} className="text-neutral-600" />
                    </div>
                    <p className="text-sm font-bold text-neutral-500">Tudo em dia!</p>
                    <p className="text-xs text-neutral-600 text-center">Nenhuma notificação por enquanto.</p>
                </div>
            ) : (
                <div className="p-3 flex flex-col gap-2">
                    {allNotifications.map(item => {
                        const cfg = getTypeConfig(item.type);
                        return (
                            <div
                                key={String(item.id ?? "")}
                                className={`group relative rounded-2xl border bg-gradient-to-br ${cfg.bg} ${cfg.border} p-3.5 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg`}
                            >
                                {/* Unread dot */}
                                {!item.read && (
                                    <div className="absolute top-3 right-3">
                                        <NotifDot color={cfg.dot} />
                                    </div>
                                )}

                                <div className="flex gap-3">
                                    <IconBubble bg={cfg.bg} border={cfg.border}>
                                        {cfg.icon}
                                    </IconBubble>

                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="text-sm font-black text-white leading-tight truncate">{item.title}</p>
                                            {!item.read && (
                                                <span className={`flex-shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${cfg.border} text-white/70`}>
                                                    {cfg.label}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-neutral-400 leading-snug line-clamp-2">{String(item.message ?? "")}</p>
                                        <p className="text-[10px] text-neutral-600 font-medium mt-1.5">{item.timeAgo}</p>
                                    </div>
                                </div>

                                {/* Invite actions */}
                                {item.type === 'invite' && item.data && (
                                    <div className="flex gap-2 mt-3">
                                        <button
                                            onClick={() => handleAccept(item)}
                                            className="flex-1 bg-blue-500 hover:bg-blue-400 active:scale-95 text-white text-xs font-black py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-blue-900/30"
                                        >
                                            <Check size={12} /> Aceitar
                                        </button>
                                        <button
                                            onClick={() => handleReject(item)}
                                            className="flex-1 bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-neutral-300 text-xs font-black py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all border border-neutral-700"
                                        >
                                            <X size={12} /> Recusar
                                        </button>
                                    </div>
                                )}

                                {/* Delete button */}
                                {item.type !== 'invite' && (
                                    <button
                                        onClick={(e) => handleDelete(String(item.id ?? ""), e)}
                                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-red-400 transition-all rounded-lg hover:bg-red-500/10"
                                        aria-label="Remover notificação"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    // ─── Embedded mode ────────────────────────────────────────────────────────
    if (embedded) {
        return (
            <div className="w-full">
                {systemNotifications.length > 0 && (
                    <div className="flex justify-end mb-2 px-1">
                        <button onClick={handleClearAll} className="text-[10px] text-neutral-600 hover:text-red-400 uppercase font-bold tracking-widest transition-colors flex items-center gap-1">
                            <Trash2 size={10} /> Limpar tudo
                        </button>
                    </div>
                )}
                {renderList()}
            </div>
        );
    }

    // ─── Standalone / dropdown mode ───────────────────────────────────────────
    return (
        <div className="relative z-50">
            {/* Bell trigger */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`relative w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90 ${isOpen
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 shadow-lg shadow-yellow-900/20'
                    : 'bg-neutral-800/80 text-neutral-400 border border-neutral-700/50 hover:text-white hover:bg-neutral-700/80'
                    }`}
            >
                <Bell size={18} className={isOpen ? 'fill-yellow-400' : ''} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-gradient-to-br from-red-500 to-rose-600 rounded-full flex items-center justify-center text-[10px] font-black text-white border-2 border-black shadow-lg shadow-red-900/50 animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

                    {/* Panel */}
                    <div className="absolute right-0 top-13 w-[340px] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Glass panel */}
                        <div className="rounded-3xl overflow-hidden" style={{ background: 'rgba(10,10,10,0.99)', border: '1px solid rgba(234,179,8,0.2)', boxShadow: '0 0 40px rgba(234,179,8,0.08), 0 30px 80px rgba(0,0,0,0.65)', backdropFilter: 'blur(24px)' }}>

                            {/* Header */}
                            <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-white/5">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border border-yellow-500/30 flex items-center justify-center">
                                        <Bell size={14} className="text-yellow-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-white leading-none">Notificações</h3>
                                        {unreadCount > 0 && (
                                            <p className="text-[10px] text-yellow-500 font-bold mt-0.5">{unreadCount} não lida{unreadCount > 1 ? 's' : ''}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {hasItems && (
                                        <button
                                            onClick={handleClearAll}
                                            className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-red-400 font-bold uppercase tracking-wider transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
                                        >
                                            <Trash2 size={10} /> Limpar
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="w-7 h-7 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white transition-all active:scale-90"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                            </div>

                            {/* List */}
                            {renderList()}

                            {/* Footer */}
                            {hasItems && (
                                <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between">
                                    <span className="text-[10px] text-neutral-600 font-medium">{allNotifications.length} notificaç{allNotifications.length > 1 ? 'ões' : 'ão'}</span>
                                    <div className="flex gap-1">
                                        {['default', 'invite', 'pr', 'workout_finished'].map((t) => (
                                            <div key={t} className={`w-1.5 h-1.5 rounded-full ${getTypeConfig(t).dot} opacity-40`} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default NotificationCenter;
