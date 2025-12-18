import React, { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';

const MiniPlayer = ({ session, onClick }) => {
    const [elapsed, setElapsed] = useState(0);
    
    useEffect(() => {
        if (!session?.startedAt) return;
        const interval = setInterval(() => {
            setElapsed(Math.floor((Date.now() - session.startedAt) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [session]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (!session) return null;
    
    return (
        <div onClick={onClick} className="fixed bottom-24 left-4 right-4 bg-neutral-800 border border-yellow-500/50 p-4 rounded-2xl shadow-2xl flex items-center justify-between z-40 cursor-pointer animate-slide-up active:scale-95 transition-transform">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-yellow-500 flex flex-col items-center justify-center animate-pulse shrink-0">
                    <Activity className="text-black" size={16}/>
                    <span className="text-[10px] font-black text-black leading-none">{formatTime(elapsed)}</span>
                </div>
                <div>
                    <p className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest">Em Andamento</p>
                    <h3 className="font-bold text-white text-sm truncate max-w-[150px]">{session.workout?.title || 'Treino'}</h3>
                </div>
            </div>
            <div className="bg-yellow-500 text-black px-3 py-1.5 rounded-lg text-xs font-black">VOLTAR</div>
        </div>
    );
};

export default MiniPlayer;
