import React, { useState, useEffect } from 'react';
import { Timer, X } from 'lucide-react';
import { playTimerFinishSound } from '@/lib/sounds';

const RestTimerOverlay = ({ targetTime, onFinish, onClose }) => {
    const [timeLeft, setTimeLeft] = useState(0);
    const [isFinished, setIsFinished] = useState(false);

    const formatDuration = (s) => {
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    useEffect(() => {
        if (!targetTime) {
            setIsFinished(false);
            return;
        }
        
        setIsFinished(false);
        let hasNotified = false;

        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.ceil((targetTime - now) / 1000);
            if (remaining <= 0) {
                setTimeLeft(0);
                setIsFinished(true);
                if (!hasNotified) {
                    hasNotified = true;
                    playTimerFinishSound();
                    if (Notification.permission === 'granted') {
                        new Notification("⏰ Tempo Esgotado!", { 
                            body: "Hora de voltar para o treino!", 
                            icon: 'icone.png',
                            tag: 'timer_finished'
                        });
                    }
                }
            } else {
                setTimeLeft(remaining);
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 100);
        return () => clearInterval(interval);
    }, [targetTime]);

    if (!targetTime) return null;

    if (isFinished) {
        return (
            <div className="fixed inset-0 z-[100] bg-green-500 flex flex-col items-center justify-center animate-pulse-fast cursor-pointer" onClick={onFinish}>
                <Timer size={120} className="text-black mb-8 animate-bounce"/>
                <h1 className="text-6xl font-black text-black uppercase tracking-tighter">BORA!</h1>
                <p className="text-black font-bold mt-4 text-xl">TOQUE PARA VOLTAR</p>
            </div>
        );
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900/95 backdrop-blur-xl border-t border-yellow-500/30 p-6 shadow-2xl z-50 animate-slide-up pb-safe">
            <div className="flex items-center justify-between max-w-md mx-auto">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="absolute inset-0 bg-yellow-500 blur-lg opacity-20 animate-pulse"></div>
                        <Timer className="text-yellow-500 relative z-10" size={36}/>
                    </div>
                    <div>
                        <p className="text-[10px] text-yellow-500 uppercase font-bold tracking-widest">Recuperação</p>
                        <p className="text-4xl font-mono font-black text-white tabular-nums leading-none">{formatDuration(timeLeft)}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="h-12 w-12 bg-neutral-800 rounded-xl text-neutral-400 border border-neutral-700 hover:text-white hover:bg-neutral-700 flex items-center justify-center"><X size={20}/></button>
                </div>
            </div>
        </div>
    );
};

export default RestTimerOverlay;
