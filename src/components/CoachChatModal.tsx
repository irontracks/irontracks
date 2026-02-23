import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, MessageSquare, User, Bot, Loader2, Sparkles, Save, Trash2 } from 'lucide-react';
import { useVipCredits } from '@/hooks/useVipCredits';
import { isIosNative } from '@/utils/platform';
import type { Exercise } from '@/types/app';
import { logError, logWarn, logInfo } from '@/lib/logger'

interface CoachChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    session?: Record<string, unknown>;
    previousSession?: Record<string, unknown>;
    isVip?: boolean;
    onSaveToReport?: (summary: string) => void;
    onUpgrade?: () => void;
}

interface CoachMessage {
    role: 'assistant' | 'user' | 'system';
    content?: string;
    isBlock?: boolean;
    [key: string]: unknown;
}

export default function CoachChatModal({
    isOpen,
    onClose,
    session,
    previousSession,
    isVip,
    onSaveToReport,
    onUpgrade
}: CoachChatModalProps) {
    const { credits } = useVipCredits();
    const [messages, setMessages] = useState<CoachMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showSavePrompt, setShowSavePrompt] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const analyzeSession = useCallback(() => {
        setIsLoading(true);
        setTimeout(() => {
            if (!session && !previousSession) {
                // Modo Geral
                setMessages([{ 
                    role: 'assistant', 
                    content: "Olá! Sou seu Iron Coach na área VIP. Estou aqui para ajudar com qualquer dúvida sobre treino, nutrição ou estratégia. O que manda hoje?" 
                }]);
                setIsLoading(false);
                return;
            }

            const anomalies: unknown[] = [];
            if (session && previousSession) {
                const currentExs: Exercise[] = Array.isArray(session.exercises) ? (session.exercises as Exercise[]) : [];
                const prevExs: Exercise[] = Array.isArray(previousSession.exercises) ? (previousSession.exercises as Exercise[]) : [];
                
                currentExs.forEach((curr: Exercise) => {
                    const prev = prevExs.find((p: Exercise) => p.name === curr.name);
                    if (prev) {
                        const currSets = (curr as unknown as { sets?: Array<{ weight?: number }> }).sets; const currWeight = Number(currSets?.[0]?.weight || 0);
                        const prevSets = (prev as unknown as { sets?: Array<{ weight?: number }> }).sets; const prevWeight = Number(prevSets?.[0]?.weight || 0);
                        
                        if (currWeight > 0 && prevWeight > 0 && currWeight < prevWeight) {
                            anomalies.push(`Notei que no ${curr.name} você reduziu a carga (de ${prevWeight}kg para ${currWeight}kg).`);
                        }
                        
                        const currRest = Number(curr.restTime || 0);
                        const prevRest = Number(prev.restTime || 0);
                        if (currRest > 60 && prevRest > 0 && currRest > prevRest * 1.5) {
                            anomalies.push(`No ${curr.name}, seu tempo de descanso aumentou bastante.`);
                        }
                    }
                });
            }

            let text = "Olá! Sou seu Coach IronTracks. ";
            if (anomalies.length > 0) {
                text += "Analisei seu treino e " + anomalies[0] + " O que houve?";
            } else {
                text += "Seu treino foi consistente. Quer destacar algum ponto específico ou discutir sua performance?";
            }
            
            setMessages([{ role: 'assistant', content: text }]);
            setIsLoading(false);
        }, 1000);
    }, [session, previousSession]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, showSavePrompt]);

    useEffect(() => {
        if (isOpen && messages.length === 0) {
            analyzeSession();
        }
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, messages.length, analyzeSession]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: CoachMessage = { role: 'user', content: input };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/ai/coach-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: newMessages,
                    context: { session, previousSession }
                })
            });

            const data = await res.json();

            // Handle Limit Reached
            if (res.status === 403 && data?.upgradeRequired) {
                setMessages(prev => [...prev, { 
                    role: 'assistant', 
                    content: data.message || "Limite atingido. Faça upgrade para continuar.",
                    isBlock: true 
                }]);
                return;
            }

            if (!res.ok) throw new Error('Falha na comunicação');

            if (data.content || data.text || data.answer) {
                setMessages(prev => [...prev, { role: 'assistant', content: data.content || data.text || data.answer }]);
            }
        } catch (error) {
            logError('error', error);
            setMessages(prev => [...prev, { role: 'assistant', content: "Desculpe, tive um problema ao processar sua mensagem. Tente novamente." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        if (messages.length > 1) {
            setShowSavePrompt(true);
        } else {
            onClose();
        }
    };

    const confirmSave = (shouldSave: boolean) => {
        if (shouldSave && onSaveToReport) {
            const summary = messages
                .filter(m => m.role !== 'system')
                .map(m => `${m.role === 'user' ? 'Você' : 'Coach'}: ${m.content}`)
                .join('\n');
            onSaveToReport(summary);
        }
        onClose();
    };

    if (!isOpen) return null;
    const hideVipCtas = isIosNative();

    const formatLimit = (limit: number | null | undefined) => (limit == null ? '∞' : limit > 1000 ? '∞' : limit)
    const isChatExhausted = (entry?: { used: number; limit: number | null }) => !!entry && entry.limit !== null && entry.used >= entry.limit

    return (
        <div className="fixed inset-0 z-[1300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-800 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/50 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center text-black">
                            <Bot size={24} />
                        </div>
                        <div>
                            <div className="font-black text-white text-sm uppercase tracking-wide">Iron Coach</div>
                            <div className="flex items-center gap-2">
                                <div className="text-xs text-yellow-500 font-bold">IA Analysis</div>
                                {credits?.chat && (
                                    <div className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isChatExhausted(credits.chat) ? 'bg-red-500/20 text-red-400' : 'bg-neutral-800 text-neutral-400'}`}>
                                        {credits.chat.used}/{formatLimit(credits.chat.limit)}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-neutral-700' : 'bg-yellow-500/20 text-yellow-500'}`}>
                                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                            </div>
                            <div className={`rounded-2xl p-3 text-sm max-w-[80%] ${
                                msg.role === 'user' 
                                    ? 'bg-neutral-800 text-white rounded-tr-none' 
                                    : 'bg-yellow-500/10 text-yellow-100 border border-yellow-500/20 rounded-tl-none'
                            }`}>
                                {msg.isBlock ? (
                                    <div className="flex flex-col gap-3">
                                        <div>{msg.content}</div>
                                        {!hideVipCtas ? (
                                            <button 
                                                onClick={() => onUpgrade ? onUpgrade() : (window.location.href = '/marketplace')}
                                                className="bg-yellow-500 text-black font-black px-4 py-2 rounded-xl text-xs uppercase tracking-widest hover:bg-yellow-400 transition-colors w-full sm:w-auto"
                                            >
                                                Ver Planos VIP
                                            </button>
                                        ) : (
                                            <div className="text-xs font-bold text-neutral-400">
                                                Planos indisponíveis no iOS no momento.
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    msg.content
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex gap-3">
                             <div className="w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-500 flex items-center justify-center shrink-0">
                                <Bot size={14} />
                            </div>
                            <div className="bg-neutral-900/50 p-3 rounded-2xl rounded-tl-none border border-neutral-800">
                                <Loader2 size={16} className="animate-spin text-yellow-500" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {showSavePrompt && (
                    <div className="absolute inset-0 z-10 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 rounded-2xl">
                        <div className="w-full max-w-sm text-center">
                            <Sparkles size={48} className="text-yellow-500 mx-auto mb-4" />
                            <h3 className="text-xl font-black text-white mb-2">Salvar Insights?</h3>
                            <p className="text-neutral-400 text-sm mb-6">
                                Quer adicionar as conclusões dessa conversa ao seu relatório de treino?
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={() => confirmSave(false)}
                                    className="py-3 rounded-xl bg-neutral-800 text-neutral-300 font-bold hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Trash2 size={16} />
                                    Descartar
                                </button>
                                <button 
                                    onClick={() => confirmSave(true)}
                                    className="py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Save size={16} />
                                    Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {!showSavePrompt && (
                    <div className="p-4 border-t border-neutral-800 bg-neutral-950/50 rounded-b-2xl">
                        {credits?.chat && (
                            <div className="flex justify-end mb-2">
                                <span className={`text-[10px] font-mono font-bold ${isChatExhausted(credits.chat) ? 'text-red-400' : 'text-neutral-500'}`}>
                                    Mensagens hoje: {credits.chat.used}/{formatLimit(credits.chat.limit)}
                                </span>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Digite sua mensagem..."
                                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all"
                                disabled={isLoading}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading}
                                className="w-12 h-12 rounded-xl bg-yellow-500 text-black flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-yellow-400 transition-colors"
                            >
                                <Send size={20} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
