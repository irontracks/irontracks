'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { AdminUser } from '@/types/admin';

const ChatDirectScreen = dynamic(() => import('@/components/ChatDirectScreen'), { ssr: false });

/**
 * Evento global para abrir o chat 1:1 com um aluno de dentro do painel/Área do professor.
 * Mesmo desacoplamento do TeacherControlHost: quem quer abrir só dispara o evento (não
 * precisa de setView nem do estado do shell); este host monta o ChatDirectScreen num
 * overlay acima de tudo e o fecha voltando pra onde estava.
 */
export const OPEN_TEACHER_CHAT_EVENT = 'irontracks:chat:open';

export interface OpenTeacherChatDetail {
    userId: string;
    name?: string;
    photo?: string | null;
}

const TeacherChatHost: React.FC<{ user: AdminUser }> = ({ user }) => {
    const [target, setTarget] = useState<OpenTeacherChatDetail | null>(null);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<OpenTeacherChatDetail>).detail;
            const userId = String(detail?.userId || '').trim();
            if (!userId) return;
            setTarget({ userId, name: String(detail?.name || ''), photo: detail?.photo ?? null });
        };
        window.addEventListener(OPEN_TEACHER_CHAT_EVENT, handler);
        return () => window.removeEventListener(OPEN_TEACHER_CHAT_EVENT, handler);
    }, []);

    if (!target) return null;

    return (
        <div className="fixed inset-0 z-[70]">
            <ChatDirectScreen
                user={user as unknown as Record<string, unknown>}
                otherUserId={target.userId}
                otherUserName={target.name}
                otherUserPhoto={target.photo ?? null}
                onClose={() => setTarget(null)}
            />
        </div>
    );
};

export default TeacherChatHost;
