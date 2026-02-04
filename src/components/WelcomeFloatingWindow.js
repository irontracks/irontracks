import React, { useState, useEffect } from 'react';
import { X, Sparkles, Crown, ArrowRight } from 'lucide-react';

export default function WelcomeFloatingWindow({ user, onClose }) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Check if already seen
        const seen = localStorage.getItem('welcome_window_seen_v1');
        if (!seen) {
            // Small delay for smooth entrance
            const t = setTimeout(() => setIsVisible(true), 1000);
            return () => clearTimeout(t);
        }
    }, []);

    const handleClose = () => {
        setIsVisible(false);
        localStorage.setItem('welcome_window_seen_v1', 'true');
        if (onClose) onClose();
    };

    if (!isVisible) return null;

    const displayName = user?.displayName || user?.name || 'Atleta';

    return (
        <div className="fixed bottom-6 right-6 z-[2000] max-w-sm w-full animate-in slide-in-from-bottom-10 fade-in duration-700">
            <div className="relative bg-neutral-900/80 backdrop-blur-xl border border-yellow-500/30 rounded-2xl shadow-2xl overflow-hidden p-6">
                {/* Glow Effect */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-yellow-500/20 rounded-full blur-3xl pointer-events-none" />
                
                <div className="relative z-10">
                    <div className="flex items-start justify-between gap-4">
                        <div className="w-12 h-12 rounded-xl bg-yellow-500 flex items-center justify-center shrink-0 shadow-lg shadow-yellow-500/20">
                            <Crown size={24} className="text-black" />
                        </div>
                        <button 
                            onClick={handleClose}
                            className="text-neutral-400 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="mt-4">
                        <h3 className="text-lg font-black text-white leading-tight">
                            Bem-vindo de volta, {displayName}!
                        </h3>
                        <p className="mt-2 text-sm text-neutral-300 leading-relaxed">
                            Você está no comando. Como <span className="text-yellow-500 font-bold">Admin / VIP Elite</span>, você tem acesso ilimitado ao novo <strong className="text-white">Iron Coach IA</strong>.
                        </p>
                    </div>

                    <div className="mt-5">
                        <button 
                            onClick={handleClose}
                            className="w-full h-10 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-lg text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors shadow-lg shadow-yellow-500/10"
                        >
                            <Sparkles size={14} />
                            Explorar Agora
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
