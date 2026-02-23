"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import {
    ChevronLeft,
    MessageSquare,
    X,
    Users,
    Send,
    Plus,
    Check,
    Bell,
    Search,
    RefreshCw,
    Image as ImageIcon,
    Smile,
    Film,
    Link2,
    Trash2
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useDialog } from '@/contexts/DialogContext';
import { compressImage, generateImageThumbnail } from '@/utils/chat/media';
import { getErrorMessage } from '@/utils/errorMessage'
import { logError, logWarn, logInfo } from '@/lib/logger'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

interface ChannelRow { id: string; name?: string; [key: string]: unknown }
interface InviteRow { to_uid: string; from_uid: string; [key: string]: unknown }

interface FormattedMessage {
    id: string
    text: string
    kind: string
    mediaUrl?: string
    thumbUrl?: string
    uid: string
    createdAt: Date
    displayName: string
    photoURL?: string | null
    [key: string]: unknown
}

interface ChatScreenProps {
    user: Record<string, unknown> | null
    onClose: () => void
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

const CHAT_MEDIA_PREVIEW_SIZE = 800;

const ChatScreen = ({ user, onClose }: ChatScreenProps) => {
    const [view, setView] = useState('list');
    const [activeChannel, setActiveChannel] = useState<ChannelRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const { confirm, alert, prompt } = useDialog();
    const alertRef = useRef(alert);
    const confirmRef = useRef(confirm);
    const promptRef = useRef(prompt);

    const [globalChannel, setGlobalChannel] = useState<ChannelRow | null>(null);
    const [messages, setMessages] = useState<FormattedMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const visibilityRef = useRef(true);
    
    const [searchQuery] = useState('');
    const userObj: Record<string, unknown> = isRecord(user) ? user : {}
    const safeUserId = userObj?.id ? String(userObj.id) : '';

    const dummy = useRef<HTMLDivElement | null>(null);
    const supabase = useMemo(() => createClient(), []);

    useEffect(() => {
        alertRef.current = alert;
        confirmRef.current = confirm;
        promptRef.current = prompt;
    }, [alert, confirm, prompt]);

    useEffect(() => {
        const updateVisibility = () => {
            try {
                visibilityRef.current = typeof document === 'undefined' ? true : !document.hidden;
            } catch {
                visibilityRef.current = true;
            }
        };
        updateVisibility();
        try {
            if (typeof document !== 'undefined') document.addEventListener('visibilitychange', updateVisibility);
        } catch { }
        return () => {
            try {
                if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', updateVisibility);
            } catch { }
        };
    }, []);

    const [privateChannels, setPrivateChannels] = useState<Array<Record<string, unknown>>>([]);
    const [sendingInviteTo, setSendingInviteTo] = useState<{ uid: string; displayName: string } | null>(null);

    const fetchGlobalId = useCallback(async () => {
        const res = await fetch('/api/chat/global-id')
        const j = await res.json()
        if (!j.ok) throw new Error(j.error)
        return j.id
    }, [])

    const loadData = useCallback(async () => {
        setRefreshing(true);
        try {
            const gid = await fetchGlobalId()
            setGlobalChannel(gid ? { id: gid } : null);
        } catch (e: unknown) {
            logError('error', "Error loading chat data:", e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [fetchGlobalId]);

    const ensureBucket = useCallback(async () => {
        try {
            await fetch('/api/storage/ensure-bucket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'chat-media' }) })
        } catch {}
    }, [])

    const formatMessage = useCallback((m: Record<string, unknown>): FormattedMessage => {
        const contentRaw = m.content
        const contentStr = typeof contentRaw === 'string' ? contentRaw : (contentRaw == null ? '' : String(contentRaw))
        let payload: Record<string, unknown> | null = null
        try {
            if (contentStr && contentStr.startsWith('{')) {
                const parsed: unknown = parseJsonWithSchema(contentStr, z.record(z.unknown()))
                payload = isRecord(parsed) ? parsed : null
            }
        } catch {}
        const profilesObj = isRecord(m.profiles) ? (m.profiles as Record<string, unknown>) : {}
        return {
            id: String(m.id ?? ''),
            text: String(payload?.text ?? contentStr),
            kind: String(payload?.type ?? 'text'),
            mediaUrl: payload?.media_url != null ? String(payload.media_url) : undefined,
            thumbUrl: payload?.thumb_url != null ? String(payload.thumb_url) : undefined,
            uid: String(m.user_id ?? ''),
            createdAt: new Date(String(m.created_at ?? '')),
            displayName: String(profilesObj?.display_name ?? 'Unknown'),
            photoURL: profilesObj?.photo_url != null ? String(profilesObj.photo_url) : null
        }
    }, [])

    useEffect(() => {
        let mounted = true;

        loadData();
        ensureBucket().catch(err => logWarn('warn', 'Bucket ensure failed', err));

        return () => { mounted = false; };
    }, [ensureBucket, loadData]);

    const openGlobalChat = useCallback(async () => {
        if (globalChannel) {
            setActiveChannel({ id: globalChannel.id, name: 'Iron Lounge', type: 'global' });
            setView('chat');
            return;
        }

        try {
            const gid = await fetchGlobalId()

            if (gid) {
                const global = { id: gid }
                setGlobalChannel(global);
                setActiveChannel({ id: gid, name: 'Iron Lounge', type: 'global' });
                setView('chat');
            } else {
                const { data: newGlobal, error: createError } = await supabase
                    .from('chat_channels')
                    .insert({ type: 'global' })
                    .select('id')
                    .single();

                if (createError) {
                    if (createError.code === '23505') {
                        return openGlobalChat();
                    }
                    throw createError;
                }

                if (newGlobal) {
                    setGlobalChannel(newGlobal);
                    setActiveChannel({ id: newGlobal.id, name: 'Iron Lounge', type: 'global' });
                    setView('chat');
                } else {
                    throw new Error("Unknown error creating global channel");
                }
            }
        } catch (e: unknown) {
            const msg = (getErrorMessage(e) ?? String(e ?? '')).trim();
            try {
                await alertRef.current(`Erro ao conectar no chat global: ${msg || 'Erro desconhecido'}`);
            } catch {}
        }
    }, [fetchGlobalId, globalChannel, supabase])

    useEffect(() => {
        if (globalChannel && view === 'list') {
            openGlobalChat();
        }
    }, [globalChannel, openGlobalChat, view]);

    useEffect(() => {
        if (!activeChannel) return;

        setMessages([]);
        const loadMessages = async () => {
            if (!visibilityRef.current) return;
            try {
                const res = await fetch(`/api/chat/messages?channel_id=${activeChannel.id}`);
                const ct = res.headers.get('content-type') || '';
                let json;
                if (ct.includes('application/json')) {
                    json = await res.json();
                } else {
                    const txt = await res.text();
                    logWarn('ChatScreen', 'Non-JSON response from messages endpoint', { status: res.status, body: txt.slice(0,200) });
                    return;
                }
                
                if (json.ok && json.data) {
                    const rows = Array.isArray(json.data) ? json.data : []
                    setMessages(rows.reverse().map((row: Record<string, unknown>) => formatMessage(isRecord(row) ? row : {})));
                } else {
                    logError('error', "API returned error or no data:", json);
                }
            } catch (e) {
                logError('error', "Error loading messages:", e);
            }
        };
        loadMessages();

        const channel = supabase
            .channel(`chat:${activeChannel.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeChannel.id}` },
                async (payload: Record<string, unknown>) => {
                    try {
                        const newMsg = isRecord(payload?.new) ? (payload.new as Record<string, unknown>) : null;
                        if (!newMsg) return;
                        const senderId = newMsg?.user_id ? String(newMsg.user_id) : '';
                        let profile = null;
                        if (senderId) {
                            const { data } = await supabase
                                .from('profiles')
                                .select('display_name, photo_url')
                                .eq('id', senderId)
                                .maybeSingle();
                            profile = isRecord(data) ? data : null;
                        }
                        setMessages((prev) => [...prev, formatMessage({ ...newMsg, profiles: profile } as Record<string, unknown>)]);
                    } catch (e) {
                        logError('error', 'Erro ao processar mensagem realtime:', e);
                        return;
                    }
                }
            )
            .subscribe();

        const poll = setInterval(() => {
            if (!visibilityRef.current) return;
            loadMessages();
        }, 5000);
        return () => { supabase.removeChannel(channel); clearInterval(poll); };
    }, [activeChannel, formatMessage, supabase]);

    useEffect(() => {
        dummy.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeChannel) return;
        const text = newMessage;
        setNewMessage('');
        
        await fetch('/api/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_id: activeChannel.id, content: text })
        })
    };

    const handleDeleteMessage = async (msg: FormattedMessage) => {
        const id = msg?.id ? String(msg.id) : '';
        if (!id) return;
        const ok = await confirmRef.current('Tem certeza que deseja deletar esta mensagem?\nEssa ação é irreversível.', 'Deletar mensagem', { confirmText: 'Deletar', cancelText: 'Cancelar' });
        if (!ok) return;
        try {
            const res = await fetch('/api/chat/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId: id, scope: 'channel' })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.ok) throw new Error(json?.error || 'Erro ao deletar mensagem.');
            setMessages((prev) => prev.filter((m) => String(m?.id || '') !== id));
        } catch (e) {
            const msg = (e as Record<string, unknown>)?.message
            await alertRef.current(typeof msg === 'string' ? msg : 'Erro ao deletar mensagem.');
        }
    };

    const handleAttachClick = () => { fileInputRef.current?.click() }

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []) as File[]
        if (!files.length || !activeChannel) return
        setUploading(true)
        try {
            for (const file of files) {
                const isImage = file.type.startsWith('image/')
                const isVideo = file.type.startsWith('video/')
                if (!isImage && !isVideo) continue

                const pathBase = `${activeChannel.id}/${Date.now()}_${file.name.replace(/\s+/g,'_')}`
                if (isImage) {
                    const compressed = (await compressImage(file, { maxWidth: 1280, quality: 0.8 })) as Blob
                    const thumb = (await generateImageThumbnail(file, { thumbWidth: 360 })) as Blob
                    const signMain = await fetch('/api/storage/signed-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: `${pathBase}.jpg` }) }).then(r => r.json())
                    if (!signMain.ok) throw new Error(signMain.error || 'Falha ao assinar upload')
                    await supabase.storage.from('chat-media').uploadToSignedUrl(signMain.path, signMain.token, compressed)
                    const signThumb = await fetch('/api/storage/signed-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: `${pathBase}_thumb.jpg` }) }).then(r => r.json())
                    if (!signThumb.ok) throw new Error(signThumb.error || 'Falha ao assinar thumbnail')
                    await supabase.storage.from('chat-media').uploadToSignedUrl(signThumb.path, signThumb.token, thumb)
                    const { data: pub } = await supabase.storage.from('chat-media').getPublicUrl(signMain.path)
                    const { data: pubThumb } = await supabase.storage.from('chat-media').getPublicUrl(signThumb.path)
                    const payload = { type: 'image', media_url: pub.publicUrl, thumb_url: pubThumb.publicUrl }
                    await fetch('/api/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel_id: activeChannel.id, content: JSON.stringify(payload) }) })
                } else if (isVideo) {
                    if (file.size > 200 * 1024 * 1024) { await alertRef.current('Vídeo acima de 200MB. Comprima antes.'); continue }
                    const signVid = await fetch('/api/storage/signed-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: `${pathBase}` }) }).then(r => r.json())
                    if (!signVid.ok) throw new Error(signVid.error || 'Falha ao assinar upload')
                    await supabase.storage.from('chat-media').uploadToSignedUrl(signVid.path, signVid.token, file)
                    const { data: pub } = await supabase.storage.from('chat-media').getPublicUrl(signVid.path)
                    const payload = { type: 'video', media_url: pub.publicUrl }
                    await fetch('/api/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel_id: activeChannel.id, content: JSON.stringify(payload) }) })
                }
            }
        } catch (err) {
            logError('error', err);
            const msg = (err as Record<string, unknown>)?.message
            await alertRef.current('Falha ao enviar mídia: ' + (typeof msg === 'string' ? msg : String(err)))
        }
        finally { setUploading(false); e.target.value = '' }
    }

    const insertEmoji = (emoji: string) => { setNewMessage(prev => prev + emoji); setShowEmoji(false) }

    const handleAddGif = async () => {
        const url = await promptRef.current('Cole a URL do GIF (GIPHY/Tenor):', 'GIF')
        if (!url || !activeChannel) return
        const payload = { type: 'gif', media_url: url }
        await fetch('/api/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel_id: activeChannel.id, content: JSON.stringify(payload) }) })
    }

    const handleUserClick = async (targetUser: Record<string, unknown>) => {
        if (!safeUserId) {
            await alertRef.current('Sessão inválida. Faça login novamente.');
            return;
        }
        const tu = isRecord(targetUser) ? targetUser : {}
        const targetId = String(tu.id ?? '').trim()
        const targetName = String(tu.display_name ?? '').trim()
        const existingChat = privateChannels.find((c) => String((c as Record<string, unknown>)?.otherUserId ?? '') === targetId);
        
        if (existingChat) {
            openPrivateChat(existingChat);
            return;
        }

        if (await confirmRef.current(`Quer conversar com ${targetName}?`, "Iniciar Conversa")) {
            setSendingInviteTo({ uid: targetId, displayName: targetName || 'Usuário' });
            try {
                const { data: pending } = await supabase
                    .from('chat_invites')
                    .select('*')
                    .eq('sender_id', safeUserId)
                    .eq('receiver_id', targetId)
                    .eq('status', 'pending')
                    .single();
                
                if (pending) {
                    const resend = await confirmRef.current("Já existe um convite pendente para este usuário. Cancelar e reenviar?", "Convite Pendente");
                    if (resend) {
                        const { error: delErr } = await supabase.from('chat_invites').delete().eq('id', pending.id);
                        if (delErr) throw delErr;
                        const { error: reErr } = await supabase.from('chat_invites').insert({
                            sender_id: safeUserId,
                            receiver_id: targetId
                        });
                        if (reErr) throw reErr;
                        await alertRef.current(`Convite reenviado para ${targetName}!`, "Convite Reenviado");
                        setView('list');
                    } else {
                        await alertRef.current("Você já enviou um convite para este usuário.");
                    }
                } else {
                    const { error } = await supabase.from('chat_invites').insert({
                        sender_id: safeUserId,
                        receiver_id: targetId
                    });
                    if (error) throw error;
                    await alertRef.current(`Convite enviado para ${targetName}! Aguarde a aceitação.`, "Convite Enviado");
                    setView('list');
                }
            } catch (e: unknown) {
                await alertRef.current("Erro ao enviar convite: " + (getErrorMessage(e) ?? String(e)));
            } finally {
                setSendingInviteTo(null);
            }
        }
    };

    const handleAcceptInvite = async (invite: Record<string, unknown>) => {
        if (!safeUserId) {
            await alertRef.current('Sessão inválida. Faça login novamente.');
            return;
        }
        try {
            const { data: channel, error: cErr } = await supabase.from('chat_channels').insert({ type: 'private' }).select().single();
            if (cErr) throw cErr;

            await supabase.from('chat_members').insert([
                { channel_id: channel.id, user_id: safeUserId },
                { channel_id: channel.id, user_id: String(invite.sender_id ?? '') }
            ]);

            await supabase.from('chat_invites').update({ status: 'accepted' }).eq('id', String(invite.id ?? ''));

            await loadData();
        } catch (e) {
            logError('error', e);
        }
    };

    const handleRejectInvite = async (id: string) => {
        await supabase.from('chat_invites').update({ status: 'rejected' }).eq('id', id);
        loadData();
    };

    const openPrivateChat = (channel: Record<string, unknown>) => {
        setActiveChannel({ ...(channel as ChannelRow), type: 'private' });
        setView('chat');
    };

    return (

		<div className="fixed inset-0 z-50 bg-neutral-900 text-white flex flex-col animate-slide-up">
			<div className="px-4 py-3 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center shadow-lg pt-safe min-h-[56px]">
				<div className="flex items-center gap-3">
					<button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-neutral-200 hover:text-white rounded-full bg-neutral-900 border border-neutral-700 active:scale-95 transition-transform">
						<ChevronLeft size={20} />
					</button>
					<div className="bg-yellow-500 p-2 rounded-full text-black"><MessageSquare size={20} /></div>
                    
                    <div>
                        <h3 className="font-bold text-lg text-white">
                            {view === 'list' ? 'Mensagens' : activeChannel?.name}
                        </h3>
                        {view === 'chat' && activeChannel?.type === 'global' && (
                            <p className="text-xs text-neutral-400">Chat Global</p>
                        )}
                        
                    </div>
                </div>
                <div className="flex gap-2">
                    {view === 'list' && (
                        <button onClick={loadData} className={`p-2 bg-neutral-700 rounded-full hover:bg-neutral-600 text-white ${refreshing ? 'animate-spin' : ''}`}>
                            <RefreshCw size={20} />
                        </button>
                    )}
                </div>
            </div>

            {view === 'list' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    <button onClick={openGlobalChat} className="w-full bg-gradient-to-r from-neutral-800 to-neutral-800/50 p-4 rounded-xl flex items-center gap-4 hover:border-yellow-500 border border-neutral-700 transition-all group">
                        <div className="w-12 h-12 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold shrink-0 shadow-lg shadow-yellow-900/20 group-hover:scale-110 transition-transform">
                            <Users size={24} />
                        </div>
                        <div className="text-left flex-1">
                            <p className="font-bold text-white text-lg group-hover:text-yellow-500 transition-colors">Iron Lounge</p>
                            <p className="text-xs text-neutral-400">Chat aberto para todos</p>
                        </div>
                    </button>
                </div>
            )}

            {view === 'chat' && activeChannel && (
                <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/30">
                        {messages.length === 0 && <div className="text-center py-10 text-neutral-500 text-sm">Nenhuma mensagem ainda.<br/>Seja o primeiro a dizer olá! 👋</div>}
                        
                        {messages.map((msg, idx) => {
                            const myId = safeUserId;
                            const msgUid = msg?.uid ? String(msg.uid) : '';
                            const isMe = !!myId && msgUid === myId;
                            const prevUid = messages?.[idx - 1]?.uid ? String(messages[idx - 1].uid) : '';
                            const showAvatar = !isMe && (idx === 0 || prevUid !== msgUid);
                            const displayName = String(msg?.displayName || '').trim();
                            const initial = displayName ? displayName[0] : '?';
                            const avatarAlt = displayName || 'avatar';
                            const timeLabel = (() => {
                                try {
                                    const raw = msg?.createdAt;
                                    const d = raw instanceof Date ? raw : new Date(raw);
                                    if (!Number.isFinite(d.getTime())) return '';
                                    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                } catch {
                                    return '';
                                }
                            })();
                            
                            return (
                                <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''} ${!showAvatar && !isMe ? 'ml-11' : ''}`}>
                                    {!isMe && showAvatar && (
                                        msg.photoURL ? (
                                            <Image src={msg.photoURL} width={32} height={32} className="w-8 h-8 rounded-full bg-neutral-700 object-cover self-end mb-1" alt={avatarAlt} />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center font-bold text-[10px] self-end mb-1">{initial}</div>
                                        )
                                    )}
                                    <div className={`max-w-[75%] rounded-2xl p-3 shadow-sm break-words ${isMe ? 'bg-yellow-500 text-black rounded-br-none' : 'bg-neutral-800 text-white rounded-bl-none'}`}>
                                        {!isMe && activeChannel.type === 'global' && <p className="text-[10px] font-bold opacity-50 mb-1">{displayName || 'Usuário'}</p>}
                                        {msg.kind === 'image' && (
                                            <Image
                                                src={msg.thumbUrl || msg.mediaUrl || ''}
                                                alt="imagem"
                                                width={CHAT_MEDIA_PREVIEW_SIZE}
                                                height={CHAT_MEDIA_PREVIEW_SIZE}
                                                className="rounded-lg max-h-64 w-full object-cover cursor-pointer"
                                                onClick={() => {
                                                    try {
                                                        const url = msg?.mediaUrl ? String(msg.mediaUrl) : '';
                                                        if (!url) return;
                                                        window.open(url, '_blank');
                                                    } catch {}
                                                }}
                                            />
                                        )}
                                        {msg.kind === 'video' && (
                                            <video src={msg.mediaUrl} controls playsInline className="rounded-lg max-h-64 w-full" />
                                        )}
                                        {msg.kind === 'gif' && (
                                            <Image
                                                src={msg.mediaUrl || ''}
                                                alt="gif"
                                                width={CHAT_MEDIA_PREVIEW_SIZE}
                                                height={CHAT_MEDIA_PREVIEW_SIZE}
                                                className="rounded-lg max-h-64 w-full object-cover"
                                                unoptimized
                                            />
                                        )}
                                        {(!msg.kind || msg.kind === 'text') && (
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                                        )}
                                        <div className="flex items-center justify-between gap-2 mt-1">
                                            {isMe ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteMessage(msg)}
                                                    className={`p-1 rounded-md ${isMe ? 'text-black/60 hover:text-black' : 'text-neutral-400 hover:text-white'}`}
                                                    aria-label="Deletar mensagem"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            ) : (
                                                <span />
                                            )}
                                            <p className={`text-[9px] text-right ${isMe ? 'text-black/50' : 'text-neutral-500'}`}>{timeLabel}</p>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                        <div ref={dummy}></div>
                    </div>
                    <form onSubmit={handleSendMessage} className="bg-neutral-800 border-t border-neutral-700 flex items-center gap-2 px-4 py-2 pb-[max(env(safe-area-inset-bottom),20px)] mb-[max(env(safe-area-inset-bottom),60px)]">
                        <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} className="flex-1 bg-neutral-900 border border-neutral-600 rounded-full px-4 py-3 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="Mensagem..." />
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setShowEmoji(v => !v)} className="p-2 rounded-full bg-neutral-700 text-white hover:bg-neutral-600"><Smile size={18} /></button>
                            <button type="button" onClick={handleAddGif} className="p-2 rounded-full bg-neutral-700 text-white hover:bg-neutral-600"><Link2 size={18} /></button>
                            <button type="button" onClick={handleAttachClick} className="p-2 rounded-full bg-neutral-700 text-white hover:bg-neutral-600"><ImageIcon size={18} /></button>
                            <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileSelected} />
                            <button type="submit" disabled={!newMessage.trim()} className="bg-yellow-500 text-black p-3 rounded-full hover:bg-yellow-400 disabled:opacity-50 transition-transform active:scale-95"><Send size={20} /></button>
                        </div>
                        {uploading && <span className="text-xs text-neutral-400 ml-2">Enviando mídia...</span>}
                        {showEmoji && (
                            <div className="absolute bottom-20 right-6 bg-neutral-900 border border-neutral-700 rounded-xl p-2 grid grid-cols-8 gap-1 shadow-xl">
                                {['😀','😁','😂','😉','😊','😍','👍','💪','🔥','🙏','🥳','🤝','🤩','🤔','👏','🙌'].map(e => (
                                    <button type="button" key={e} className="text-xl" onClick={() => insertEmoji(e)}>{e}</button>
                                ))}
                            </div>
                        )}
                    </form>
                </>
            )}
        </div>
    );
};

export default ChatScreen;
