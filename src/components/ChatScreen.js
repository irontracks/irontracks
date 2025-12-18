import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { 
    ArrowLeft, 
    MessageSquare, 
    X, 
    Users, 
    Send 
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

const ChatScreen = ({ user, onClose }) => {
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const dummy = useRef();
    const supabase = createClient();

    // Fetch Messages
    useEffect(() => {
        if (!activeChat || !activeChat.id === 'global') return; // Only global chat implemented for now

        const loadMessages = async () => {
             const { data } = await supabase
                .from('messages')
                .select('*, profiles(display_name, photo_url)')
                .order('created_at', { ascending: false })
                .limit(50);
             
             if (data) {
                 const mapped = data.reverse().map(m => ({
                     id: m.id,
                     text: m.content,
                     uid: m.user_id,
                     createdAt: new Date(m.created_at),
                     displayName: m.profiles?.display_name || 'Unknown',
                     photoURL: m.profiles?.photo_url
                 }));
                 setMessages(mapped);
             }
        };
        loadMessages();

        // Subscribe to new messages
        const channel = supabase
            .channel('public:messages')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages'
                },
                async (payload) => {
                    const newMsg = payload.new;
                    
                    // Fetch profile for the new message
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('display_name, photo_url')
                        .eq('id', newMsg.user_id)
                        .single();
                        
                    setMessages(prev => [...prev, {
                        id: newMsg.id,
                        text: newMsg.content,
                        uid: newMsg.user_id,
                        createdAt: new Date(newMsg.created_at),
                        displayName: profile?.display_name || 'Unknown',
                        photoURL: profile?.photo_url
                    }]);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };

    }, [activeChat]);

    useEffect(() => {
        dummy.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;
        const text = newMessage;
        setNewMessage('');
        
        try {
            await supabase.from('messages').insert({
                user_id: user.id,
                content: text
            });
        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-neutral-900 flex flex-col animate-slide-up">
            <div className="p-4 bg-neutral-800 border-b border-neutral-700 flex justify-between items-center shadow-lg pt-safe">
                <div className="flex items-center gap-3">
                    {activeChat ? <button onClick={() => setActiveChat(null)} className="p-1 rounded-full hover:bg-neutral-600 mr-1"><ArrowLeft size={20} /></button> : <div className="bg-yellow-500 p-2 rounded-full text-black"><MessageSquare size={20} /></div>}
                    <div>
                        <h3 className="font-bold text-lg">{activeChat ? (activeChat.displayName || activeChat.title) : 'Mensagens'}</h3>
                        <p className="text-xs text-neutral-400 flex items-center gap-1">{activeChat ? 'Online' : 'Selecione uma conversa'}</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 bg-neutral-700 rounded-full hover:bg-neutral-600"><X size={20} /></button>
            </div>
            {!activeChat && (
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    <button onClick={() => setActiveChat({ id: 'global', title: 'Iron Lounge', displayName: 'Iron Lounge' })} className="w-full bg-neutral-800 p-4 rounded-xl flex items-center gap-4 hover:bg-neutral-700 transition-colors border border-neutral-700 h-20">
                        <div className="w-12 h-12 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold shrink-0"><Users size={24} /></div>
                        <div className="text-left">
                            <p className="font-bold text-white text-lg">Iron Lounge</p>
                            <p className="text-xs text-neutral-400">Chat Global</p>
                        </div>
                    </button>
                    {/* Private chats not implemented yet */}
                </div>
            )}
            {activeChat && (
                <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/50">
                        {messages.length === 0 && <div className="text-center py-10 text-neutral-500">Nenhuma mensagem ainda.</div>}
                        
                        {messages.map(msg => {
                            const isMe = msg.uid === user.id;
                            return (
                                <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                                    {msg.photoURL ? (
                                        <Image src={msg.photoURL} width={32} height={32} className="w-8 h-8 rounded-full bg-neutral-700 object-cover self-end mb-1" alt={msg.displayName} />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center font-bold text-[10px] self-end mb-1">{msg.displayName[0]}</div>
                                    )}
                                    <div className={`max-w-[75%] rounded-2xl p-3 ${isMe ? 'bg-yellow-500 text-black rounded-br-none' : 'bg-neutral-800 text-white rounded-bl-none'}`}>
                                        {!isMe && <p className="text-[10px] font-bold opacity-50 mb-1">{msg.displayName}</p>}
                                        <p className="text-sm leading-relaxed">{msg.text}</p>
                                        <p className={`text-[9px] mt-1 text-right ${isMe ? 'text-black/50' : 'text-neutral-500'}`}>{msg.createdAt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                    </div>
                                </div>
                            )
                        })}
                        <div ref={dummy}></div>
                    </div>
                    <form onSubmit={sendMessage} className="p-4 bg-neutral-800 border-t border-neutral-700 flex gap-2 pb-safe">
                        <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} className="flex-1 bg-neutral-900 border border-neutral-600 rounded-full px-4 py-3 text-white outline-none focus:border-yellow-500 transition-colors" placeholder="Mensagem..." />
                        <button type="submit" disabled={!newMessage.trim()} className="bg-yellow-500 text-black p-3 rounded-full hover:bg-yellow-400 disabled:opacity-50"><Send size={20} /></button>
                    </form>
                </>
            )}
        </div>
    );
};

export default ChatScreen;
