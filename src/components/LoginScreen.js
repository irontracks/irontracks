'use client'

import React, { useState } from 'react';
import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';

const LoginScreen = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const getLoginHref = () => {
        try {
            const url = new URL(window.location.href);
            const fromQuery = String(url.searchParams.get('next') || '').trim();
            const nextPath = fromQuery && fromQuery.startsWith('/') ? fromQuery : '/dashboard';
            return `/auth/login?next=${encodeURIComponent(nextPath)}`;
        } catch {
            return `/auth/login?next=${encodeURIComponent('/dashboard')}`;
        }
    };

    const handleLogin = async () => {
        setIsLoading(true);
        setErrorMsg('');
        
        try {
            const href = getLoginHref();
            window.location.assign(href);
            return
        } catch (error) {
            console.error("Login Error:", error);
            setIsLoading(false);
            const msg = (error && error.message) ? error.message : 'Falha ao fazer login.';
            setErrorMsg(msg);
        }
    };

    return (
        <div className="relative flex flex-col items-center justify-center min-h-[100dvh] overflow-hidden bg-neutral-950 text-white p-6">
            {/* Spotlight Gradient Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] opacity-60" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay" />
            </div>

            {/* Glassmorphism Card */}
            <div className="relative z-10 w-full max-w-sm p-8 rounded-[2rem] border border-white/5 bg-neutral-900/40 backdrop-blur-xl shadow-2xl shadow-black/50 flex flex-col items-center">
                
                <div className="mb-8 p-6 bg-gradient-to-br from-yellow-500 to-amber-600 rounded-3xl shadow-[0_0_40px_-10px_rgba(245,158,11,0.5)] ring-1 ring-white/20 animate-pulse-slow">
                    <Dumbbell size={48} className="text-black drop-shadow-md" />
                </div>

                <h1 className="text-4xl font-black mb-2 tracking-tighter italic text-center drop-shadow-lg">
                    IRON<span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500">TRACKS</span>
                </h1>
                
                <p className="text-zinc-500 mb-10 text-center text-[10px] uppercase tracking-[0.3em] font-bold">
                    Sistema de Alta Performance • {APP_VERSION}
                </p>
                
                <button
                    type="button"
                    onClick={handleLogin}
                    disabled={isLoading}
                    className="group w-full flex items-center justify-center gap-3 bg-gradient-to-r from-yellow-500 to-amber-600 text-black px-6 py-4 rounded-xl font-black text-lg shadow-[0_10px_30px_-10px_rgba(245,158,11,0.4)] hover:shadow-[0_20px_40px_-10px_rgba(245,158,11,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                        <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-black"></span>
                    ) : (
                        <>
                            <Image 
                                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                                width={24} 
                                height={24} 
                                alt="Google" 
                                className="w-6 h-6 drop-shadow-sm group-hover:scale-110 transition-transform"
                            /> 
                            <span className="tracking-tight">Entrar com Google</span>
                        </>
                    )}
                </button>

                {errorMsg && (
                    <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl w-full text-center animate-shake">
                        <p className="text-red-400 text-xs font-bold tracking-wide break-words">{errorMsg}</p>
                    </div>
                )}
            </div>
            
            <div className="absolute bottom-6 text-[10px] text-zinc-700 font-mono tracking-widest uppercase opacity-50">
                Exclusive Access Only
            </div>
        </div>
    );
};

export default LoginScreen;
