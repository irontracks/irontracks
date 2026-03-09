"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import {
    MessageSquare,
    ChevronLeft
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useDialog } from '@/contexts/DialogContext';
import { getErrorMessage } from '@/utils/errorMessage'
import { logError, logWarn, logInfo } from '@/lib/logger'

interface ChatUser {
    id: string;
    display_name?: string | null;
    photo_url?: string | null;
    last_seen?: string | null;
    [key: string]: unknown;
}

interface ProfilePresenceRow {
    id?: string | number | null;
    display_name?: string | null;
    photo_url?: string | null;
    last_seen?: string | null;
}

interface ChatListScreenProps {
    user: { id: string | number } | null;
    onClose: () => void;
    onSelectUser?: (u: ChatUser) => void;
    onSelectChannel?: (ch: { channel_id: string; other_user_id: string; other_user_name: string | null; other_user_photo: string | null }) => void;
}
const ChatListScreen = ({ user, onClose, onSelectUser, onSelectChannel }: ChatListScreenProps) => {
    const [users, setUsers] = useState<ChatUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [nowMs, setNowMs] = useState(0);
    const { alert } = useDialog();
    const supabase = useMemo(() => createClient(), []);
    const safeUserId = user?.id ? String(user.id) : '';

    useEffect(() => {
        const tick = () => setNowMs(Date.now());
        const t = setTimeout(tick, 0);
        const id = setInterval(tick, 60_000);
        return () => {
            clearTimeout(t);
            clearInterval(id);
        };
    }, []);

    const loadUsers = useCallback(async () => {
        try {
            setLoading(true);

            if (!safeUserId) {
                setUsers([]);
                return;
            }

            const { data, error } = await supabase
                .from('profiles')
                .select('id, display_name, photo_url, last_seen')
                .neq('id', safeUserId)
                .order('last_seen', { ascending: false })
                .limit(200);

            if (error) throw error;
            setUsers((data || []) as ChatUser[]);
        } catch (error) {
            logError('error', 'Erro ao carregar contatos:', error);
            const msg = getErrorMessage(error) || String(error || '');
            await alert('Erro ao carregar contatos: ' + msg);
        } finally {
            setLoading(false);
        }
    }, [safeUserId, alert, supabase]);

    useEffect(() => {
        loadUsers();
        const sub = supabase
            .channel('profiles_presence_list')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
                try {
                    const p = payload?.new && typeof payload.new === 'object' ? (payload.new as ProfilePresenceRow) : null
                    const pid = p?.id ? String(p.id) : ''
                    if (!pid) return
                    setUsers((prev) => {
                        const safePrev = Array.isArray(prev) ? prev : []
                        const idx = safePrev.findIndex((u) => u && typeof u === 'object' && String(u.id || '') === pid)
                        if (idx === -1) return safePrev
                        const next = [...safePrev]
                        next[idx] = {
                            ...next[idx],
                            display_name: p?.display_name ?? null,
                            photo_url: p?.photo_url ?? null,
                            last_seen: p?.last_seen ?? null,
                        }
                        return next
                    })
                } catch {
                    return
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(sub); };
    }, [loadUsers, supabase]);

    const isUserOnline = (lastSeen: string | number | null) => {
        if (!lastSeen || !nowMs) return false;
        const ts = new Date(lastSeen).getTime();
        if (!Number.isFinite(ts)) return false;
        const diff = nowMs - ts;
        return Number.isFinite(diff) ? diff < 5 * 60 * 1000 : false;
    };

    const formatLastSeen = (lastSeen: string | number | null) => {
        if (!lastSeen) return 'Nunca';
        if (!nowMs) return '...';
        const ts = new Date(lastSeen).getTime();
        if (!Number.isFinite(ts)) return '...';
        const diff = nowMs - ts;
        if (!Number.isFinite(diff)) return '...';
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Agora';
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;
        return `${Math.floor(hours / 24)}d`;
    };

    const handleOpenChat = async (targetUser: ChatUser) => {
        try {
            const safeTargetId = targetUser?.id ? String(targetUser.id) : '';
            if (!safeUserId || !safeTargetId) {
                await alert('Usuário inválido para iniciar conversa.', 'Erro');
                return;
            }
            const { data: channelId, error } = await supabase
                .rpc('get_or_create_direct_channel', { user1: safeUserId, user2: safeTargetId });
            if (error) throw error;
            if (onSelectChannel) {
                onSelectChannel({
                    channel_id: channelId,
                    other_user_id: safeTargetId,
                    other_user_name: targetUser?.display_name ?? null,
                    other_user_photo: targetUser?.photo_url ?? null
                });
            }
        } catch (e) {
            logError('error', 'Erro ao abrir conversa:', e);
            const msg = getErrorMessage(e) || String(e || '');
            await alert('Erro ao abrir conversa: ' + msg);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 flex flex-col h-[100dvh] overflow-hidden" style={{ background: '#090909' }}>
                <div className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex justify-between items-center sticky top-0 z-20" style={{ background: 'rgba(9,9,9,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                    <div className="h-px absolute bottom-0 left-0 right-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.3), transparent)' }} />
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-white rounded-xl active:scale-95 transition-all" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <ChevronLeft size={20} />
                        </button>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-black" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 12px rgba(234,179,8,0.3)' }}>
                            <MessageSquare size={18} />
                        </div>
                        <h3 className="font-black text-lg text-white">Conversas</h3>
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-neutral-500 text-sm">Carregando...</div>
                </div>
            </div>
        );
    }

    const onlineUsers = users.filter(u => isUserOnline(u.last_seen ?? null));
    const offlineUsers = users.filter(u => !isUserOnline(u.last_seen ?? null));

    return (
        <div className="fixed inset-0 z-50 flex flex-col h-[100dvh] overflow-hidden text-white" style={{ background: '#090909' }}>
            {/* Header */}
            <div className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex justify-between items-center sticky top-0 z-20 relative" style={{ background: 'rgba(9,9,9,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                <div className="h-px absolute bottom-0 left-0 right-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.3), transparent)' }} />
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-white rounded-xl active:scale-95 transition-all" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <ChevronLeft size={20} />
                    </button>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-black" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 12px rgba(234,179,8,0.3)' }}>
                        <MessageSquare size={18} />
                    </div>
                    <div>
                        <h3 className="font-black text-base text-white leading-tight">Conversas</h3>
                        <p className="text-[11px] text-neutral-500">Chat direto com seus contatos</p>
                    </div>
                </div>
            </div>
            <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}>
                <h4 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.18em]">Contatos</h4>
            </div>

            <div className="flex-1 overflow-y-auto pb-[max(env(safe-area-inset-bottom),16px)]">
                {users.length === 0 ? (
                    <div className="p-10 text-center">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <MessageSquare size={32} className="text-neutral-600" />
                        </div>
                        <p className="text-neutral-400 font-bold">Nenhum contato encontrado</p>
                        <p className="text-sm text-neutral-600 mt-1">Crie usuários para iniciar conversas</p>
                    </div>
                ) : (
                    <div>
                        {onlineUsers.length > 0 && (
                            <div className="px-4 py-2" style={{ background: 'rgba(34,197,94,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <p className="text-[10px] font-black text-green-500 uppercase tracking-[0.18em]">● Online — {onlineUsers.length}</p>
                            </div>
                        )}
                        {onlineUsers.map((u, idx) => (
                            <button key={u.id} onClick={() => handleOpenChat(u)} className="w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors hover:bg-white/[0.03] active:bg-white/5 text-left group" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <div className="relative flex-shrink-0">
                                    <div className="w-11 h-11 rounded-full overflow-hidden" style={{ boxShadow: '0 0 0 1.5px rgba(234,179,8,0.25)' }}>
                                        {u.photo_url ? (
                                            <Image src={u.photo_url} width={44} height={44} className="w-full h-full object-cover" alt={u.display_name || 'Usuário'} loading="lazy" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center font-black text-sm" style={{ background: 'rgba(30,30,30,0.99)', color: 'rgba(234,179,8,0.8)' }}>{u.display_name?.[0]?.toUpperCase() || '?'}</div>
                                        )}
                                    </div>
                                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 bg-green-500" style={{ borderColor: '#090909' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <h4 className="font-black text-white text-sm truncate">{u.display_name}</h4>
                                        <span className="text-[11px] text-neutral-600 flex-shrink-0 ml-2">{formatLastSeen(u.last_seen ?? null)}</span>
                                    </div>
                                    <p className="text-xs text-neutral-600 truncate">Toque para conversar</p>
                                </div>
                                <MessageSquare size={16} className="text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </button>
                        ))}
                        {offlineUsers.length > 0 && (
                            <div className="px-4 py-2" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.04)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                <p className="text-[10px] font-black text-neutral-600 uppercase tracking-[0.18em]">● Offline — {offlineUsers.length}</p>
                            </div>
                        )}
                        {offlineUsers.map((u) => (
                            <button key={u.id} onClick={() => handleOpenChat(u)} className="w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors hover:bg-white/[0.03] active:bg-white/5 text-left group" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <div className="relative flex-shrink-0">
                                    <div className="w-11 h-11 rounded-full overflow-hidden" style={{ boxShadow: '0 0 0 1.5px rgba(255,255,255,0.08)' }}>
                                        {u.photo_url ? (
                                            <Image src={u.photo_url} width={44} height={44} className="w-full h-full object-cover" alt={u.display_name || 'Usuário'} loading="lazy" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center font-black text-sm" style={{ background: 'rgba(24,24,24,0.99)', color: 'rgba(120,120,120,0.8)' }}>{u.display_name?.[0]?.toUpperCase() || '?'}</div>
                                        )}
                                    </div>
                                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 bg-neutral-600" style={{ borderColor: '#090909' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <h4 className="font-black text-neutral-300 text-sm truncate">{u.display_name}</h4>
                                        <span className="text-[11px] text-neutral-600 flex-shrink-0 ml-2">{formatLastSeen(u.last_seen ?? null)}</span>
                                    </div>
                                    <p className="text-xs text-neutral-600 truncate">Toque para conversar</p>
                                </div>
                                <MessageSquare size={16} className="text-neutral-600 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatListScreen;
