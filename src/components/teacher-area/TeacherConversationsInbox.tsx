'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Loader2, ChevronRight, RefreshCw } from 'lucide-react';
import { OPEN_TEACHER_CHAT_EVENT } from './TeacherChatHost';

interface Conversation {
    userId: string;
    name: string;
    channelId: string | null;
    lastMessage: string | null;
    lastMessageAt: string | null;
    unreadCount: number;
    photo: string | null;
    isOnline: boolean;
}

/** Hora curta pra linha da conversa: HH:MM se hoje, senão dd/mm. */
function formatWhen(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Inbox do professor: uma linha por aluno, com última mensagem e não-lidas. Clicar abre o
 * chat 1:1 via o mesmo evento global (TeacherChatHost monta o ChatDirectScreen).
 */
export const TeacherConversationsInbox: React.FC = () => {
    const [items, setItems] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/teacher/conversations', { credentials: 'include' });
            const json = await res.json();
            if (!res.ok || !json?.ok) throw new Error(String(json?.error || 'Falha'));
            setItems(Array.isArray(json.conversations) ? json.conversations : []);
        } catch {
            setError('Não foi possível carregar as conversas.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const openChat = (c: Conversation) => {
        window.dispatchEvent(new CustomEvent(OPEN_TEACHER_CHAT_EVENT, {
            detail: { userId: c.userId, name: c.name, photo: c.photo },
        }));
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-white">Conversas</h2>
                <button type="button" onClick={() => void load()} aria-label="Atualizar" className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors">
                    <RefreshCw size={16} />
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12 text-neutral-500 gap-2">
                    <Loader2 size={18} className="animate-spin" /> <span className="text-sm">Carregando...</span>
                </div>
            ) : error ? (
                <div className="text-center py-10">
                    <p className="text-sm text-neutral-400">{error}</p>
                    <button type="button" onClick={() => void load()} className="mt-3 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold">Tentar de novo</button>
                </div>
            ) : items.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-neutral-800 rounded-2xl">
                    <div className="w-14 h-14 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto mb-3">
                        <MessageSquare size={26} className="text-neutral-600" />
                    </div>
                    <p className="text-white font-bold">Nenhuma conversa ainda</p>
                    <p className="text-neutral-500 text-sm mt-1">Abra um aluno e toque em &ldquo;Conversar&rdquo; para começar.</p>
                </div>
            ) : (
                <div className="space-y-1">
                    {items.map((c) => {
                        const initial = (c.name || 'A').charAt(0).toUpperCase();
                        return (
                            <button
                                key={c.userId}
                                type="button"
                                onClick={() => openChat(c)}
                                className="w-full flex items-center gap-3 p-3 rounded-2xl text-left hover:bg-neutral-800/70 transition-colors"
                            >
                                <span className="relative flex-shrink-0">
                                    <span className="h-11 w-11 rounded-full bg-neutral-700 text-neutral-100 flex items-center justify-center font-black">{initial}</span>
                                    {c.isOnline && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-neutral-950" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-bold text-white truncate">{c.name}</span>
                                        <span className="text-[11px] text-neutral-500 flex-shrink-0">{formatWhen(c.lastMessageAt)}</span>
                                    </span>
                                    <span className="flex items-center justify-between gap-2 mt-0.5">
                                        <span className="text-xs text-neutral-400 truncate">{c.lastMessage || 'Toque para conversar'}</span>
                                        {c.unreadCount > 0 && (
                                            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-yellow-500 text-black text-[11px] font-black flex items-center justify-center">{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>
                                        )}
                                    </span>
                                </span>
                                <ChevronRight size={16} className="text-neutral-600 flex-shrink-0" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default TeacherConversationsInbox;
