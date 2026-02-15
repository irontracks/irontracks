import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import {
    ChevronLeft,
    MessageSquare,
    Circle
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useDialog } from '@/contexts/DialogContext';

const ChatUserSearch = ({ user, onClose, onSelectUser }) => {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
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

    const fetchAllUsers = useCallback(async () => {
        if (!safeUserId) {
            setUsers([]);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, display_name, photo_url, last_seen')
                .neq('id', safeUserId)
                .order('last_seen', { ascending: false })
                .limit(200);
            if (error) throw error;
            setUsers(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            const msg = error?.message || String(error || '');
            await alert('Erro ao carregar usuários: ' + msg);
        } finally {
            setLoading(false);
        }
    }, [safeUserId, alert, supabase]);

    useEffect(() => {
        fetchAllUsers();
        const sub = supabase
            .channel('profiles_presence')
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
    }, [fetchAllUsers, supabase]);

    const isUserOnline = (lastSeen) => {
        if (!lastSeen || !nowMs) return false;
        const ts = new Date(lastSeen).getTime();
        if (!Number.isFinite(ts)) return false;
        const diff = nowMs - ts;
        return Number.isFinite(diff) ? diff < 5 * 60 * 1000 : false;
    };

    const handleSelectUser = (selectedUser) => {
        try {
            if (typeof onSelectUser === 'function') onSelectUser(selectedUser);
        } catch {
            return;
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-neutral-900 flex flex-col animate-slide-up">
            <div className="p-4 bg-neutral-800 border-b border-neutral-700 flex items-center gap-3 shadow-lg h-16 items-center pt-safe sticky top-0 z-20">
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-neutral-200 hover:text-white">
                    <ChevronLeft size={20} />
                </button>
                <div className="flex-1">
                    <h3 className="font-bold text-lg text-white">Nova Conversa</h3>
                    <p className="text-xs text-neutral-400">Encontre alguém para conversar</p>
                </div>
            </div>

            <div className="p-4 border-b border-neutral-800">
                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Contatos</h3>
            </div>

            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="p-8 text-center text-neutral-500">
                        <div className="animate-spin w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p>Buscando usuários...</p>
                    </div>
                ) : (
                    <div className="divide-y divide-neutral-800">
                        {users.map((user) => (
                            <button
                                key={user.id}
                                onClick={() => handleSelectUser(user)}
                                className="w-full p-4 hover:bg-neutral-800/50 transition-colors group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        {user.photo_url ? (
                                            <Image
                                                src={user.photo_url}
                                                width={48}
                                                height={48}
                                                className="rounded-full object-cover"
                                                alt={user.display_name}
                                            />
                                        ) : (
                                            <div className="w-12 h-12 bg-neutral-700 rounded-full flex items-center justify-center font-bold text-white">
                                                {user.display_name?.[0] || '?'}
                                            </div>
                                        )}
                                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-neutral-900 ${isUserOnline(user.last_seen) ? 'bg-green-500' : 'bg-neutral-600'}`}></div>
                                    </div>

                                    <div className="flex-1 min-w-0 text-left">
                                        <h4 className="font-semibold text-white truncate group-hover:text-yellow-400 transition-colors">
                                            {user.display_name}
                                        </h4>
                                        <div className="flex items-center gap-1 text-xs text-neutral-400">
                                            {isUserOnline(user.last_seen) ? (
                                                <>
                                                    <Circle size={8} className="text-green-500 fill-green-500" />
                                                    <span className="text-green-500">Online</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Circle size={8} className="text-neutral-500" />
                                                    <span>Offline</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MessageSquare size={20} />
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatUserSearch;
