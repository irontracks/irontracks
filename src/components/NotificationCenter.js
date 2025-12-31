import React, { useState, useEffect, useMemo } from 'react';
import { Bell, Check, X, Users, MessageSquare, AlertTriangle, Trash2 } from 'lucide-react';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';
import { useDialog } from '@/contexts/DialogContext';
import { createClient } from '@/utils/supabase/client';

const NotificationCenter = ({ onStartSession, user, initialOpen, embedded }) => {
    const { alert, confirm } = useDialog();
    const [isOpen, setIsOpen] = useState(() => !!initialOpen);
    const { incomingInvites, acceptInvite, rejectInvite } = useTeamWorkout();
    const [systemNotifications, setSystemNotifications] = useState([]);
    const supabase = useMemo(() => createClient(), []);

    useEffect(() => {
        if (!user?.id) return;

        let isMounted = true;
        let channel;

        const fetchNotifications = async () => {
            try {
                const { data } = await supabase
                    .from('notifications')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (isMounted) {
                    setSystemNotifications(data || []);
                }
            } catch {
                if (isMounted) {
                    setSystemNotifications([]);
                }
            }
        };

        fetchNotifications();

        channel = supabase
            .channel(`notifications:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, (payload) => {
                setSystemNotifications(prev => [payload.new, ...prev]);
            })
            .subscribe();

        return () => {
            isMounted = false;
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [supabase, user?.id]);

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        setSystemNotifications(prev => prev.filter(n => n.id !== id));
        await supabase.from('notifications').delete().eq('id', id);
    };

    const formatTime = (isoString) => {
        if (!isoString) return 'Agora';
        const date = new Date(isoString);
        const now = new Date();
        const diff = (now - date) / 1000;

        if (diff < 60) return 'Agora';
        if (diff < 3600) return `${Math.floor(diff/60)}m atrás`;
        if (diff < 86400) return `${Math.floor(diff/3600)}h atrás`;
        return date.toLocaleDateString();
    };

    const allNotifications = [
        ...incomingInvites.map(inv => ({
            id: inv.id,
            type: 'invite',
            title: `Convite de ${inv.from.displayName}`,
            message: `Chamou você para treinar: ${inv.workout?.title || 'Treino'}`,
            timeAgo: 'Agora',
            data: inv,
            timestamp: typeof inv?.created_at === 'string' ? Date.parse(inv.created_at) : 0
        })),
        ...systemNotifications.map(n => ({
            id: n.id,
            type: n.type || 'info',
            title: n.title,
            message: n.message,
            timeAgo: formatTime(n.created_at),
            data: null,
            timestamp: new Date(n.created_at).getTime()
        }))
    ].sort((a, b) => b.timestamp - a.timestamp);

    const unreadCount = allNotifications.length;

    const getIcon = (type) => {
        switch (type) {
            case 'invite': return <Users size={16} className="text-blue-500" />;
            case 'message': return <MessageSquare size={16} className="text-yellow-500" />;
            case 'broadcast': return <AlertTriangle size={16} className="text-red-500" />;
            default: return <Bell size={16} className="text-neutral-400" />;
        }
    };

    const handleAccept = async (item) => {
        setIsOpen(false);
        try {
            await acceptInvite(item.data);
            if (item.data.workout && onStartSession) {
                onStartSession(item.data.workout);
            }
        } catch (e) {
            await alert("Erro ao aceitar: " + (e?.message ?? String(e)));
        }
    };

    const handleReject = async (item) => {
        await rejectInvite(item.id);
    };

    const handleClearAll = async () => {
        const confirmed = await confirm("Limpar todas as notificações?");
        if (!confirmed) return;
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser) return;
        await supabase.from('notifications').delete().eq('user_id', currentUser.id);
        setSystemNotifications([]);
    };

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
                        <div key={item.id} className="p-4 hover:bg-neutral-800/50 transition-colors relative group">
                            <div className="flex gap-3 mb-2">
                                <div className="mt-1">{getIcon(item.type)}</div>
                                <div className="flex-1 pr-6">
                                    <p className="text-sm font-bold text-white leading-tight">{item.title}</p>
                                    <p className="text-xs text-neutral-400 mt-1 break-words">{item.message}</p>
                                    <p className="text-[10px] text-neutral-600 mt-1">{item.timeAgo}</p>
                                </div>
                            </div>

                            {item.type === 'invite' && (
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
                                    onClick={(e) => handleDelete(item.id, e)}
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
        return (
            <div className="w-full">
                {systemNotifications.length > 0 && (
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
                            {systemNotifications.length > 0 && (
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
