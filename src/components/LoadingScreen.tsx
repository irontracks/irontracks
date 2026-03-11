'use client'
import Image from 'next/image'

const LoadingScreen = () => (
    <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center pt-safe pb-safe overflow-hidden">

        {/* Ambient glow behind logo */}
        <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[300px] bg-amber-500/10 rounded-full blur-[80px]" />
        </div>

        {/* 3D Metallic Logo */}
        <div
            className="relative w-72 h-72 mb-6"
            style={{ animation: 'logo-entrance 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards', opacity: 0 }}
        >
            <Image
                src="/splash-logo.png"
                alt="IronTracks"
                fill
                priority
                unoptimized
                className="object-contain drop-shadow-[0_0_40px_rgba(245,158,11,0.3)]"
            />
        </div>

        {/* Tagline */}
        <p
            className="text-xs font-bold text-neutral-500 uppercase tracking-[0.3em] mb-8"
            style={{ animation: 'fade-up 0.6s ease-out 0.5s forwards', opacity: 0 }}
        >
            Sistema de Alta Performance
        </p>

        {/* Premium progress bar */}
        <div
            className="w-32 h-[2px] bg-neutral-800 rounded-full overflow-hidden"
            style={{ animation: 'fade-up 0.6s ease-out 0.6s forwards', opacity: 0 }}
        >
            <div
                className="h-full bg-gradient-to-r from-neutral-600 via-amber-400 to-yellow-300 rounded-full"
                style={{ animation: 'loading-progress 1.8s cubic-bezier(0.4, 0, 0.2, 1) 0.3s forwards', width: '0%' }}
            />
        </div>

        <style>{`
            @keyframes logo-entrance {
                0%   { opacity: 0; transform: scale(0.88); }
                100% { opacity: 1; transform: scale(1); }
            }
            @keyframes fade-up {
                0%   { opacity: 0; transform: translateY(8px); }
                100% { opacity: 1; transform: translateY(0); }
            }
            @keyframes loading-progress {
                0%   { width: 0%; }
                50%  { width: 60%; }
                80%  { width: 85%; }
                100% { width: 100%; }
            }
        `}</style>
    </div>
)

export default LoadingScreen
