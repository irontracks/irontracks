import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import {
    MessageSquare,
    Circle,
    ChevronLeft
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useDialog } from '@/contexts/DialogContext';

const ChatListScreen = ({ user, onClose, onSelectUser, onSelectChannel }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [nowMs, setNowMs] = useState(0);
    const { alert } = useDialog();
    const supabase = useMemo(() => createClient(), []);

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

            if (!user?.id) {
                setUsers([]);
                return;
            }
            
            const { data, error } = await supabase
                .from('profiles')
                .select('id, display_name, photo_url, last_seen')
                .neq('id', user.id)
                .order('last_seen', { ascending: false })
                .limit(200);

            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error('Erro ao carregar contatos:', error);
            const msg = error?.message || String(error || '');
            await alert('Erro ao carregar contatos: ' + msg);
        } finally {
            setLoading(false);
        }
    }, [user?.id, alert, supabase]);

    useEffect(() => {
        loadUsers();
        const sub = supabase
            .channel('profiles_presence_list')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
                try {
                    const p = payload?.new && typeof payload.new === 'object' ? payload.new : null
                    const pid = p?.id ? String(p.id) : ''
                    if (!pid) return
                    setUsers((prev) => {
                        const safePrev = Array.isArray(prev) ? prev : []
                        const idx = safePrev.findIndex((u) => u && typeof u === 'object' && String(u.id || '') === pid)
                        if (idx === -1) return safePrev
                        const next = [...safePrev]
                        next[idx] = {
                            ...next[idx],
                            display_name: p?.display_name,
                            photo_url: p?.photo_url,
                            last_seen: p?.last_seen,
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

    const isUserOnline = (lastSeen) => {
        if (!lastSeen || !nowMs) return false;
        const diff = nowMs - new Date(lastSeen).getTime();
        return diff < 5 * 60 * 1000;
    };

    const formatLastSeen = (lastSeen) => {
        if (!lastSeen) return 'Nunca';
        if (!nowMs) return '...';
        const diff = nowMs - new Date(lastSeen).getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Agora';
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;
        return `${Math.floor(hours / 24)}d`;
    };

    const handleOpenChat = async (targetUser) => {
        try {
            if (!user?.id || !targetUser?.id) {
                await alert('Usuário inválido para iniciar conversa.', 'Erro');
                return;
            }
            const { data: channelId, error } = await supabase
                .rpc('get_or_create_direct_channel', { user1: user.id, user2: targetUser.id });
            if (error) throw error;
            if (onSelectChannel) {
                onSelectChannel({
                    channel_id: channelId,
                    other_user_id: targetUser.id,
                    other_user_name: targetUser.display_name,
                    other_user_photo: targetUser.photo_url
                });
            }
        } catch (e) {
            console.error('Erro ao abrir conversa:', e);
            const msg = e?.message || String(e || '');
            await alert('Erro ao abrir conversa: ' + msg);
        }
    };

	if (loading) {
			return (
			<div className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col h-[100dvh] overflow-hidden">
				<div className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center sticky top-0 z-20 shadow-lg shadow-black/30">
					<div className="flex items-center gap-3">
						<button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-neutral-200 hover:text-white rounded-full bg-neutral-900 border border-neutral-700 active:scale-95 transition-transform">
							<ChevronLeft size={20} />
						</button>
						<div className="bg-yellow-500 p-2 rounded-full text-black"><MessageSquare size={20} /></div>
						<h3 className="font-bold text-lg text-white">Conversas</h3>
					</div>
				</div>
				<div className="flex-1 flex items-center justify-center">
					<div className="text-neutral-500">Carregando...</div>
				</div>
			</div>
		);
	}

    const onlineUsers = users.filter(u => isUserOnline(u.last_seen));
    const offlineUsers = users.filter(u => !isUserOnline(u.last_seen));

		return (
		<div className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col h-[100dvh] overflow-hidden">
			<div className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center sticky top-0 z-20 shadow-lg shadow-black/30">
				<div className="flex items-center gap-3">
					<button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-neutral-200 hover:text-white rounded-full bg-neutral-900 border border-neutral-700 active:scale-95 transition-transform">
						<ChevronLeft size={20} />
					</button>
					<div className="bg-yellow-500 p-2 rounded-full text-black"><MessageSquare size={20} /></div>
					<div>
						<h3 className="font-bold text-lg text-white">Conversas</h3>
						<p className="text-xs text-neutral-400">Chat direto com seus contatos</p>
					</div>
				</div>
				<div className="flex gap-2"></div>
			</div>
			<div className="p-4 border-b border-neutral-800">
				<h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Contatos</h4>
			</div>

			<div className="flex-1 overflow-y-auto pb-[max(env(safe-area-inset-bottom),16px)]">
				{users.length === 0 ? (
					<div className="p-8 text-center text-neutral-500">
						<MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
                        <p className="text-lg mb-2">Nenhum contato encontrado</p>
                        <p className="text-sm">Crie usuários para iniciar conversas</p>
                    </div>
                ) : (
                    <div className="divide-y divide-neutral-800">
                        {onlineUsers.length > 0 && (
                            <div className="px-4 py-2 bg-neutral-800/30 sticky top-0 z-10">
                                <p className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Online</p>
                            </div>
                        )}
                        {onlineUsers.map((u) => (
                            <button key={u.id} onClick={() => handleOpenChat(u)} className="w-full p-4 hover:bg-neutral-800/50 transition-colors group">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        {u.photo_url ? (
                                            <Image src={u.photo_url} width={48} height={48} className="rounded-full object-cover" alt={u.display_name} />
                                        ) : (
									<div className="w-12 h-12 bg-neutral-700 rounded-full flex items-center justify-center font-bold text-white">{u.display_name?.[0] || '?'}</div>
                                        )}
                                        <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-neutral-900 bg-green-500"></div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <h4 className="font-semibold text-white truncate">{u.display_name}</h4>
                                            <span className="text-xs text-neutral-400">{formatLastSeen(u.last_seen)}</span>
                                        </div>
                                        <p className="text-sm text-neutral-500 truncate">Toque para conversar</p>
                                    </div>
                                    <div className="text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity"><MessageSquare size={20} /></div>
                                </div>
                            </button>
                        ))}
                        {offlineUsers.length > 0 && (
                            <div className="px-4 py-2 bg-neutral-800/30">
                                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Offline</p>
                            </div>
                        )}
                        {offlineUsers.map((u) => (
                            <button key={u.id} onClick={() => handleOpenChat(u)} className="w-full p-4 hover:bg-neutral-800/50 transition-colors group">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        {u.photo_url ? (
                                            <Image src={u.photo_url} width={48} height={48} className="rounded-full object-cover" alt={u.display_name} />
                                        ) : (
									<div className="w-12 h-12 bg-neutral-700 rounded-full flex items-center justify-center font-bold text-white">{u.display_name?.[0] || '?'}</div>
                                        )}
                                        <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-neutral-900 bg-neutral-600"></div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <h4 className="font-semibold text-white truncate">{u.display_name}</h4>
                                            <span className="text-xs text-neutral-400">{formatLastSeen(u.last_seen)}</span>
                                        </div>
                                        <p className="text-sm text-neutral-500 truncate">Toque para conversar</p>
                                    </div>
                                    <div className="text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity"><MessageSquare size={20} /></div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatListScreen;
