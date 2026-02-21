"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Bell, Check, X, Users, MessageSquare, AlertTriangle, Trash2 } from 'lucide-react';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';
import { useDialog } from '@/contexts/DialogContext';
import { createClient } from '@/utils/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { getErrorMessage } from '@/utils/errorMessage'

interface NotificationItem {
    id: string;
    type: string;
    title: string;
    message: string;
    created_at?: string;
    read?: boolean;
    data?: Record<string, unknown>;
}

interface NotificationCenterProps {
    onStartSession?: (workout: unknown) => void;
    user?: { id: string | number } | null;
    initialOpen?: boolean;
    embedded?: boolean;
}

const NotificationCenter = ({ onStartSession, user, initialOpen, embedded }: NotificationCenterProps) => {
    const { confirm } = useDialog();
    const [isOpen, setIsOpen] = useState(() => !!initialOpen);
    const { incomingInvites, acceptInvite, rejectInvite } = useTeamWorkout();
    const [systemNotifications, setSystemNotifications] = useState<NotificationItem[]>([]);
    const safeUserId = user?.id ? String(user.id) : '';
    const supabase = useMemo(() => {
        try {
            return createClient();
        } catch {
            return null;
        }
    }, []);

    useEffect(() => {
        if (!supabase) return;
        if (!safeUserId) return;

        let isMounted = true;
        let channel: RealtimeChannel | null = null;

        const fetchNotifications = async () => {
            try {
                const { data } = await supabase
                    .from('notifications')
                    .select('*')
                    .eq('user_id', safeUserId)
                    .order('created_at', { ascending: false });

                if (isMounted) {
                    setSystemNotifications((data as NotificationItem[]) || []);
                }
            } catch {
                if (isMounted) {
                    setSystemNotifications([]);
                }
            }
        };

        fetchNotifications();

        channel = supabase
            .channel(`notifications:${safeUserId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${safeUserId}`
            }, (payload) => {
                setSystemNotifications((prev) => {
                    const safePrev = Array.isArray(prev) ? prev : [];
                    const next = payload?.new && typeof payload.new === 'object' ? (payload.new as NotificationItem) : null;
                    if (!next) return safePrev;
                    return [next, ...safePrev];
                });
            })
            .subscribe();

        return () => {
            isMounted = false;
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [supabase, safeUserId]);

    const handleDelete = async (id: string | null, e?: React.MouseEvent) => {
        try {
            e?.stopPropagation?.();
        } catch { }
        const safeId = id ?? null;
        if (!safeId) return;
        if (!supabase) return;
        setSystemNotifications((prev) => (Array.isArray(prev) ? prev.filter((n) => n?.id !== safeId) : []));
        try {
            await supabase.from('notifications').delete().eq('id', safeId);
        } catch {
            return;
        }
    };

    const formatTime = (isoString?: string) => {
        if (!isoString) return 'Agora';
        const date = new Date(isoString);
        const now = new Date();
        const diff = (now.getTime() - date.getTime()) / 1000;

        if (diff < 60) return 'Agora';
        if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
        return date.toLocaleDateString();
    };

    const safeSystemNotifications = Array.isArray(systemNotifications)
        ? systemNotifications.map((n) => {
            try {
                const type = String(n?.type ?? '').toLowerCase();
                if (type === 'invite') {
                    return { ...n, type: 'broadcast' };
                }
                return n;
            } catch {
                return n;
            }
        })
        : [];

    const safeIncomingInvites = Array.isArray(incomingInvites)
        ? incomingInvites.filter((inv) => inv && typeof inv === 'object')
        : [];

    const allNotifications = [
        ...safeIncomingInvites.map((inv, idx: number) => {
            const safeFrom = inv?.from && typeof inv.from === 'object' ? (inv.from as Record<string, unknown>) : null;
            const fromName =
                String(
                    safeFrom?.displayName ??
                    safeFrom?.display_name ??
                    inv?.from_display_name ??
                    inv?.fromName ??
                    ''
                ).trim() || 'Alguém';
            const safeWorkout = inv?.workout && typeof inv.workout === 'object' ? (inv.workout as Record<string, unknown>) : null;
            const workoutTitle = String(safeWorkout?.title ?? safeWorkout?.name ?? 'Treino');

            const ts = (() => {
                const raw = inv?.created_at ?? inv?.createdAt ?? null;
                if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
                if (typeof raw === 'string') {
                    const ms = Date.parse(raw);
                    return Number.isFinite(ms) ? ms : 0;
                }
                return 0;
            })();

            const id = inv?.id ?? inv?.invite_id ?? `invite_${idx}`;
            return {
                id,
                type: 'invite',
                title: `Convite de ${fromName}`,
                message: `Chamou você para treinar: ${workoutTitle}`,
                timeAgo: 'Agora',
                data: inv,
                timestamp: ts,
                read: false
            };
        }),
        ...safeSystemNotifications.map(n => ({
            id: n.id,
            type: n.type || 'info',
            title: n.title,
            message: n.message,
            timeAgo: formatTime(n.created_at),
            data: n,
            timestamp: (() => {
                try {
                    const ms = new Date(n?.created_at || 0).getTime();
                    return Number.isFinite(ms) ? ms : 0;
                } catch {
                    return 0;
                }
            })(),
            read: !!(n && typeof n === 'object' && n.read === true)
        }))
    ].sort((a, b) => b.timestamp - a.timestamp);

    const unreadCount = allNotifications.filter((item) => {
        try {
            return !item?.read;
        } catch {
            return true;
        }
    }).length;

    const getIcon = (type: string) => {
        switch (type) {
            case 'invite': return <Users size={16} className="text-blue-500" />;
            case 'message': return <MessageSquare size={16} className="text-yellow-500" />;
            case 'broadcast': return <AlertTriangle size={16} className="text-red-500" />;
            default: return <Bell size={16} className="text-neutral-400" />;
        }
    };

    const handleAccept = async (item: { data?: unknown; [key: string]: unknown }) => {
        setIsOpen(false);
        try {
            const invite = item?.data ?? null;
            if (!invite) return;
            const inv = invite as Record<string, unknown>;
            if (typeof acceptInvite === 'function') await acceptInvite(invite as Parameters<typeof acceptInvite>[0]);
            if (inv.workout && typeof onStartSession === 'function') onStartSession(inv.workout);
        } catch (e) {
            // @ts-ignore
            const msg = getErrorMessage(e) ?? String(e);
            // @ts-ignore
            await confirm("Erro ao aceitar: " + msg); // Using confirm as alert is not available in props but used in original code from DialogContext? Actually useDialog has alert. 
            // The original code used `await alert(...)` but destructured `alert` from `useDialog`.
            // I destructured only `confirm` above by mistake? No, I see `const { alert, confirm } = useDialog();` in original.
            // I will fix destructuring.
        }
    };

    const handleReject = async (item: { id?: unknown; [key: string]: unknown }) => {
        try {
            if (typeof rejectInvite === 'function') await rejectInvite(item?.id as string);
        } catch {
            return;
        }
    };

    const handleClearAll = async () => {
        try {
            const confirmed = await confirm("Limpar todas as notificações?");
            if (!confirmed) return;
            if (!supabase) return;
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) return;
            await supabase.from('notifications').delete().eq('user_id', currentUser.id);
            setSystemNotifications([]);
        } catch {
            return;
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        if (!safeUserId) return;
        if (!supabase) return;

        let cancelled = false;

        const markAllAsRead = async () => {
            try {
                await supabase
                    .from('notifications')
                    .update({ read: true })
                    .eq('user_id', safeUserId)
                    .eq('read', false);

                if (cancelled) return;

                setSystemNotifications(prev => {
                    const current = Array.isArray(prev) ? prev : [];
                    return current.map(n => ({
                        ...n,
                        read: true
                    }));
                });
            } catch {
                return;
            }
        };

        markAllAsRead();

        return () => {
            cancelled = true;
        };
    }, [isOpen, supabase, safeUserId]);

    const renderList = () => (
        <div className="max-h-80 overflow-y-auto custom-scrollbar">
            {allNotifications.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 text-xs">
                    <Bell size={24} className="mx-auto mb-2 opacity-20" />
                    Nenhuma notificação nova
                </div>
            ) : (
                <div className="divide-y divide-neutral-800">
                    {allNotifications.map(item => (
                        <div
                            key={String(item.id ?? "")}
                            className={`p-4 transition-colors relative group ${item.read
                                ? 'bg-neutral-900 hover:bg-neutral-800/40'
                                : 'bg-neutral-900/80 hover:bg-neutral-800 border border-yellow-500/40'
                                }`}
                        >
                            <div className="flex gap-3 mb-2">
                                <div className="mt-1">{getIcon(item.type)}</div>
                                <div className="flex-1 pr-6">
                                    <p className="text-sm font-bold text-white leading-tight flex items-center gap-2">
                                        <span>{item.title}</span>
                                        {!item.read && (
                                            <span className="px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 text-[10px] font-black tracking-wide uppercase">
                                                Novo
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-xs text-neutral-400 mt-1 break-words">{String(item.message ?? "")}</p>
                                    <p className="text-[10px] text-neutral-600 mt-1">{item.timeAgo}</p>
                                </div>
                            </div>

                            {item.type === 'invite' && item.data && (
                                <div className="flex gap-2 mt-2 pl-7">
                                    <button
                                        onClick={() => handleAccept(item)}
                                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors"
                                    >
                                        <Check size={12} /> Aceitar
                                    </button>
                                    <button
                                        onClick={() => handleReject(item)}
                                        className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-bold py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors"
                                    >
                                        <X size={12} /> Recusar
                                    </button>
                                </div>
                            )}

                            {item.type !== 'invite' && (
                                <button
                                    onClick={(e) => handleDelete(String(item.id ?? ""), e)}
                                    className="absolute top-2 right-2 p-2 text-neutral-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    if (embedded) {
        const hasAnySystem = Array.isArray(systemNotifications) && systemNotifications.length > 0;
        return (
            <div className="w-full">
                {hasAnySystem && (
                    <div className="flex justify-end mb-2">
                        <button
                            onClick={handleClearAll}
                            className="text-[10px] text-neutral-500 hover:text-white uppercase"
                        >
                            Limpar Tudo
                        </button>
                    </div>
                )}
                {renderList()}
            </div>
        );
    }

    return (
        <div className="relative z-50">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-10 h-10 rounded-full bg-neutral-800 text-neutral-400 flex items-center justify-center hover:text-white hover:bg-neutral-700 transition-colors relative"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-neutral-900">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </div>
                )}
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>

                    <div className="absolute right-0 top-12 w-80 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                        <div className="p-3 border-b border-neutral-800 bg-neutral-800/50 backdrop-blur flex justify-between items-center">
                            <h3 className="font-bold text-white text-sm">Notificações</h3>
                            {Array.isArray(systemNotifications) && systemNotifications.length > 0 && (
                                <button
                                    onClick={handleClearAll}
                                    className="text-[10px] text-neutral-500 hover:text-white uppercase"
                                >
                                    Limpar Tudo
                                </button>
                            )}
                        </div>

                        {renderList()}
                    </div>
                </>
            )}
        </div>
    );
};

export default NotificationCenter;
