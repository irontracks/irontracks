'use client'
import Image from 'next/image'
import { useEffect, useState } from 'react'

const LoadingScreen = () => {
    // Safety valve: if still mounted after 8 s, it means we are stuck in a
    // redirect loop (e.g. failed Apple Sign-In left an inconsistent localStorage).
    // Show a soft offline / retry hint instead of looping indefinitely.
    const [stuck, setStuck] = useState(false)

    useEffect(() => {
        const t = setTimeout(() => setStuck(true), 8000)
        return () => clearTimeout(t)
    }, [])

    if (stuck) {
        return (
            <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center gap-4 px-8">
                <p className="text-neutral-400 text-sm text-center">
                    Não foi possível carregar o app.<br />
                    Verifique sua conexão e tente novamente.
                </p>
                <button
                    className="mt-2 px-6 py-2 rounded-full bg-amber-500 text-black text-sm font-bold"
                    onClick={() => {
                        try {
                            localStorage.removeItem('it.logged_in')
                            localStorage.removeItem('it.session.backup')
                        } catch { }
                        window.location.replace('/')
                    }}
                >
                    Voltar ao início
                </button>
            </div>
        )
    }

    return (
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
            {/* IRONTRACKS wordmark — with shimmer sweep */}
            <div className="mb-3 relative overflow-hidden">
                <h1 className="text-5xl font-black tracking-wide text-center leading-none">
                    <span className="text-white">IRON</span>
                    <span className="text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-amber-500">TRACKS</span>
                </h1>
                {/* Gold shimmer sweep across the logo */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: 'linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.15) 45%, rgba(251,191,36,0.3) 50%, rgba(251,191,36,0.15) 55%, transparent 100%)',
                        animation: 'logo-shimmer 2.5s ease-in-out 0.5s infinite',
                    }}
                />
            </div>

            {/* Amber divider line — breathing glow */}
            <div
                className="w-12 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent mb-3 rounded-full"
                style={{ animation: 'divider-breathe 2s ease-in-out infinite' }}
            />

            {/* Tagline */}
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.35em]">
                Sistema de Alta Performance
            </p>
        </div>

        {/* Progress bar — bottom of screen, premium gold animated */}
        <div
            className="absolute bottom-12 left-1/2 -translate-x-1/2 w-20 h-[2px] bg-neutral-800 rounded-full overflow-hidden"
            style={{ animation: 'fade-in 0.4s ease-out 0.5s forwards', opacity: 0 }}
        >
            <div
                className="h-full rounded-full relative overflow-hidden"
                style={{
                    background: 'linear-gradient(90deg, #92400e, #d97706, #fbbf24, #fde68a)',
                    animation: 'progress 1.8s cubic-bezier(0.4, 0, 0.2, 1) 0.4s forwards',
                    width: '0%',
                    boxShadow: '0 0 8px rgba(251,191,36,0.4)',
                }}
            >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" style={{ animation: 'shimmer 1.5s ease-in-out infinite' }} />
            </div>
        </div>

        <style>{`
            @keyframes splash-in {
                0%   { opacity: 0; transform: translateY(12px) scale(0.97); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
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
            @keyframes logo-shimmer {
                0%   { transform: translateX(-100%); }
                100% { transform: translateX(200%); }
            }
            @keyframes shimmer {
                0%   { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            @keyframes divider-breathe {
                0%, 100% { opacity: 0.6; width: 48px; }
                50%      { opacity: 1; width: 56px; }
            }
        `}</style>
    </div>
    )
}

export default LoadingScreen
