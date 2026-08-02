"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import {
    ChevronLeft,
    Send,
    Image as ImageIcon,
    Smile,
    Link2,
    Trash2,
    Plus,
    RotateCw
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useDialog } from '@/contexts/DialogContext';
import { useToast } from '@/contexts/ToastContext';
import { compressImage, generateImageThumbnail } from '@/utils/chat/media';
import { logError } from '@/lib/logger'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { apiChat, apiStorage } from '@/lib/api'
import { useBackHandler } from '@/hooks/useBackHandler'

interface ChatUser {
    uid: string
    displayName: string
    photoUrl?: string | null
    email?: string | null
    last_seen?: string | null
}


interface MessageRow {
    id: string
    user_id: string
    content?: string | null
    created_at: string
    attachments?: unknown[]
    // Estado de envio otimista. Indefinido = mensagem já confirmada no servidor
    // (caminho normal carregado/realtime). 'sending' = bolha local temporária
    // aguardando confirmação do insert. 'failed' = insert falhou, oferece Reenviar.
    _sendStatus?: 'sending' | 'failed'
    [key: string]: unknown
}

interface ChatDirectScreenProps {
    user: Record<string, unknown> | null
    targetUser?: Record<string, unknown> | null
    otherUserId?: string
    otherUserName?: string
    otherUserPhoto?: string | null
    onClose: () => void
}

const CHAT_MEDIA_PREVIEW_SIZE = 800;

/**
 * Resolve a URL de mídia de uma DM. Mídia do bucket privado chat-media é servida pela rota
 * autorizada /api/chat/media (signed URL + gate de participação); GIFs/URLs externas (giphy)
 * passam direto. Sem isto, a mídia ficava em URL pública permanente (qualquer um com o link baixava).
 */
const chatMediaSrc = (u: unknown): string => {
  const s = String(u ?? '').trim();
  if (!s) return '';
  if (s.includes('/chat-media/')) return `/api/chat/media?u=${encodeURIComponent(s)}`;
  return s;
};

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

const toMessageRow = (raw: Record<string, unknown>): MessageRow => {
    const id = String(raw.id ?? '').trim()
    const userId = String(raw.sender_id ?? raw.user_id ?? '').trim()
    const createdAt = String(raw.created_at ?? '').trim()
    const content = raw.content == null ? null : String(raw.content)
    const attachments = Array.isArray(raw.attachments) ? raw.attachments : undefined
    return {
        ...(raw as Record<string, unknown>),
        id,
        user_id: userId,
        created_at: createdAt,
        content,
        attachments,
    }
}

const ChatDirectScreen = ({ user, targetUser, otherUserId, otherUserName, otherUserPhoto, onClose }: ChatDirectScreenProps) => {
    const [messages, setMessages] = useState<MessageRow[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [nowMs, setNowMs] = useState(0);
    const [otherUser, setOtherUser] = useState<ChatUser | null>(null);
    const [_isTyping, _setIsTyping] = useState(false);
    const [channelId, setChannelId] = useState<string | null>(null);
    const [oldestCreatedAt, setOldestCreatedAt] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const { alert, prompt, confirm } = useDialog();
    const { toast } = useToast();
    const supabase = useMemo(() => createClient(), []);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const prependingRef = useRef(false);
    const _typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [showEmoji, setShowEmoji] = useState(false);
    const [kbOpen, setKbOpen] = useState(false);
    const [showActions, setShowActions] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [debugChat, setDebugChat] = useState(false);
    const [sendingGif, setSendingGif] = useState(false);

    useBackHandler(true, onClose);

    const userObj: Record<string, unknown> = isRecord(user) ? user : {}
    const targetObj: Record<string, unknown> = isRecord(targetUser) ? targetUser : {}

    const handleDeleteMessage = async (message: MessageRow) => {
        const id = message?.id ? String(message.id) : '';
        if (!id) return;
        const ok = await confirm('Tem certeza que deseja deletar esta mensagem?\nEssa ação é irreversível.', 'Deletar mensagem', { confirmText: 'Deletar', cancelText: 'Cancelar' });
        if (!ok) return;
        try {
            const json = await apiChat.deleteMessage(id, 'direct').catch(() => ({ ok: false })) as Record<string, unknown>;
            if (!json?.ok) throw new Error((json?.error as string | undefined) || 'Erro ao deletar mensagem.');
            setMessages((prev) => prev.filter((m) => String(m?.id || '') !== id));
        } catch (e) {
            const msg = (e as Record<string, unknown>)?.message
            await alert(typeof msg === 'string' ? msg : 'Erro ao deletar mensagem.');
        }
    };

    const resolvedOtherUserId = String(targetObj?.id ?? otherUserId ?? '').trim();
    const resolvedOtherUserName = String(targetObj?.display_name ?? targetObj?.name ?? otherUserName ?? '').trim();
    const resolvedOtherUserPhoto = (targetObj?.photo_url ?? targetObj?.photoURL ?? otherUserPhoto) as string | null | undefined;
    const safeUserId = userObj?.id ? String(userObj.id) : '';

    useEffect(() => {
        const tick = () => setNowMs(Date.now());
        const t = setTimeout(tick, 0);
        const id = setInterval(tick, 60_000);
        try {
            const byEnv = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_DEBUG_CHAT === '1';
            const byQS = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugChat') === '1';
            const byLS = typeof window !== 'undefined' && localStorage.getItem('debug_chat') === '1';
            setDebugChat(Boolean(byEnv || byQS || byLS));
        } catch { }
        return () => {
            clearTimeout(t);
            clearInterval(id);
        };
    }, []);

    const loadOtherUser = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('profiles_public')
                .select('id, display_name, photo_url, last_seen')
                .eq('id', resolvedOtherUserId)
                .single();

            if (error) throw error;
            const row: Record<string, unknown> = isRecord(data) ? data : {}
            const normalized: ChatUser = {
                uid: String(row.id ?? resolvedOtherUserId),
                displayName: String(row.display_name ?? resolvedOtherUserName ?? 'Usuário'),
                photoUrl: row.photo_url != null ? String(row.photo_url) : null,
                email: null,
            }
            setOtherUser({ ...normalized, last_seen: row.last_seen ?? null } as ChatUser);
        } catch (error) {
            logError('error', 'Erro ao carregar usuário:', error);
        }
    }, [resolvedOtherUserId, resolvedOtherUserName, supabase]);

    const getOrCreateChannel = useCallback(async () => {
        try {
            if (!safeUserId || !resolvedOtherUserId) {
                const err = new Error('Usuário inválido para iniciar conversa.');
                throw err;
            }
            const { data: channelIdRes, error } = await supabase
                .rpc('get_or_create_direct_channel', {
                    user1: safeUserId,
                    user2: resolvedOtherUserId
                });

            if (error) throw error;
            const nextChannelId = String(channelIdRes ?? '').trim()
            if (!nextChannelId) throw new Error('Canal inválido.')
            setChannelId(nextChannelId);
            return nextChannelId;
        } catch (error) {
            logError('error', 'Erro ao obter canal:', error);
            const msg = String((error as Record<string, unknown>)?.message ?? error ?? '');
            if (/dm_blocked/i.test(msg) || /row-level security/i.test(msg) || /policy/i.test(msg)) {
                await alert('Não foi possível iniciar a conversa. Um dos usuários desativou mensagens diretas nas configurações.');
            } else if (/forbidden/i.test(msg)) {
                await alert('Não foi possível iniciar a conversa: acesso negado.');
            } else {
                await alert('Erro ao iniciar conversa: ' + msg);
            }
            throw error;
        }
    }, [alert, resolvedOtherUserId, safeUserId, supabase]);

    const markMessagesAsRead = useCallback(async (targetChannelId: string) => {
        const safeChannelId = String(targetChannelId || '').trim();
        if (!safeChannelId) return;
        try {
            await supabase
                .from('direct_messages')
                .update({ is_read: true })
                .eq('channel_id', safeChannelId)
                .eq('sender_id', resolvedOtherUserId)
                .eq('is_read', false);
        } catch (error) {
            const msg = String((error as Record<string, unknown>)?.message ?? error ?? '');
            if (msg.includes('Abort') || msg.includes('ERR_ABORTED')) return;
            logError('error', 'Erro ao marcar como lido:', error);
        }
    }, [resolvedOtherUserId, supabase]);

    const loadMessages = useCallback(async (channelId: string, beforeTs: string | null = null) => {
        try {
            let query = supabase
                .from('direct_messages')
                .select('id, channel_id, sender_id, content, created_at')
                .eq('channel_id', channelId)
                .order('created_at', { ascending: true })
                .limit(50);

            if (beforeTs) {
                query = query.lt('created_at', beforeTs);
            }

            const { data, error } = await query;

            if (error) throw error;

            const rawRows: Array<Record<string, unknown>> = Array.isArray(data) ? data.filter(isRecord) : [];
            const senderIds = Array.from(new Set(rawRows.map((m) => String(m.sender_id ?? m.user_id ?? '')).filter(Boolean)));
            const profilesMap: Record<string, Record<string, unknown>> = {};
            if (senderIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles_public')
                    .select('id, display_name, photo_url')
                    .in('id', senderIds);
                (Array.isArray(profiles) ? profiles.filter(isRecord) : []).forEach((p: Record<string, unknown>) => {
                    const pid = String(p.id ?? '').trim()
                    if (pid) profilesMap[pid] = p
                });
            }
            const withSenders: MessageRow[] = rawRows.map((m) => {
                const senderId = String(m.sender_id ?? m.user_id ?? '').trim()
                const base = toMessageRow(m)
                return { ...base, sender: profilesMap[senderId] ?? null }
            });
            setMessages(prev => {
                const merged = beforeTs ? [...withSenders, ...prev] : withSenders;
                const seen = new Set<string>();
                const dedup: MessageRow[] = [];
                for (const m of merged) { if (!seen.has(m.id)) { seen.add(m.id); dedup.push(m); } }
                return dedup;
            });

            if (withSenders.length > 0) {
                setOldestCreatedAt(withSenders[0].created_at);
            } else if (beforeTs) {
                setHasMore(false);
            }

            await markMessagesAsRead(channelId);
        } catch (error) {
            const msg = String((error as Record<string, unknown>)?.message ?? error ?? '');
            if (msg.includes('Abort') || msg.includes('ERR_ABORTED')) {
                return;
            }
            logError('error', 'Erro ao carregar mensagens:', error);
            await alert('Erro ao carregar mensagens: ' + msg);
        }
    }, [alert, markMessagesAsRead, supabase]);

    const setupRealtime = useCallback((channelId: string) => {
        const subscription = supabase
            .channel(`chat:${channelId}`)
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'direct_messages',
                    filter: `channel_id=eq.${channelId}`
                },
                async (payload: Record<string, unknown>) => {
                    try {
                        const newMessageRaw = isRecord(payload?.new) ? (payload.new as Record<string, unknown>) : null
                        if (!newMessageRaw) return
                        const senderId = String(newMessageRaw?.sender_id ?? newMessageRaw?.user_id ?? '').trim()

                        let senderData = null
                        if (senderId) {
                            const { data } = await supabase
                                .from('profiles_public')
                                .select('display_name, photo_url')
                                .eq('id', senderId)
                                .maybeSingle()
                            senderData = isRecord(data) ? data : null
                        }

                        const messageWithSender: MessageRow = { ...toMessageRow(newMessageRaw), sender: senderData }

                        setMessages((prev) => {
                            const safePrev = Array.isArray(prev) ? prev : []
                            const msgId = newMessageRaw?.id ? String(newMessageRaw.id) : ''
                            if (msgId && safePrev.some((m) => String(m?.id || '') === msgId)) return safePrev
                            return [...safePrev, messageWithSender]
                        })

                        const myId = userObj?.id ? String(userObj.id) : ''
                        if (senderId && myId && senderId !== myId && newMessageRaw?.is_read !== true) {
                            await markMessagesAsRead(channelId)
                        }
                    } catch (e) {
                        logError('error', 'Erro ao processar mensagem realtime (direct):', e)
                        return
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [markMessagesAsRead, supabase, userObj?.id]);

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;
        (async () => {
            try {
                setLoading(true);
                await loadOtherUser();
                const id = await getOrCreateChannel();
                await loadMessages(id);
                unsubscribe = setupRealtime(id);
            } catch (error) {
                logError('error', 'Erro ao inicializar chat:', error);
            } finally {
                setLoading(false);
            }
        })();
        return () => { if (unsubscribe) unsubscribe(); };
    }, [loadOtherUser, getOrCreateChannel, loadMessages, setupRealtime]);

    const scrollToBottom = useCallback(() => {
        // Dois requestAnimationFrame: garante que o layout (flex justify-end,
        // imagens, ajuste do teclado) já assentou antes de medir scrollHeight,
        // senão o scroll para num ponto desatualizado.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const node = scrollContainerRef.current;
                if (node) node.scrollTop = node.scrollHeight;
            });
        });
    }, []);

    // Mantém a conversa sempre no rodapé ("atualizada"): ao abrir (depois que
    // carrega), a cada nova mensagem recebida/enviada e quando o teclado abre.
    useEffect(() => {
        if (loading) return;
        // Paginação (carregar mensagens antigas) faz prepend — não rola pro fim,
        // senão o usuário é jogado de volta ao ler o histórico.
        if (prependingRef.current) { prependingRef.current = false; return; }
        scrollToBottom();
    }, [messages, loading, kbOpen, scrollToBottom]);

    // Cola o container do chat na viewport VISÍVEL (visualViewport) para a barra
    // de input grudar no topo do teclado — elimina o espaço morto preto entre o
    // input e o teclado no iOS/WKWebView (onde a layout viewport não encolhe).
    useEffect(() => {
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        const el = rootRef.current;
        if (!vv || !el) return;
        const apply = () => {
            const h = vv.height;
            // Guarda contra valores improváveis que colapsariam o container.
            if (!Number.isFinite(h) || h < 200) return;
            // iOS rola a página ao focar o input, deslocando elementos `fixed` e
            // criando o espaço morto entre a barra e o teclado. Cancelamos esse
            // scroll e fixamos o container exatamente na viewport visível.
            if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
            el.style.top = `${vv.offsetTop}px`;
            el.style.height = `${h}px`;
            el.style.bottom = 'auto';
            const open = window.innerHeight - h > 120;
            setKbOpen((prev) => (prev === open ? prev : open));
        };
        apply();
        vv.addEventListener('resize', apply);
        vv.addEventListener('scroll', apply);
        return () => {
            vv.removeEventListener('resize', apply);
            vv.removeEventListener('scroll', apply);
            el.style.top = '';
            el.style.height = '';
            el.style.bottom = '';
        };
    }, [loading]);

    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const onScroll = async () => {
            if (el.scrollTop <= 10 && hasMore && !loadingMore && oldestCreatedAt && channelId) {
                prependingRef.current = true; // a próxima mudança em messages é paginação (prepend)
                setLoadingMore(true);
                await loadMessages(channelId, oldestCreatedAt);
                setLoadingMore(false);
            }
        };
        el.addEventListener('scroll', onScroll);
        return () => el.removeEventListener('scroll', onScroll);
    }, [hasMore, loadingMore, oldestCreatedAt, channelId, loadMessages]);

    // Presença "estou vendo esta conversa": enquanto o chat está aberto E em
    // foreground, avisa o servidor pra NÃO enviar push/banner de mensagens deste
    // contato (você já as recebe em tempo real). Renova a cada 20s; limpa ao
    // sair da tela ou quando o app vai pra segundo plano.
    useEffect(() => {
        if (!resolvedOtherUserId || !safeUserId) return;
        let alive = true;
        const ping = (active: boolean) => {
            void fetch('/api/chat/presence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otherUserId: resolvedOtherUserId, active }),
                keepalive: !active,
            }).catch(() => { });
        };
        const refresh = () => { if (alive && document.visibilityState === 'visible') ping(true); };
        const onVisibility = () => (document.visibilityState === 'visible' ? ping(true) : ping(false));
        refresh();
        document.addEventListener('visibilitychange', onVisibility);
        const interval = setInterval(refresh, 20000);
        return () => {
            alive = false;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
            ping(false);
        };
    }, [resolvedOtherUserId, safeUserId]);

    // Dispara push pro destinatário (fire-and-forget). A rota já valida canal
    // compartilhado, preferência notifyDirectMessages e dedupe — uma falha aqui
    // nunca bloqueia nem reverte o envio da mensagem.
    const notifyRecipientPush = useCallback((preview: string) => {
        const safePreview = String(preview || '').trim().slice(0, 240);
        if (!safePreview || !resolvedOtherUserId) return;
        const u = isRecord(user) ? user : {};
        const senderName = String(
            u?.displayName ?? u?.display_name ?? u?.name ?? ''
        ).trim() || 'Nova mensagem';
        void fetch('/api/notifications/direct-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receiverId: resolvedOtherUserId, senderName, preview: safePreview }),
        }).catch(() => { });
    }, [resolvedOtherUserId, user]);

    // Núcleo de envio de texto com otimismo. `tempId` permite que o Reenviar
    // reaproveite a mesma bolha temporária (marca como 'sending' de novo) em vez
    // de criar uma nova. Caminho feliz é 100% preservado; a única diferença é que
    // a bolha aparece ANTES do await (estado 'sending') e é reconciliada depois.
    const sendTextMessage = useCallback(async (message: string, tempId?: string) => {
        const text = message.trim();
        if (!text || !channelId || !safeUserId) {
            if (!safeUserId) await alert('Sessão inválida. Faça login novamente.');
            return;
        }

        const u = isRecord(user) ? user : {};
        const senderProfile = { display_name: u?.displayName || null, photo_url: u?.photoURL || null };
        const localId = tempId ?? `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimisticRow: MessageRow = toMessageRow({
            id: localId,
            channel_id: channelId,
            sender_id: safeUserId,
            content: text,
            created_at: new Date().toISOString(),
            sender: senderProfile,
            _sendStatus: 'sending',
        });

        // Insere/atualiza a bolha 'sending' ANTES do await — em rede ruim a
        // mensagem aparece na hora em vez de "sumir" até o insert retornar.
        setMessages(prev => {
            const safePrev = Array.isArray(prev) ? prev : [];
            if (safePrev.some(m => m.id === localId)) {
                return safePrev.map(m => (m.id === localId ? optimisticRow : m));
            }
            return [...safePrev, optimisticRow];
        });

        try {
            const { data: inserted, error: insertError } = await supabase
                .from('direct_messages')
                .insert({ channel_id: channelId, sender_id: safeUserId, content: text })
                .select('id, channel_id, sender_id, content, created_at')
                .single();

            if (insertError) throw insertError;

            const realRow: MessageRow = toMessageRow({
                ...(isRecord(inserted) ? inserted : {}),
                sender: senderProfile,
            });

            // Reconciliação: troca a bolha temp pela real. Se o realtime já trouxe
            // a real (mesmo id), remove o temp e mantém uma única cópia — evita
            // duplicata sem depender da ordem de chegada (insert vs realtime).
            setMessages(prev => {
                const safePrev = Array.isArray(prev) ? prev : [];
                const realId = realRow.id;
                const alreadyHasReal = realId && safePrev.some(m => m.id === realId);
                if (alreadyHasReal) {
                    return safePrev.filter(m => m.id !== localId);
                }
                return safePrev.map(m => (m.id === localId ? realRow : m));
            });

            await supabase
                .from('direct_channels')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', channelId);

            notifyRecipientPush(text);
        } catch (error) {
            logError('error', 'Erro ao enviar mensagem:', error);
            // Edge-case (timeout/abort no cliente, mas a linha FOI gravada no
            // servidor): o realtime já anexou a versão real (sem _sendStatus,
            // mesmo sender, mesmo texto, recém-chegada). Marcar 'failed' aqui
            // criaria uma bolha fantasma duplicada — e Reenviar duplicaria de vez
            // no servidor. Se a real já está no estado, só removemos a temp; senão
            // marcamos 'failed' (mantém o texto) para oferecer Reenviar.
            setMessages(prev => {
                const safePrev = Array.isArray(prev) ? prev : [];
                const tempRow = safePrev.find(m => m.id === localId);
                const tempTs = tempRow ? new Date(String(tempRow.created_at ?? '')).getTime() : NaN;
                const RECONCILE_WINDOW_MS = 15_000;
                const realAlreadyArrived = safePrev.some(m => {
                    if (m.id === localId) return false;
                    if (m._sendStatus) return false;
                    if (String(m.user_id || '') !== safeUserId) return false;
                    if (typeof m.content !== 'string' || m.content !== text) return false;
                    if (!Number.isFinite(tempTs)) return true;
                    const realTs = new Date(String(m.created_at ?? '')).getTime();
                    return Number.isFinite(realTs) && Math.abs(realTs - tempTs) <= RECONCILE_WINDOW_MS;
                });
                if (realAlreadyArrived) {
                    return safePrev.filter(m => m.id !== localId);
                }
                return safePrev.map(m => (m.id === localId ? { ...m, _sendStatus: 'failed' as const } : m));
            });
            const msg = String((error as Record<string, unknown>)?.message ?? error ?? '');
            toast('Erro ao enviar mensagem: ' + msg, 'error');
        }
    }, [alert, channelId, notifyRecipientPush, safeUserId, supabase, toast, user]);

    const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!newMessage.trim() || !channelId || !safeUserId) {
            if (!safeUserId) await alert('Sessão inválida. Faça login novamente.');
            return;
        }
        const message = newMessage.trim();
        setNewMessage('');
        await sendTextMessage(message);
    };

    // Reenvia uma bolha que falhou: reaproveita o mesmo tempId (volta pra
    // 'sending') e tenta o insert de novo.
    const handleRetryMessage = useCallback((message: MessageRow) => {
        const text = typeof message.content === 'string' ? message.content : '';
        if (!text) return;
        void sendTextMessage(text, message.id);
    }, [sendTextMessage]);

    const handleAttachClick = () => { fileInputRef.current?.click() }

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []) as File[]
        if (!files.length || !channelId || !safeUserId) {
            if (!safeUserId) await alert('Sessão inválida. Faça login novamente.');
            return
        }
        setUploading(true)
        try {
            for (const file of files) {
                const isImage = file.type.startsWith('image/')
                const isVideo = file.type.startsWith('video/')
                if (!isImage && !isVideo) continue

                const pathBase = `${channelId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`
                let payload: Record<string, unknown> | null = null;

                if (isImage) {
                    const compressed = (await compressImage(file, { maxWidth: 1280, quality: 0.8 })) as Blob
                    const thumb = (await generateImageThumbnail(file, { thumbWidth: 360 })) as Blob

                    const signMain = await apiStorage.getSignedUpload(`${pathBase}.jpg`)
                    if (!signMain.ok) throw new Error(signMain.url ? '' : 'Falha ao assinar upload')
                    await supabase.storage.from('chat-media').uploadToSignedUrl(signMain.path ?? '', signMain.token ?? '', compressed)

                    const signThumb = await apiStorage.getSignedUpload(`${pathBase}_thumb.jpg`)
                    if (!signThumb.ok) throw new Error(signThumb.url ? '' : 'Falha ao assinar thumbnail')
                    await supabase.storage.from('chat-media').uploadToSignedUrl(signThumb.path ?? '', signThumb.token ?? '', thumb)

                    const { data: pub } = await supabase.storage.from('chat-media').getPublicUrl(signMain.path ?? '')
                    const { data: pubThumb } = await supabase.storage.from('chat-media').getPublicUrl(signThumb.path ?? '')

                    payload = { type: 'image', media_url: pub.publicUrl, thumb_url: pubThumb.publicUrl }
                } else if (isVideo) {
                    if (file.size > 200 * 1024 * 1024) { await alert('Vídeo acima de 200MB. Comprima antes.'); continue }
                    const signVid = await apiStorage.getSignedUpload(`${pathBase}`)
                    if (!signVid.ok) throw new Error(signVid.url ? '' : 'Falha ao assinar upload')
                    await supabase.storage.from('chat-media').uploadToSignedUrl(signVid.path ?? '', signVid.token ?? '', file)
                    const { data: pub } = await supabase.storage.from('chat-media').getPublicUrl(signVid.path ?? '')
                    payload = { type: 'video', media_url: pub.publicUrl }
                }

                if (payload) {
                    await supabase.from('direct_messages').insert({
                        channel_id: channelId,
                        sender_id: safeUserId,
                        content: JSON.stringify(payload)
                    });
                    notifyRecipientPush(payload.type === 'video' ? '🎥 Vídeo' : '📷 Imagem');
                }
            }
        } catch (err) {
            logError('error', err);
            const msg = (err as Record<string, unknown>)?.message
            await alert('Falha ao enviar mídia: ' + (typeof msg === 'string' ? msg : String(err)))
        }
        finally { setUploading(false); e.target.value = '' }
    }

    const insertEmoji = (emoji: string) => { setNewMessage(prev => prev + emoji); setShowEmoji(false) }

    const handleAddGif = async () => {
        if (sendingGif) return;
        const url = await prompt('Cole a URL do GIF (GIPHY/Tenor):', 'GIF')
        if (!url || !channelId || !safeUserId) {
            if (!safeUserId) await alert('Sessão inválida. Faça login novamente.');
            return
        }
        // R11#1: Validate URL — reject non-HTTPS and restrict to known GIF providers
        const trimmedUrl = String(url).trim()
        let parsed: URL | null = null
        try { parsed = new URL(trimmedUrl) } catch { /* invalid URL */ }
        if (!parsed || !['https:', 'http:'].includes(parsed.protocol)) {
            await alert('URL inválida. Use uma URL HTTPS de um serviço de GIF (GIPHY, Tenor, etc).')
            return
        }
        const allowedHosts = ['giphy.com', 'media.giphy.com', 'tenor.com', 'media.tenor.com', 'c.tenor.com', 'gfycat.com', 'thumbs.gfycat.com', 'i.imgur.com', 'imgur.com']
        const host = parsed.hostname.toLowerCase()
        const isAllowed = allowedHosts.some(h => host === h || host.endsWith('.' + h))
        if (!isAllowed) {
            await alert('Apenas GIFs de GIPHY, Tenor, Gfycat ou Imgur são permitidos.')
            return
        }
        const payload = { type: 'gif', media_url: trimmedUrl }
        setSendingGif(true);
        try {
            await supabase.from('direct_messages').insert({
                channel_id: channelId,
                sender_id: safeUserId,
                content: JSON.stringify(payload)
            });
            notifyRecipientPush('🎬 GIF');
        } finally {
            setSendingGif(false);
        }
    }

    const isUserOnline = () => {
        const lastSeen = otherUser?.last_seen
        if (!lastSeen || !nowMs) return false;
        const diff = nowMs - new Date(String(lastSeen)).getTime();
        return diff < 5 * 60 * 1000;
    };

    const formatTime = (timestamp: unknown) => {
        return new Date(String(timestamp ?? '')).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {

        return (
            <div className="fixed inset-0 z-50 flex flex-col h-full overflow-hidden text-white" style={{ background: '#090909' }}>
                <div className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 sticky top-0 z-20 justify-center relative flex" style={{ background: 'rgba(9,9,9,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                    <div className="h-px absolute bottom-0 left-0 right-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.3), transparent)' }} />
                    <button onClick={onClose} className="absolute left-4 w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-white rounded-xl active:scale-95 transition-all" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} aria-label="Voltar">
                        <ChevronLeft size={20} />
                    </button>
                    <div className="w-10 h-10 rounded-full bg-neutral-800 animate-pulse" />
                    <div className="ml-3">
                        <div className="h-5 bg-neutral-800 rounded animate-pulse mb-1 w-32" />
                        <div className="h-3 bg-neutral-800 rounded animate-pulse w-20" />
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-neutral-500 text-sm">Carregando conversa...</div>
                </div>
            </div>
        );
    }

    return (
        <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col h-full overflow-hidden text-white" style={{ background: '#090909' }}>
            <div className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 sticky top-0 z-20 justify-center relative flex" style={{ background: 'rgba(9,9,9,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                <div className="h-px absolute bottom-0 left-0 right-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.3), transparent)' }} />
                <button onClick={onClose} className="absolute left-4 w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-white rounded-xl active:scale-95 transition-all" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} aria-label="Voltar">
                    <ChevronLeft size={20} />
                </button>

                <div className="flex items-center gap-3 justify-center w-full">
                    {(otherUser?.photoUrl || resolvedOtherUserPhoto) ? (
                        <Image
                            src={otherUser?.photoUrl || resolvedOtherUserPhoto || ''}
                            width={36}
                            height={36}
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-yellow-500/20"
                            alt={otherUser?.displayName || resolvedOtherUserName}
                        />
                    ) : (
                        <div className="w-10 h-10 bg-neutral-900 border border-neutral-800 rounded-full flex items-center justify-center font-black text-white ring-2 ring-yellow-500/20">
                            {otherUser?.displayName?.[0] || resolvedOtherUserName?.[0] || '?'}
                        </div>
                    )}

                    <div className="min-w-0 text-center">
                        <h3 className="font-black tracking-tight text-white truncate max-w-[56vw] mx-auto">
                            {otherUser?.displayName || resolvedOtherUserName || 'Usuário'}
                        </h3>
                        <div className="flex items-center justify-center gap-1.5 text-[11px]">
                            {isUserOnline() ? (
                                <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.12)]"></span>
                                    <span className="text-green-400 font-semibold">Online</span>
                                </>
                            ) : (
                                <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-500"></span>
                                    <span className="text-neutral-400 font-medium">Offline</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {debugChat && (
                <div className="px-4 pt-2">
                    <div className="text-red-500 text-4xl font-black text-center">TESTE INTERNO</div>
                </div>
            )}

            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto" style={{ background: '#090909' }}>
                <div className="min-h-full flex flex-col justify-end px-4 py-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="text-center py-10 text-neutral-500">
                        <div className="text-lg mb-2">💬</div>
                        <p className="font-semibold">Comece a conversa</p>
                        <p className="text-sm">Envie uma mensagem para {otherUser?.displayName || otherUserName}</p>
                    </div>
                ) : (
                    <>
                        {messages.map((message: MessageRow, index: number) => {
                            const isMyMessage = safeUserId ? message.user_id === safeUserId : false;
                            const prevSenderId = messages?.[index - 1]?.user_id;
                            const showAvatar = !isMyMessage && (index === 0 || prevSenderId !== message.user_id);
                            const senderObj = isRecord(message.sender) ? (message.sender as Record<string, unknown>) : null;

                            return (
                                <div
                                    key={message.id}
                                    className={`flex gap-3 ${isMyMessage ? 'flex-row-reverse' : ''} ${!showAvatar && !isMyMessage ? 'ml-11' : ''}`}
                                >
                                    {!isMyMessage && showAvatar && (
                                        senderObj?.photo_url ? (
                                            <Image
                                                src={String(senderObj.photo_url)}
                                                width={32}
                                                height={32}
                                                className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 object-cover self-end mb-1"
                                                alt={String(senderObj.display_name ?? 'Usuário')}
                                            />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center font-black text-[10px] self-end mb-1">
                                                {String(senderObj?.display_name ?? '?')[0] || '?'}
                                            </div>
                                        )
                                    )}

                                    <div className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm break-words transition-opacity ${isMyMessage
                                            ? 'bg-yellow-500 text-black rounded-br-none shadow-yellow-500/15'
                                            : 'bg-neutral-900/80 text-white rounded-bl-none border border-neutral-800'
                                        } ${message._sendStatus === 'sending' ? 'opacity-70' : ''} ${message._sendStatus === 'failed' ? 'ring-1 ring-red-500/50' : ''}`}>
                                        {!isMyMessage && (
                                            <p className="text-[10px] font-bold text-neutral-400 mb-1">
                                                {String(senderObj?.display_name ?? 'Usuário')}
                                            </p>
                                        )}
                                        {(() => {
                                            let payload: Record<string, unknown> | null = null;
                                            try {
                                                if (typeof message.content === 'string' && message.content.startsWith('{')) {
                                                    const parsed: unknown = parseJsonWithSchema(message.content, z.record(z.unknown()));
                                                    payload = isRecord(parsed) ? parsed : null;
                                                }
                                            } catch { }

                                            if (payload?.type === 'image')
                                                return (
                                                    <Image
                                                        src={chatMediaSrc(payload.thumb_url ?? payload.media_url)}
                                                        alt="imagem"
                                                        width={CHAT_MEDIA_PREVIEW_SIZE}
                                                        height={CHAT_MEDIA_PREVIEW_SIZE}
                                                        unoptimized
                                                        className="rounded-lg max-h-64 w-full object-cover cursor-pointer"
                                                        onClick={() => {
                                                            try {
                                                                const url = payload?.media_url ? chatMediaSrc(String(payload.media_url)) : '';
                                                                if (!url) return;
                                                                window.open(url, '_blank');
                                                            } catch { }
                                                        }}
                                                    />
                                                );
                                            // eslint-disable-next-line jsx-a11y/media-has-caption, jsx-a11y/control-has-associated-label
                                            if (payload?.type === 'video') return <video src={chatMediaSrc(payload.media_url)} controls playsInline className="rounded-lg max-h-64 w-full" />;
                                            if (payload?.type === 'gif')
                                                return (
                                                    <Image
                                                        src={String(payload.media_url ?? '')}
                                                        alt="gif"
                                                        width={CHAT_MEDIA_PREVIEW_SIZE}
                                                        height={CHAT_MEDIA_PREVIEW_SIZE}
                                                        className="rounded-lg max-h-64 w-full object-cover"
                                                        unoptimized
                                                    />
                                                );

                                            return <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{String(payload?.text ?? message.content ?? '')}</p>;
                                        })()}
                                        <div className="flex items-center justify-between gap-2 mt-1">
                                            {isMyMessage && message._sendStatus !== 'sending' && message._sendStatus !== 'failed' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteMessage(message)}
                                                    className="p-1 rounded-md text-black/60 hover:text-black"
                                                    aria-label="Deletar mensagem"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            ) : (
                                                <span />
                                            )}
                                            {message._sendStatus === 'failed' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRetryMessage(message)}
                                                    className="text-[10px] font-bold inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-red-700 hover:text-red-800 bg-black/10 active:scale-95 transition-transform"
                                                    aria-label="Reenviar mensagem"
                                                >
                                                    <RotateCw size={11} />
                                                    Reenviar
                                                </button>
                                            ) : (
                                                <p className={`text-[10px] text-right tabular-nums ${isMyMessage ? 'text-black/60' : 'text-neutral-500'
                                                    }`}>
                                                    {message._sendStatus === 'sending' ? 'Enviando…' : formatTime(message.created_at)}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {loadingMore && (
                            <div className="text-center text-xs text-neutral-500 py-2">Carregando mensagens...</div>
                        )}
                    </>
                )}
                </div>
            </div>

            <form onSubmit={handleSendMessage} className={`shrink-0 z-30 px-4 pt-3 ${kbOpen ? 'pb-2' : 'pb-[max(env(safe-area-inset-bottom),12px)]'} shadow-[0_-14px_40px_rgba(0,0,0,0.55)]`} style={{ background: 'rgba(9,9,9,0.99)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2.5">
                    {/* Ações em cascata (emoji / imagem / GIF) atrás de um botão "+" */}
                    <div className="relative shrink-0">
                        {showActions && (
                            <div className="absolute bottom-full left-0 mb-3 flex flex-col gap-2">
                                {[
                                    { key: 'emoji', label: 'Emojis', icon: <Smile size={20} />, onClick: () => { setShowActions(false); setShowEmoji(v => !v); } },
                                    { key: 'image', label: 'Anexar mídia', icon: <ImageIcon size={20} />, onClick: () => { setShowActions(false); handleAttachClick(); } },
                                    { key: 'gif', label: 'Enviar GIF', icon: <Link2 size={20} />, onClick: () => { setShowActions(false); handleAddGif(); } },
                                ].map((a, i) => (
                                    <button
                                        key={a.key}
                                        type="button"
                                        onClick={a.onClick}
                                        disabled={a.key === 'gif' && sendingGif}
                                        aria-label={a.label}
                                        className="w-12 h-12 rounded-2xl bg-neutral-800 border border-white/10 text-neutral-100 hover:text-white hover:bg-neutral-700 active:scale-95 transition-transform inline-flex items-center justify-center shadow-lg disabled:opacity-60 animate-in fade-in slide-in-from-bottom-2"
                                        style={{ animationDelay: `${(2 - i) * 45}ms`, animationFillMode: 'both' }}
                                    >
                                        {a.icon}
                                    </button>
                                ))}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowActions(v => !v)}
                            aria-label={showActions ? 'Fechar opções' : 'Mais opções'}
                            aria-expanded={showActions}
                            className={`w-12 h-12 rounded-2xl border border-white/10 active:scale-95 transition-all inline-flex items-center justify-center ${showActions ? 'rotate-45 bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-200 hover:text-white hover:bg-neutral-700'}`}
                        >
                            <Plus size={22} />
                        </button>
                    </div>

                    <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileSelected} aria-label="Selecionar arquivos" />

                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onFocus={() => setShowActions(false)}
                        placeholder="Digite uma mensagem…"
                        className="flex-1 min-w-0 rounded-2xl bg-white/[0.06] border border-white/10 text-white outline-none placeholder:text-neutral-500 text-base leading-6 px-4 py-3.5 focus:border-yellow-500/40 focus:bg-white/[0.08] transition-colors"
                        aria-label="Mensagem"
                    />

                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className="shrink-0 w-12 h-12 rounded-2xl bg-yellow-500 text-black flex items-center justify-center shadow-lg shadow-yellow-500/20 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
                        aria-label="Enviar mensagem"
                    >
                        <Send size={20} />
                    </button>
                </div>
                {uploading ? <div className="mt-2 text-[11px] text-neutral-400">Enviando…</div> : null}
                {showEmoji && (
                    <div className="absolute left-4 right-4 bottom-[calc(96px+env(safe-area-inset-bottom))] bg-neutral-950 border border-neutral-800 rounded-2xl p-2 grid grid-cols-8 gap-1 shadow-2xl z-50">
                        {['😀', '😁', '😂', '😉', '😊', '😍', '👍', '💪', '🔥', '🙏', '🥳', '🤝', '🤩', '🤔', '👏', '🙌'].map(e => (
                            <button type="button" key={e} className="text-xl w-9 h-9 rounded-xl hover:bg-neutral-900 active:scale-95 transition-transform" onClick={() => insertEmoji(e)}>{e}</button>
                        ))}
                    </div>
                )}
            </form>
        </div>
    );
};

export default ChatDirectScreen;
