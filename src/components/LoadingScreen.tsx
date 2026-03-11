'use client'
import Image from 'next/image'

const LoadingScreen = () => (
    <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center pt-safe pb-safe overflow-hidden">

        {/* Full-screen hero background */}
        <div className="absolute inset-0">
            <Image
                src="/login-hero.png"
                alt=""
                fill
                priority
                unoptimized
                className="object-cover object-center"
                style={{ opacity: 0.18 }}
            />
            {/* Bottom fade to black */}
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-neutral-950/30" />
            {/* Top fade */}
            <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/70 via-transparent to-transparent" />
        </div>

        {/* Center content */}
        <div
            className="relative z-10 flex flex-col items-center"
            style={{ animation: 'splash-in 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards', opacity: 0 }}
        >
            {/* IRONTRACKS wordmark */}
            <div className="mb-3">
                <h1 className="text-5xl font-black tracking-wide text-center leading-none">
                    <span className="text-white">IRON</span>
                    <span className="text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-amber-500">TRACKS</span>
                </h1>
            </div>

            {/* Amber divider line */}
            <div className="w-12 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent mb-3 rounded-full" />

            {/* Tagline */}
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.35em]">
                Sistema de Alta Performance
            </p>
        </div>

        {/* Progress bar — bottom of screen */}
        <div
            className="absolute bottom-12 left-1/2 -translate-x-1/2 w-20 h-[1.5px] bg-neutral-800 rounded-full overflow-hidden"
            style={{ animation: 'fade-in 0.4s ease-out 0.5s forwards', opacity: 0 }}
        >
            <div
                className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 rounded-full"
                style={{ animation: 'progress 1.8s cubic-bezier(0.4, 0, 0.2, 1) 0.4s forwards', width: '0%' }}
            />
        </div>

        <style>{`
            @keyframes splash-in {
                0%   { opacity: 0; transform: translateY(12px); }
                100% { opacity: 1; transform: translateY(0); }
            }
            @keyframes fade-in {
                to { opacity: 1; }
            }
            @keyframes progress {
                0%   { width: 0%; }
                60%  { width: 70%; }
                85%  { width: 88%; }
                100% { width: 100%; }
            }
        `}</style>
    </div>
)

export default LoadingScreen
