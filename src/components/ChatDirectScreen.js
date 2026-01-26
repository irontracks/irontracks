"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import {
    ChevronLeft,
    Send,
    Circle,
    Image as ImageIcon,
    Smile,
    Link2
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useDialog } from '@/contexts/DialogContext';
import { compressImage, generateImageThumbnail } from '@/utils/chat/media';

const CHAT_MEDIA_PREVIEW_SIZE = 800;

const ChatDirectScreen = ({ user, targetUser, otherUserId, otherUserName, otherUserPhoto, onClose }) => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [nowMs, setNowMs] = useState(0);
    const [otherUser, setOtherUser] = useState(null);
    const [isTyping, setIsTyping] = useState(false);
    const [channelId, setChannelId] = useState(null);
    const [oldestCreatedAt, setOldestCreatedAt] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    
    const { alert, prompt } = useDialog();
    const supabase = useMemo(() => createClient(), []);
    const messagesEndRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    
    const [showEmoji, setShowEmoji] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);
    const [debugChat, setDebugChat] = useState(false);

    const resolvedOtherUserId = targetUser?.id ?? otherUserId;
    const resolvedOtherUserName = targetUser?.display_name ?? targetUser?.name ?? otherUserName;
    const resolvedOtherUserPhoto = targetUser?.photo_url ?? targetUser?.photoURL ?? otherUserPhoto;
    const safeUserId = user?.id ? String(user.id) : '';

    useEffect(() => {
        const tick = () => setNowMs(Date.now());
        const t = setTimeout(tick, 0);
        const id = setInterval(tick, 60_000);
        try {
            const byEnv = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_DEBUG_CHAT === '1';
            const byQS = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugChat') === '1';
            const byLS = typeof window !== 'undefined' && localStorage.getItem('debug_chat') === '1';
            setDebugChat(Boolean(byEnv || byQS || byLS));
        } catch {}
        return () => {
            clearTimeout(t);
            clearInterval(id);
        };
    }, []);

    const loadOtherUser = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, display_name, photo_url, last_seen')
                .eq('id', resolvedOtherUserId)
                .single();

            if (error) throw error;
            setOtherUser(data);
        } catch (error) {
            console.error('Erro ao carregar usuário:', error);
        }
    }, [resolvedOtherUserId, supabase]);

    const getOrCreateChannel = useCallback(async () => {
        try {
            if (!safeUserId || !resolvedOtherUserId) {
                const err = new Error('Usuário inválido para iniciar conversa.');
                throw err;
            }
            const { data: channelId, error } = await supabase
                .rpc('get_or_create_direct_channel', {
                    user1: safeUserId,
                    user2: resolvedOtherUserId
                });

            if (error) throw error;
            setChannelId(channelId);
            return channelId;
        } catch (error) {
            console.error('Erro ao obter canal:', error);
            const msg = error?.message || String(error || '');
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

    const markMessagesAsRead = useCallback(async (targetChannelId) => {
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
            const msg = String(error?.message || error || '');
            if (msg.includes('Abort') || msg.includes('ERR_ABORTED')) return;
            console.error('Erro ao marcar como lido:', error);
        }
    }, [resolvedOtherUserId, supabase]);

    const loadMessages = useCallback(async (channelId, beforeTs = null) => {
        try {
            let query = supabase
                .from('direct_messages')
                .select('*')
                .eq('channel_id', channelId)
                .order('created_at', { ascending: true })
                .limit(50);

            if (beforeTs) {
                query = query.lt('created_at', beforeTs);
            }

            const { data, error } = await query;

            if (error) throw error;

            const msgs = data || [];
            const senderIds = Array.from(new Set(msgs.map(m => m.sender_id).filter(Boolean)));
            let profilesMap = {};
            if (senderIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, display_name, photo_url')
                    .in('id', senderIds);
                (profiles || []).forEach(p => { profilesMap[p.id] = p; });
            }
            const withSenders = msgs.map(m => ({ ...m, sender: profilesMap[m.sender_id] }));
            setMessages(prev => {
                const merged = beforeTs ? [...withSenders, ...prev] : withSenders;
                const seen = new Set();
                const dedup = [];
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
            const msg = String(error?.message || error || '');
            if (msg.includes('Abort') || msg.includes('ERR_ABORTED')) {
                return;
            }
            console.error('Erro ao carregar mensagens:', error);
            await alert('Erro ao carregar mensagens: ' + (error?.message || 'Desconhecido'));
        }
    }, [alert, markMessagesAsRead, supabase]);

    const setupRealtime = useCallback((channelId) => {
        const subscription = supabase
            .channel(`chat:${channelId}`)
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'direct_messages',
                    filter: `channel_id=eq.${channelId}`
                },
                async (payload) => {
                    try {
                        const newMessage = payload?.new && typeof payload.new === 'object' ? payload.new : null
                        if (!newMessage) return
                        const senderId = newMessage?.sender_id ? String(newMessage.sender_id) : ''

                        let senderData = null
                        if (senderId) {
                            const { data } = await supabase
                                .from('profiles')
                                .select('display_name, photo_url')
                                .eq('id', senderId)
                                .maybeSingle()
                            senderData = data || null
                        }

                        const messageWithSender = {
                            ...newMessage,
                            sender: senderData
                        }

                        setMessages((prev) => {
                            const safePrev = Array.isArray(prev) ? prev : []
                            const msgId = newMessage?.id ? String(newMessage.id) : ''
                            if (msgId && safePrev.some((m) => String(m?.id || '') === msgId)) return safePrev
                            return [...safePrev, messageWithSender]
                        })

                        const myId = user?.id ? String(user.id) : ''
                        if (senderId && myId && senderId !== myId && !newMessage?.is_read) {
                            await markMessagesAsRead(channelId)
                        }
                    } catch (e) {
                        console.error('Erro ao processar mensagem realtime (direct):', e)
                        return
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [markMessagesAsRead, supabase, user?.id]);

    useEffect(() => {
        let unsubscribe;
        (async () => {
            try {
                setLoading(true);
                await loadOtherUser();
                const id = await getOrCreateChannel();
                await loadMessages(id);
                unsubscribe = setupRealtime(id);
            } catch (error) {
                console.error('Erro ao inicializar chat:', error);
            } finally {
                setLoading(false);
            }
        })();
        return () => { if (unsubscribe) unsubscribe(); };
    }, [loadOtherUser, getOrCreateChannel, loadMessages, setupRealtime]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const onScroll = async () => {
            if (el.scrollTop <= 10 && hasMore && !loadingMore && oldestCreatedAt && channelId) {
                setLoadingMore(true);
                await loadMessages(channelId, oldestCreatedAt);
                setLoadingMore(false);
            }
        };
        el.addEventListener('scroll', onScroll);
        return () => el.removeEventListener('scroll', onScroll);
    }, [hasMore, loadingMore, oldestCreatedAt, channelId, loadMessages]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !channelId || !safeUserId) {
            if (!safeUserId) await alert('Sessão inválida. Faça login novamente.');
            return;
        }

        try {
            const message = newMessage.trim();
            setNewMessage('');

            const { data: inserted, error: insertError } = await supabase
                .from('direct_messages')
                .insert({ channel_id: channelId, sender_id: safeUserId, content: message })
                .select('*')
                .single();

            if (insertError) throw insertError;

            const optimistic = {
                ...inserted,
                sender: { display_name: user?.displayName || null, photo_url: user?.photoURL || null }
            };
            setMessages(prev => {
                if (prev.find(m => m.id === optimistic.id)) return prev;
                return [...prev, optimistic];
            });

            await supabase
                .from('direct_channels')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', channelId);

        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            const msg = error?.message || String(error || '');
            await alert('Erro ao enviar mensagem: ' + msg);
            setNewMessage(message);
        }
    };

    const handleAttachClick = () => { fileInputRef.current?.click() }

    const handleFileSelected = async (e) => {
        const files = Array.from(e.target.files || [])
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

                const pathBase = `${channelId}/${Date.now()}_${file.name.replace(/\s+/g,'_')}`
                let payload = null;

                if (isImage) {
                    const compressed = await compressImage(file, { maxWidth: 1280, quality: 0.8 })
                    const thumb = await generateImageThumbnail(file, { thumbWidth: 360 })
                    
                    const signMain = await fetch('/api/storage/signed-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: `${pathBase}.jpg` }) }).then(r => r.json())
                    if (!signMain.ok) throw new Error(signMain.error)
                    await supabase.storage.from('chat-media').uploadToSignedUrl(signMain.path, signMain.token, compressed)
                    
                    const signThumb = await fetch('/api/storage/signed-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: `${pathBase}_thumb.jpg` }) }).then(r => r.json())
                    if (!signThumb.ok) throw new Error(signThumb.error)
                    await supabase.storage.from('chat-media').uploadToSignedUrl(signThumb.path, signThumb.token, thumb)
                    
                    const { data: pub } = await supabase.storage.from('chat-media').getPublicUrl(signMain.path)
                    const { data: pubThumb } = await supabase.storage.from('chat-media').getPublicUrl(signThumb.path)
                    
                    payload = { type: 'image', media_url: pub.publicUrl, thumb_url: pubThumb.publicUrl }
                } else if (isVideo) {
                    if (file.size > 50 * 1024 * 1024) { await alert('Vídeo acima de 50MB. Comprima antes.'); continue }
                    const signVid = await fetch('/api/storage/signed-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: `${pathBase}` }) }).then(r => r.json())
                    if (!signVid.ok) throw new Error(signVid.error)
                    await supabase.storage.from('chat-media').uploadToSignedUrl(signVid.path, signVid.token, file)
                    const { data: pub } = await supabase.storage.from('chat-media').getPublicUrl(signVid.path)
                    payload = { type: 'video', media_url: pub.publicUrl }
                }

                if (payload) {
                    await supabase.from('direct_messages').insert({
                        channel_id: channelId,
                        sender_id: safeUserId,
                        content: JSON.stringify(payload)
                    });
                }
            }
        } catch (err) { console.error(err); await alert('Falha ao enviar mídia: '+(err?.message || String(err))) }
        finally { setUploading(false); e.target.value = '' }
    }

    const insertEmoji = (emoji) => { setNewMessage(prev => prev + emoji); setShowEmoji(false) }

    const handleAddGif = async () => {
        const url = await prompt('Cole a URL do GIF (GIPHY/Tenor):', 'GIF')
        if (!url || !channelId || !safeUserId) {
            if (!safeUserId) await alert('Sessão inválida. Faça login novamente.');
            return
        }
        const payload = { type: 'gif', media_url: url }
        await supabase.from('direct_messages').insert({
            channel_id: channelId,
            sender_id: safeUserId,
            content: JSON.stringify(payload)
        });
    }

    const isUserOnline = () => {
        if (!otherUser?.last_seen || !nowMs) return false;
        const diff = nowMs - new Date(otherUser.last_seen).getTime();
        return diff < 5 * 60 * 1000;
    };

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {

		return (
			<div className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col h-[100dvh] overflow-hidden">
				<div className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 bg-neutral-950 border-b border-neutral-800 sticky top-0 z-20 justify-center relative flex shadow-lg shadow-black/30">
					<button onClick={onClose} className="absolute left-4 w-11 h-11 flex items-center justify-center text-neutral-200 hover:text-white rounded-full bg-neutral-900 border border-neutral-700 active:scale-95 transition-transform">
						<ChevronLeft size={20} />
					</button>
					<div className="w-10 h-10 bg-neutral-700 rounded-full animate-pulse"></div>
					<div className="ml-3">
						<div className="h-5 bg-neutral-700 rounded animate-pulse mb-1 w-32"></div>
						<div className="h-3 bg-neutral-700 rounded animate-pulse w-20"></div>
					</div>
				</div>
				<div className="flex-1 flex items-center justify-center">
					<div className="text-neutral-500">Carregando conversa...</div>
				</div>
			</div>
		);
	}

		return (
				<div className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col h-[100dvh] overflow-hidden">
					<div className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 bg-neutral-950 border-b border-neutral-800 sticky top-0 z-20 justify-center relative flex shadow-lg shadow-black/30">
						<button onClick={onClose} className="absolute left-4 w-11 h-11 flex items-center justify-center text-neutral-200 hover:text-white rounded-full bg-neutral-900 border border-neutral-700 active:scale-95 transition-transform">
							<ChevronLeft size={20} />
						</button>
				
					<div className="flex items-center gap-3 justify-center w-full">
						{(otherUser?.photo_url || resolvedOtherUserPhoto) ? (
							<Image
								src={otherUser?.photo_url || resolvedOtherUserPhoto}
								width={36}
								height={36}
								className="w-10 h-10 rounded-full object-cover ring-2 ring-yellow-500/20"
								alt={otherUser?.display_name || resolvedOtherUserName}
							/>
						) : (
							<div className="w-10 h-10 bg-neutral-900 border border-neutral-800 rounded-full flex items-center justify-center font-black text-white ring-2 ring-yellow-500/20">
								{otherUser?.display_name?.[0] || resolvedOtherUserName?.[0] || '?'}
							</div>
						)}
						
						<div className="min-w-0 text-center">
							<h3 className="font-black tracking-tight text-white truncate max-w-[56vw] mx-auto">
								{otherUser?.display_name || resolvedOtherUserName || 'Usuário'}
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

			<div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-neutral-950 pb-[calc(env(safe-area-inset-bottom)+120px)]">
				{messages.length === 0 ? (
					<div className="text-center py-10 text-neutral-500">
						<div className="text-lg mb-2">💬</div>
						<p className="font-semibold">Comece a conversa</p>
						<p className="text-sm">Envie uma mensagem para {otherUser?.display_name || otherUserName}</p>
					</div>
				) : (
					<>
						{messages.map((message, index) => {
							const isMyMessage = safeUserId ? message.sender_id === safeUserId : false;
							const prevSenderId = messages?.[index - 1]?.sender_id;
							const showAvatar = !isMyMessage && (index === 0 || prevSenderId !== message.sender_id);
							
							return (
								<div
									key={message.id}
									className={`flex gap-3 ${isMyMessage ? 'flex-row-reverse' : ''} ${!showAvatar && !isMyMessage ? 'ml-11' : ''}`}
								>
									{!isMyMessage && showAvatar && (
										message.sender?.photo_url ? (
											<Image
												src={message.sender.photo_url}
												width={32}
												height={32}
												className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 object-cover self-end mb-1"
												alt={message.sender.display_name}
											/>
										) : (
											<div className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center font-black text-[10px] self-end mb-1">
												{message.sender?.display_name?.[0] || '?'}
											</div>
										)
									)}
									
									<div className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm break-words ${
										isMyMessage
											? 'bg-yellow-500 text-black rounded-br-none shadow-yellow-500/15'
											: 'bg-neutral-900/80 text-white rounded-bl-none border border-neutral-800'
									}`}> 
										{!isMyMessage && (
											<p className="text-[10px] font-bold text-neutral-400 mb-1">
												{message.sender?.display_name || 'Usuário'}
											</p>
										)}
                                        {(() => {
                                            let payload = null;
                                            try { if (typeof message.content === 'string' && message.content.startsWith('{')) payload = JSON.parse(message.content); } catch {}
                                            
                                            if (payload?.type === 'image')
                                                return (
                                                    <Image
                                                        src={payload.thumb_url || payload.media_url}
                                                        alt="imagem"
                                                        width={CHAT_MEDIA_PREVIEW_SIZE}
                                                        height={CHAT_MEDIA_PREVIEW_SIZE}
                                                        className="rounded-lg max-h-64 w-full object-cover cursor-pointer"
                                                        onClick={() => {
                                                            try {
                                                                const url = payload?.media_url ? String(payload.media_url) : '';
                                                                if (!url) return;
                                                                window.open(url, '_blank');
                                                            } catch {}
                                                        }}
                                                    />
                                                );
                                            if (payload?.type === 'video') return <video src={payload.media_url} controls playsInline className="rounded-lg max-h-64 w-full" />;
                                            if (payload?.type === 'gif')
                                                return (
                                                    <Image
                                                        src={payload.media_url}
                                                        alt="gif"
                                                        width={CHAT_MEDIA_PREVIEW_SIZE}
                                                        height={CHAT_MEDIA_PREVIEW_SIZE}
                                                        className="rounded-lg max-h-64 w-full object-cover"
                                                        unoptimized
                                                    />
                                                );
                                            
                                            return <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{payload?.text ?? message.content}</p>;
                                        })()}
										<p className={`text-[10px] mt-1 text-right tabular-nums ${
											isMyMessage ? 'text-black/60' : 'text-neutral-500'
										}`}>
											{formatTime(message.created_at)}
										</p>
									</div>
								</div>
							);
						})}
						<div ref={messagesEndRef} />
						{loadingMore && (
							<div className="text-center text-xs text-neutral-500 py-2">Carregando mensagens...</div>
						)}
					</>
				)}
			</div>

			<form onSubmit={handleSendMessage} className="sticky bottom-0 z-30 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] bg-neutral-950 border-t border-neutral-800 shadow-[0_-14px_40px_rgba(0,0,0,0.55)]">
				<div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-2xl px-2 py-2">
					<button type="button" onClick={() => setShowEmoji(v => !v)} className="w-11 h-11 rounded-xl bg-neutral-800 text-neutral-200 hover:text-white hover:bg-neutral-700 active:scale-95 transition-transform inline-flex items-center justify-center"><Smile size={18} /></button>
					<button type="button" onClick={handleAttachClick} className="w-11 h-11 rounded-xl bg-neutral-800 text-neutral-200 hover:text-white hover:bg-neutral-700 active:scale-95 transition-transform inline-flex items-center justify-center"><ImageIcon size={18} /></button>
					<button type="button" onClick={handleAddGif} className="w-11 h-11 rounded-xl bg-neutral-800 text-neutral-200 hover:text-white hover:bg-neutral-700 active:scale-95 transition-transform inline-flex items-center justify-center"><Link2 size={18} /></button>
					<input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileSelected} />
					<input
						type="text"
						value={newMessage}
						onChange={(e) => setNewMessage(e.target.value)}
						placeholder="Digite uma mensagem…"
						className="flex-1 min-w-0 bg-transparent text-white outline-none placeholder:text-neutral-500 text-[15px] leading-6 px-2"
					/>
					<button
						type="submit"
						disabled={!newMessage.trim()}
						className="shrink-0 w-11 h-11 rounded-xl bg-yellow-500 text-black flex items-center justify-center shadow-lg shadow-yellow-500/20 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
					>
						<Send size={18} />
					</button>
				</div>
				{uploading ? <div className="mt-2 text-[11px] text-neutral-400">Enviando…</div> : null}
				{showEmoji && (
					<div className="absolute right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] bg-neutral-950 border border-neutral-800 rounded-2xl p-2 grid grid-cols-8 gap-1 shadow-2xl z-50">
						{['😀','😁','😂','😉','😊','😍','👍','💪','🔥','🙏','🥳','🤝','🤩','🤔','👏','🙌'].map(e => (
							<button type="button" key={e} className="text-xl w-9 h-9 rounded-xl hover:bg-neutral-900 active:scale-95 transition-transform" onClick={() => insertEmoji(e)}>{e}</button>
						))}
					</div>
				)}
			</form>
		</div>
	);
};

export default ChatDirectScreen;
