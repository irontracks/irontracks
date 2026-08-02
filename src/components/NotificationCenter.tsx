"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
    Bell, X, MessageSquare, Trophy, Dumbbell,
    Trash2, Sparkles, Activity, Heart, Star,
    UserPlus, Calendar, Utensils, Swords, Flame, Target,
    Camera, Megaphone
} from 'lucide-react';
import { useDialog } from '@/contexts/DialogContext';
import { createClient } from '@/utils/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { logError } from '@/lib/logger'
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
// Keys MUST match the `type` values emitted by the server. Aliases map legacy
// names to the canonical entry so one server type rename doesn't break the UI.
type TypeConfig = {
    icon: React.ReactNode;
    bg: string;
    border: string;
    dot: string;
    label: string;
};

const TYPE_CONFIG: Record<string, TypeConfig> = {
    friend_pr: {
        icon: <Trophy size={15} />, bg: 'from-yellow-500/20 to-amber-600/10',
        border: 'border-yellow-500/30', dot: 'bg-yellow-400', label: 'PR',
    },
    friend_streak: {
        icon: <Flame size={15} />, bg: 'from-orange-500/20 to-red-500/10',
        border: 'border-orange-500/30', dot: 'bg-orange-400', label: 'Streak',
    },
    friend_goal: {
        icon: <Target size={15} />, bg: 'from-emerald-500/20 to-green-600/10',
        border: 'border-emerald-500/30', dot: 'bg-emerald-400', label: 'Meta',
    },
    workout_finish: {
        icon: <Dumbbell size={15} />, bg: 'from-green-500/20 to-emerald-600/10',
        border: 'border-green-500/30', dot: 'bg-green-400', label: 'Treino',
    },
    workout_start: {
        icon: <Activity size={15} />, bg: 'from-orange-500/20 to-orange-600/10',
        border: 'border-orange-500/30', dot: 'bg-orange-400', label: 'Iniciou',
    },
    friend_online: {
        icon: <Activity size={15} />, bg: 'from-emerald-500/20 to-green-600/10',
        border: 'border-emerald-500/30', dot: 'bg-emerald-400', label: 'Online',
    },
    follow_request: {
        icon: <UserPlus size={15} />, bg: 'from-amber-500/20 to-amber-600/10',
        border: 'border-amber-500/30', dot: 'bg-amber-400', label: 'Seguir',
    },
    follow_accepted: {
        icon: <UserPlus size={15} />, bg: 'from-green-500/20 to-emerald-600/10',
        border: 'border-green-500/30', dot: 'bg-green-400', label: 'Aceito',
    },
    message: {
        icon: <MessageSquare size={15} />, bg: 'from-amber-500/20 to-amber-600/10',
        border: 'border-amber-500/30', dot: 'bg-amber-400', label: 'Mensagem',
    },
    broadcast: {
        icon: <Megaphone size={15} />, bg: 'from-red-500/20 to-red-600/10',
        border: 'border-red-500/30', dot: 'bg-red-400', label: 'Aviso',
    },
    appointment: {
        icon: <Calendar size={15} />, bg: 'from-amber-500/20 to-amber-600/10',
        border: 'border-amber-500/30', dot: 'bg-amber-400', label: 'Agenda',
    },
    appointment_created: {
        icon: <Calendar size={15} />, bg: 'from-amber-500/20 to-amber-600/10',
        border: 'border-amber-500/30', dot: 'bg-amber-400', label: 'Agenda',
    },
    milestone: {
        icon: <Star size={15} />, bg: 'from-emerald-500/20 to-green-600/10',
        border: 'border-emerald-500/30', dot: 'bg-emerald-400', label: 'Marco',
    },
    story_posted: {
        icon: <Camera size={15} />, bg: 'from-amber-500/20 to-amber-600/10',
        border: 'border-amber-500/30', dot: 'bg-amber-400', label: 'Story',
    },
    story_like: {
        icon: <Heart size={15} />, bg: 'from-red-500/20 to-red-600/10',
        border: 'border-red-500/30', dot: 'bg-red-400', label: 'Curtiu',
    },
    like: {
        icon: <Heart size={15} />, bg: 'from-red-500/20 to-red-600/10',
        border: 'border-red-500/30', dot: 'bg-red-400', label: 'Curtiu',
    },
    story_reaction: {
        icon: <Heart size={15} />, bg: 'from-red-500/20 to-red-600/10',
        border: 'border-red-500/30', dot: 'bg-red-400', label: 'Reação',
    },
    challenge_created: {
        icon: <Swords size={15} />, bg: 'from-amber-500/20 to-orange-600/10',
        border: 'border-amber-500/30', dot: 'bg-amber-400', label: 'Desafio',
    },
    challenge_accepted: {
        icon: <Swords size={15} />, bg: 'from-green-500/20 to-emerald-600/10',
        border: 'border-green-500/30', dot: 'bg-green-400', label: 'Aceito',
    },
    challenge_declined: {
        icon: <Swords size={15} />, bg: 'from-neutral-500/20 to-neutral-600/10',
        border: 'border-neutral-500/30', dot: 'bg-neutral-400', label: 'Recusado',
    },
    meal_reminder: {
        icon: <Utensils size={15} />, bg: 'from-emerald-500/20 to-green-600/10',
        border: 'border-emerald-500/30', dot: 'bg-emerald-400', label: 'Refeição',
    },
    workout_reminder: {
        icon: <Activity size={15} />, bg: 'from-amber-500/20 to-amber-600/10',
        border: 'border-amber-500/30', dot: 'bg-amber-400', label: 'Lembrete',
    },
    default: {
        icon: <Bell size={15} />, bg: 'from-neutral-700/40 to-neutral-800/20',
        border: 'border-neutral-700/40', dot: 'bg-neutral-500', label: 'Info',
    },
};

// Legacy aliases — map old server type names to the current config entry.
const TYPE_ALIASES: Record<string, string> = {
    workout_finished: 'workout_finish',
    workout_started: 'workout_start',
    pr: 'friend_pr',
};

function getTypeConfig(type: string) {
    const canonical = TYPE_ALIASES[type] ?? type;
    return TYPE_CONFIG[canonical] ?? TYPE_CONFIG.default;
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

const NotificationCenter = ({ user, initialOpen, embedded, open: externalOpen }: NotificationCenterProps) => {
    const { confirm } = useDialog();
    const [isOpen, setIsOpen] = useState(() => !!initialOpen);
    // In embedded mode, use the externally-controlled `open` prop (showNotifCenter from parent)
    const effectiveOpen = embedded ? !!externalOpen : isOpen;
    const [systemNotifications, setSystemNotifications] = useState<NotificationItem[]>([]);
    const [clearing, setClearing] = useState(false);
    const safeUserId = user?.id ? String(user.id) : '';
    const supabase = useMemo(() => { try { return createClient(); } catch { return null; } }, []);

    // ─── Fetch + Realtime ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!supabase || !safeUserId) return;
        let isMounted = true;
        let channel: RealtimeChannel | null = null;

        const fetchNotifications = async () => {
            try {
                const { data, error } = await supabase
                    .from('notifications')
                    .select('id, user_id, type, title, message, metadata, read, is_read, created_at')
                    .eq('user_id', safeUserId)
                    .order('created_at', { ascending: false })
                    .limit(50);
                if (error) logError('component:NotificationCenter.fetchNotifications', error);
                if (isMounted) setSystemNotifications((data as NotificationItem[]) || []);
            } catch (e) { logError('component:NotificationCenter.fetchNotifications', e); if (isMounted) setSystemNotifications([]); }
        };

        fetchNotifications();

        channel = supabase
            .channel(`notif-list:${safeUserId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${safeUserId}` },
                (payload) => {
                    setSystemNotifications((prev) => {
                        const safePrev = Array.isArray(prev) ? prev : [];
                        const next = payload?.new && typeof payload.new === 'object' ? (payload.new as NotificationItem) : null;
                        if (!next) return safePrev;
                        // Avoid duplicates (e.g. rapid reconnect)
                        if (safePrev.some(n => n?.id === (next as NotificationItem).id)) return safePrev;
                        return [next, ...safePrev];
                    });
                })
            .subscribe((status) => {
                // Re-fetch on channel reconnect so no notifications are missed
                if (status === 'SUBSCRIBED' && isMounted) fetchNotifications();
            });

        return () => { isMounted = false; if (channel) supabase.removeChannel(channel); };
    }, [supabase, safeUserId]);

    // ─── Mark all read on open (with delay to show unread dots first) ─────────
    useEffect(() => {
        if (!effectiveOpen || !safeUserId || !supabase) return;
        let cancelled = false;
        // Delay mark-read so the user sees the unread indicators before they disappear
        const timer = setTimeout(async () => {
            if (cancelled) return;
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
                // Clear iOS app icon badge — best-effort, don't await
                fetch('/api/push/clear-badge', { method: 'POST', credentials: 'include' }).catch(() => { });
            } catch (e) { logError('component:NotificationCenter.markRead', e); return; }
        }, 800);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [effectiveOpen, supabase, safeUserId]);

    // ─── Actions ─────────────────────────────────────────────────────────────
    const handleDelete = async (id: string | null, e?: React.MouseEvent) => {
        try { e?.stopPropagation?.(); } catch { }
        if (!id || !supabase) return;
        setSystemNotifications(prev => (Array.isArray(prev) ? prev.filter(n => n?.id !== id) : []));
        try { await supabase.from('notifications').delete().eq('id', id); } catch (e) { logError('component:NotificationCenter.deleteNotification', e); return; }
    };

    const handleClearAll = async () => {
        if (clearing) return;
        setClearing(true);
        try {
            const confirmed = await confirm("Limpar todas as notificações?");
            if (!confirmed || !supabase) return;
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) return;
            await supabase.from('notifications').delete().eq('user_id', currentUser.id);
            setSystemNotifications([]);
        } catch (e) { logError('component:NotificationCenter.clearAll', e); } finally {
            setClearing(false);
        }
    };

    // ─── Data assembly ────────────────────────────────────────────────────────
    const formatTime = (isoString?: string) => {
        if (!isoString) return 'Agora';
         
        const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
        if (diff < 60) return 'Agora';
        if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
        return new Date(isoString).toLocaleDateString();
    };

    // Preserve server-emitted types verbatim — the TYPE_CONFIG map (plus
    // TYPE_ALIASES for legacy renames) picks the right icon and color.
    const safeSystem = Array.isArray(systemNotifications) ? systemNotifications.map(n => ({
        ...n, type: String(n?.type ?? 'default'),
    })) : [];

    const allNotifications = [
        ...safeSystem.map(n => ({
            id: n.id, type: n.type || 'default', title: n.title,
            message: String(n.message || (n as unknown as Record<string, unknown>).body || ''),
            timeAgo: formatTime(n.created_at), data: n,
            timestamp: (() => { try { const ms = new Date(n?.created_at || 0).getTime(); return Number.isFinite(ms) ? ms : 0; } catch { return 0; } })(),
            read: !!(n?.read === true || n?.is_read === true),
        }))
    ].sort((a, b) => b.timestamp - a.timestamp);

    // Use is_read as canonical field; fall back to read for legacy rows
    const unreadCount = allNotifications.filter(n => {
        const item = n as typeof n & { is_read?: boolean };
        if (typeof item?.is_read === 'boolean') return !item.is_read;
        return !n?.read;
    }).length;
    const hasItems = allNotifications.length > 0;

    // ─── Render list ──────────────────────────────────────────────────────────
    const renderList = () => (
        <div className="overflow-y-auto max-h-[420px] custom-scrollbar">
            {!hasItems ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 gap-3">
                    <div className="w-16 h-16 rounded-3xl bg-neutral-800/80 border border-neutral-700/50 flex items-center justify-center mb-1">
                        <Sparkles size={28} className="text-neutral-400" />
                    </div>
                    <p className="text-sm font-bold text-neutral-400">Tudo em dia!</p>
                    <p className="text-xs text-neutral-400 text-center">Nenhuma notificação por enquanto.</p>
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

                                    <div className="flex-1 min-w-0 pr-14">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="text-sm font-black text-white leading-tight truncate">{item.title}</p>
                                            {!item.read && (
                                                <span className={`flex-shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${cfg.border} text-white/70`}>
                                                    {cfg.label}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-neutral-400 leading-snug line-clamp-2">{String(item.message ?? "")}</p>
                                        <p className="text-[10px] text-neutral-400 font-medium mt-1.5">{item.timeAgo}</p>
                                    </div>
                                </div>

                                {/* Delete button */}
                                <button
                                    onClick={(e) => handleDelete(String(item.id ?? ""), e)}
                                    className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center opacity-60 group-hover:opacity-100 text-neutral-400 hover:text-red-400 transition-all rounded-lg hover:bg-red-500/10"
                                    aria-label="Remover notificação"
                                >
                                    <Trash2 size={13} />
                                </button>
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
                        <button onClick={handleClearAll} disabled={clearing} className="text-[10px] text-neutral-400 hover:text-red-400 uppercase font-bold tracking-widest transition-colors flex items-center gap-1 disabled:opacity-60">
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
                    <div className="fixed inset-0 z-40" role="button" tabIndex={-1} aria-label="Fechar notificações" onClick={() => setIsOpen(false)} onKeyDown={(e) => { if (e.key === 'Escape') setIsOpen(false) }} />

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
                                            disabled={clearing}
                                            className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-red-400 font-bold uppercase tracking-wider transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10 disabled:opacity-60"
                                        >
                                            <Trash2 size={10} /> Limpar
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-neutral-400 hover:text-white transition-all active:scale-90"
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
                                    <span className="text-[10px] text-neutral-400 font-medium">{allNotifications.length} notificaç{allNotifications.length > 1 ? 'ões' : 'ão'}</span>
                                    <div className="flex gap-1">
                                        {['default', 'pr', 'workout_finished'].map((t) => (
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
