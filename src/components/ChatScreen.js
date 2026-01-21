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
    Link2
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useDialog } from '@/contexts/DialogContext';
import { compressImage, generateImageThumbnail } from '@/utils/chat/media';

const CHAT_MEDIA_PREVIEW_SIZE = 800;

const ChatScreen = ({ user, onClose }) => {
    const [view, setView] = useState('list');
    const [activeChannel, setActiveChannel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const { confirm, alert, prompt } = useDialog();
    const alertRef = useRef(alert);
    const confirmRef = useRef(confirm);
    const promptRef = useRef(prompt);

    const [globalChannel, setGlobalChannel] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const fileInputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    
    const [searchQuery] = useState('');
    const safeUserId = user?.id ? String(user.id) : '';

    const dummy = useRef();
    const supabase = useMemo(() => createClient(), []);

    useEffect(() => {
        alertRef.current = alert;
        confirmRef.current = confirm;
        promptRef.current = prompt;
    }, [alert, confirm, prompt]);

    const [privateChannels, setPrivateChannels] = useState([]);
    const [sendingInviteTo, setSendingInviteTo] = useState(null);

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
        } catch (e) {
            console.error("Error loading chat data:", e);
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

    const formatMessage = useCallback((m) => {
        let payload = null
        try { if (typeof m.content === 'string' && m.content.startsWith('{')) payload = JSON.parse(m.content) } catch {}
        return {
            id: m.id,
            text: payload?.text ?? m.content,
            kind: payload?.type ?? 'text',
            mediaUrl: payload?.media_url,
            thumbUrl: payload?.thumb_url,
            uid: m.user_id,
            createdAt: new Date(m.created_at),
            displayName: m.profiles?.display_name || 'Unknown',
            photoURL: m.profiles?.photo_url
        }
    }, [])

    useEffect(() => {
        let mounted = true;

        loadData();
        ensureBucket().catch(err => console.warn('Bucket ensure failed', err));

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
        } catch (e) {
            const msg = (e?.message ?? String(e ?? '')).trim();
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
            try {
                const res = await fetch(`/api/chat/messages?channel_id=${activeChannel.id}`);
                const ct = res.headers.get('content-type') || '';
                let json;
                if (ct.includes('application/json')) {
                    json = await res.json();
                } else {
                    const txt = await res.text();
                    console.warn("Non-JSON response from messages endpoint", { status: res.status, body: txt.slice(0,200) });
                    return;
                }
                
                if (json.ok && json.data) {
                    setMessages(json.data.reverse().map(formatMessage));
                } else {
                    console.error("API returned error or no data:", json);
                }
            } catch (e) {
                console.error("Error loading messages:", e);
            }
        };
        loadMessages();

        const channel = supabase
            .channel(`chat:${activeChannel.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeChannel.id}` },
                async (payload) => {
                    try {
                        const newMsg = payload?.new && typeof payload.new === 'object' ? payload.new : null;
                        if (!newMsg) return;
                        const senderId = newMsg?.user_id ? String(newMsg.user_id) : '';
                        let profile = null;
                        if (senderId) {
                            const { data } = await supabase
                                .from('profiles')
                                .select('display_name, photo_url')
                                .eq('id', senderId)
                                .maybeSingle();
                            profile = data || null;
                        }
                        setMessages((prev) => [...prev, formatMessage({ ...newMsg, profiles: profile })]);
                    } catch (e) {
                        console.error('Erro ao processar mensagem realtime:', e);
                        return;
                    }
                }
            )
            .subscribe();

        const poll = setInterval(loadMessages, 5000);
        return () => { supabase.removeChannel(channel); clearInterval(poll); };
    }, [activeChannel, formatMessage, supabase]);

    useEffect(() => {
        dummy.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e) => {
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

    const handleAttachClick = () => { fileInputRef.current?.click() }

    const handleFileSelected = async (e) => {
        const files = Array.from(e.target.files || [])
        if (!files.length || !activeChannel) return
        setUploading(true)
        try {
            for (const file of files) {
                const isImage = file.type.startsWith('image/')
                const isVideo = file.type.startsWith('video/')
                if (!isImage && !isVideo) continue

                const pathBase = `${activeChannel.id}/${Date.now()}_${file.name.replace(/\s+/g,'_')}`
                if (isImage) {
                    const compressed = await compressImage(file, { maxWidth: 1280, quality: 0.8 })
                    const thumb = await generateImageThumbnail(file, { thumbWidth: 360 })
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
                    if (file.size > 50 * 1024 * 1024) { await alertRef.current('Vídeo acima de 50MB. Comprima antes.'); continue }
                    const signVid = await fetch('/api/storage/signed-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: `${pathBase}` }) }).then(r => r.json())
                    if (!signVid.ok) throw new Error(signVid.error || 'Falha ao assinar upload')
                    await supabase.storage.from('chat-media').uploadToSignedUrl(signVid.path, signVid.token, file)
                    const { data: pub } = await supabase.storage.from('chat-media').getPublicUrl(signVid.path)
                    const payload = { type: 'video', media_url: pub.publicUrl }
                    await fetch('/api/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel_id: activeChannel.id, content: JSON.stringify(payload) }) })
                }
            }
        } catch (err) { console.error(err); await alertRef.current('Falha ao enviar mídia: '+(err?.message || String(err))) }
        finally { setUploading(false); e.target.value = '' }
    }

    const insertEmoji = (emoji) => { setNewMessage(prev => prev + emoji); setShowEmoji(false) }

    const handleAddGif = async () => {
        const url = await promptRef.current('Cole a URL do GIF (GIPHY/Tenor):', 'GIF')
        if (!url || !activeChannel) return
        const payload = { type: 'gif', media_url: url }
        await fetch('/api/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel_id: activeChannel.id, content: JSON.stringify(payload) }) })
    }

    const handleUserClick = async (targetUser) => {
        if (!safeUserId) {
            await alertRef.current('Sessão inválida. Faça login novamente.');
            return;
        }
        const existingChat = privateChannels.find(c => c.otherUserId === targetUser.id);
        
        if (existingChat) {
            openPrivateChat(existingChat);
            return;
        }

        if (await confirmRef.current(`Quer conversar com ${targetUser.display_name}?`, "Iniciar Conversa")) {
            setSendingInviteTo(targetUser.id);
            try {
                const { data: pending } = await supabase
                    .from('chat_invites')
                    .select('*')
                    .eq('sender_id', safeUserId)
                    .eq('receiver_id', targetUser.id)
                    .eq('status', 'pending')
                    .single();
                
                if (pending) {
                    const resend = await confirmRef.current("Já existe um convite pendente para este usuário. Cancelar e reenviar?", "Convite Pendente");
                    if (resend) {
                        const { error: delErr } = await supabase.from('chat_invites').delete().eq('id', pending.id);
                        if (delErr) throw delErr;
                        const { error: reErr } = await supabase.from('chat_invites').insert({
                            sender_id: safeUserId,
                            receiver_id: targetUser.id
                        });
                        if (reErr) throw reErr;
                        await alertRef.current(`Convite reenviado para ${targetUser.display_name}!`, "Convite Reenviado");
                        setView('list');
                    } else {
                        await alertRef.current("Você já enviou um convite para este usuário.");
                    }
                } else {
                    const { error } = await supabase.from('chat_invites').insert({
                        sender_id: safeUserId,
                        receiver_id: targetUser.id
                    });
                    if (error) throw error;
                    await alertRef.current(`Convite enviado para ${targetUser.display_name}! Aguarde a aceitação.`, "Convite Enviado");
                    setView('list');
                }
            } catch (e) {
                await alertRef.current("Erro ao enviar convite: " + (e?.message ?? String(e)));
            } finally {
                setSendingInviteTo(null);
            }
        }
    };

    const handleAcceptInvite = async (invite) => {
        if (!safeUserId) {
            await alertRef.current('Sessão inválida. Faça login novamente.');
            return;
        }
        try {
            const { data: channel, error: cErr } = await supabase.from('chat_channels').insert({ type: 'private' }).select().single();
            if (cErr) throw cErr;

            await supabase.from('chat_members').insert([
                { channel_id: channel.id, user_id: safeUserId },
                { channel_id: channel.id, user_id: invite.sender_id }
            ]);

            await supabase.from('chat_invites').update({ status: 'accepted' }).eq('id', invite.id);

            await loadData();
        } catch (e) {
            console.error(e);
        }
    };

    const handleRejectInvite = async (id) => {
        await supabase.from('chat_invites').update({ status: 'rejected' }).eq('id', id);
        loadData();
    };

    const openPrivateChat = (channel) => {
        setActiveChannel({ ...channel, type: 'private' });
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
                                                src={msg.thumbUrl || msg.mediaUrl}
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
                                                src={msg.mediaUrl}
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
                                        <p className={`text-[9px] mt-1 text-right ${isMe ? 'text-black/50' : 'text-neutral-500'}`}>{timeLabel}</p>
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
