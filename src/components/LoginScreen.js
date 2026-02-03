'use client'

import React, { useState } from 'react';
import Image from 'next/image';
import { Dumbbell } from 'lucide-react';

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
        <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-neutral-900 text-white p-6">
            <div className="mb-8 p-6 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-3xl shadow-2xl animate-pulse">
                <Dumbbell size={64} className="text-black" />
            </div>
            <h1 className="text-5xl font-black mb-2 tracking-tighter italic text-center">IRON<span className="text-yellow-500">TRACKS</span></h1>
            <p className="text-neutral-400 mb-8 text-center max-w-xs font-medium">Sistema de Alta Performance • v3.0</p>
            
            <button
                type="button"
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full max-w-xs flex items-center justify-center gap-3 bg-white text-neutral-900 px-6 py-4 rounded-xl font-bold text-lg hover:bg-neutral-100 transition-all active:scale-95 shadow-xl disabled:opacity-50 mb-4"
            >
                {isLoading ? <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-neutral-900"></span> : <><Image src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={20} height={20} alt="Google" className="w-5 h-5"/> Entrar com Google</>}
            </button>

            {errorMsg && (
                <div className="mt-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg max-w-xs text-center">
                    <p className="text-red-400 text-xs font-mono break-words">{errorMsg}</p>
                </div>
            )}
        </div>
    );
};

export default LoginScreen;
