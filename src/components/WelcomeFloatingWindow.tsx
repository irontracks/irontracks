import React, { useState, useEffect } from 'react';
import { X, Sparkles, Crown } from 'lucide-react';

interface WelcomeFloatingWindowProps {
    user: {
        id?: string | number | null
        displayName?: string | null
        name?: string | null
    } | null
    onClose?: () => void
}

export default function WelcomeFloatingWindow({ user, onClose }: WelcomeFloatingWindowProps) {
    const [isVisible, setIsVisible] = useState(false);
    const WELCOME_SEEN_KEY_VERSION = 1;
    const WELCOME_DELAY_MS = 1000;

    useEffect(() => {
        let cancelled = false;
        let timer: number | null = null;
        const uid = user?.id ? String(user.id) : '';
        if (!uid) return;
        try {
            if (typeof window === 'undefined') return;
        } catch {
            return;
        }
        const key = `irontracks.vipWelcome.seen.v${WELCOME_SEEN_KEY_VERSION}.${uid}`;
        let seen = false;
        try {
            seen = window.localStorage.getItem(key) === '1';
        } catch { }
        if (seen) return;
        (async () => {
            try {
                const res = await fetch('/api/vip/welcome-status');
                const data = await res.json().catch(() => ({}));
                if (!data?.ok || !data?.hasVip || !data?.shouldShow) return;
                timer = window.setTimeout(() => {
                    if (!cancelled) setIsVisible(true);
                }, WELCOME_DELAY_MS);
            } catch { }
        })();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [user?.id]);

    const handleClose = () => {
        setIsVisible(false);
        const uid = user?.id ? String(user.id) : '';
        if (uid) {
            const key = `irontracks.vipWelcome.seen.v${WELCOME_SEEN_KEY_VERSION}.${uid}`;
            try {
                localStorage.setItem(key, '1');
            } catch { }
        }
        try {
            fetch('/api/vip/welcome-seen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            }).catch(() => { });
        } catch { }
        if (onClose) onClose();
    };

    if (!isVisible) return null;

    const displayName = user?.displayName || user?.name || 'Atleta';

    return (
        <div className="fixed bottom-6 right-6 z-[2000] max-w-[calc(100vw-3rem)] w-full sm:max-w-sm animate-in slide-in-from-bottom-10 fade-in duration-700 pb-safe pr-safe">
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
