import React from 'react';

const LoadingScreen = () => (
    <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center pt-safe pb-safe">
        {/* Logo with glow */}
        <div className="relative mb-6">
            <div className="absolute inset-0 blur-2xl bg-yellow-500/20 rounded-full scale-150 animate-pulse" />
            <h2 className="relative text-4xl font-black tracking-tighter animate-pulse">
                <span className="text-yellow-500">IRON</span>
                <span className="text-white">TRACKS</span>
            </h2>
        </div>

        {/* Progress bar */}
        <div className="w-40 h-1 bg-neutral-800 rounded-full overflow-hidden mb-4">
            <div
                className="h-full bg-gradient-to-r from-yellow-500 to-amber-400 rounded-full"
                style={{
                    animation: 'loading-progress 1.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                }}
            />
        </div>

        <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
            Carregando sua jornada…
        </p>

        <style>{`
            @keyframes loading-progress {
                0%   { width: 0%; }
                60%  { width: 70%; }
                80%  { width: 85%; }
                100% { width: 100%; }
            }
        `}</style>
    </div>
);

export default LoadingScreen;
