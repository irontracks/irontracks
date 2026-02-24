'use client'

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Dumbbell, X, CheckCircle2, AlertCircle, Loader2, Mail, ArrowLeft, Lock, User, Phone, Calendar } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import LoadingScreen from '@/components/LoadingScreen';
import { useRouter } from 'next/navigation';
import { isPwaStandalone, isIosNative } from '@/utils/platform';
import { logError, logWarn, logInfo } from '@/lib/logger'
// Capacitor imports dinâmicos — evita quebrar o build web/Vercel
let Capacitor: { getPlatform: () => string } = { getPlatform: () => 'web' };
type AppleAuthorizeOptions = { clientId: string; scopes: string; state?: string; nonce?: string };
type AppleAuthorizeResponse = { response: { identityToken?: string; email?: string; givenName?: string; familyName?: string } };
let SignInWithApple: { authorize: (opts: AppleAuthorizeOptions) => Promise<AppleAuthorizeResponse> } | null = null;
if (typeof window !== 'undefined') {
    try {
        const cap = require('@capacitor/core');
        if (cap?.Capacitor) Capacitor = cap.Capacitor;
        const appleSignIn = require('@capacitor-community/apple-sign-in');
        if (appleSignIn?.SignInWithApple) SignInWithApple = appleSignIn.SignInWithApple;
    } catch {}
}

const LoginScreen = () => {
    const router = useRouter();
    const appVersionLabel = useMemo(() => 'v1..0', []);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [recoverCooldownUntil, setRecoverCooldownUntil] = useState(0);
    const [cooldownTick, setCooldownTick] = useState(0);
    const [recoveryCode, setRecoveryCode] = useState('');
    const [recoveryPassword2, setRecoveryPassword2] = useState('');
    
    // Auth Mode: 'login', 'signup', 'recover', 'recover_code'
    // Default to 'login' to skip menu if Google is removed
    const [authMode, setAuthMode] = useState('login');
    
    // Email Auth State
    const [emailData, setEmailData] = useState({ 
        email: '', 
        password: '', 
        confirmPassword: '',
        fullName: '',
        phone: '',
        birthDate: '',
        isTeacher: false,
        cref: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);

    // Carregar e-mail salvo
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedEmail = localStorage.getItem('it_remembered_email');
            if (savedEmail) {
                setEmailData(prev => ({ ...prev, email: savedEmail }));
                setRememberMe(true);
            }
        }
    }, []);

    // Request Access State
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [reqLoading, setReqLoading] = useState(false);
    const [reqSuccess, setReqSuccess] = useState(false);
    const [reqError, setReqError] = useState('');
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',
        birth_date: '',
        is_teacher: false,
        cref: ''
    });

    const getOAuthHref = (provider: string) => {
        const safeProvider = String(provider || '').trim().toLowerCase() === 'apple' ? 'apple' : 'google';
        let holdLoading = false;
        try {
            const url = new URL(window.location.href);
            const fromQuery = String(url.searchParams.get('next') || '').trim();
            const nextPath = fromQuery && fromQuery.startsWith('/') ? fromQuery : '/dashboard';
            return `/auth/login?provider=${encodeURIComponent(safeProvider)}&next=${encodeURIComponent(nextPath)}`;
        } catch {
            return `/auth/login?provider=${encodeURIComponent(safeProvider)}&next=${encodeURIComponent('/dashboard')}`;
        }
    };

    const randomString = (length: number) => {
        const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        try {
            if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function') {
                const array = new Uint8Array(length);
                window.crypto.getRandomValues(array);
                return Array.from(array).map((v) => chars[v % chars.length]).join('');
            }
        } catch {}
        let out = '';
        for (let i = 0; i < length; i += 1) {
            out += chars[Math.floor(Math.random() * chars.length)];
        }
        return out;
    };

    const shouldFallbackToWeb = (error: unknown) => {
        const rec = (error && typeof error === 'object' ? (error as Record<string, unknown>) : {}) as Record<string, unknown>;
        const msg = String(rec.message ?? error ?? '').toLowerCase();
        const code = String(rec.code ?? '');
        return msg.includes('authorizationerror') || msg.includes('1000') || code === '1000';
    };

    const hashSha256 = async (value: string) => {
        try {
            if (typeof window === 'undefined' || !window.crypto?.subtle) return '';
            const data = new TextEncoder().encode(value);
            const digest = await window.crypto.subtle.digest('SHA-256', data);
            return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
        } catch {
            return '';
        }
    };

    const recoverCooldownLeft = useMemo(() => {
        if (!recoverCooldownUntil) return 0;
        const now = Date.now() + cooldownTick;
        return Math.max(0, Math.ceil((recoverCooldownUntil - now) / 1000));
    }, [recoverCooldownUntil, cooldownTick]);

    useEffect(() => {
        if (!recoverCooldownUntil) return;
        if (recoverCooldownLeft <= 0) return;
        const id = setInterval(() => setCooldownTick((t) => t + 1), 1000);
        return () => clearInterval(id);
    }, [recoverCooldownUntil, recoverCooldownLeft]);

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        setErrorMsg('');

        try {
            const href = getOAuthHref('google');
            window.location.assign(href);
        } catch (error: unknown) {
            logError('error', "Login Error:", error);
            setIsLoading(false);
            const msg = error instanceof Error ? error.message : 'Falha ao fazer login.';
            setErrorMsg(msg);
        }
    };

    const handleAppleLogin = async () => {
        setIsLoading(true);
        setErrorMsg('');

        try {
            const isIOSNative = isIosNative();
            if (isIOSNative) {
                if (!SignInWithApple) throw new Error('Login com Apple indisponível neste dispositivo.');
                const clientId = String(process.env.NEXT_PUBLIC_APPLE_IOS_CLIENT_ID || 'com.irontracks.app').trim();
                if (!clientId) throw new Error('Client ID da Apple não configurado.');
                const nonce = randomString(32);
                const state = randomString(16);
                const hashedNonce = await hashSha256(nonce);
                const result = await SignInWithApple.authorize({
                    clientId,
                    scopes: 'name email',
                    state,
                    nonce: hashedNonce || undefined,
                });

                const token = result?.response?.identityToken;
                if (!token) throw new Error('Falha ao obter token da Apple.');

                const email = String(result?.response?.email || '').trim();
                const givenName = String(result?.response?.givenName || '').trim();
                const familyName = String(result?.response?.familyName || '').trim();
                const fullName = String(`${givenName} ${familyName}`.trim());
                if (email) {
                    try {
                        await fetch('/api/auth/apple/preflight', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, full_name: fullName })
                        });
                    } catch {}
                }

                const supabase = createClient();
                const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce });
                if (error) throw error;
                const session = data?.session;
                if (session?.access_token && session?.refresh_token) {
                    await fetch('/api/auth/session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token })
                    });
                }

                router.replace('/dashboard');
                try { router.refresh(); } catch {}
                return;
            }

            const href = getOAuthHref('apple');
            window.location.assign(href);
        } catch (error: unknown) {
            logError('error', "Login Error:", error);
            setIsLoading(false);
            const msg = error instanceof Error ? error.message : 'Falha ao fazer login.';
            setErrorMsg(msg);
        }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (authMode === 'recover' && recoverCooldownLeft > 0) {
            setErrorMsg(`Aguarde ${recoverCooldownLeft}s para tentar novamente.`);
            return;
        }

        setIsLoading(true);
        setErrorMsg('');

        let holdLoading = false;

        try {
            const supabase = createClient();
            const email = emailData.email.trim();
            const password = emailData.password.trim();

            if (authMode === 'login') {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                
                // Salvar e-mail se rememberMe estiver ativo
                if (rememberMe) {
                    localStorage.setItem('it_remembered_email', email);
                } else {
                    localStorage.removeItem('it_remembered_email');
                }

                const session = data?.session;
                if (session?.access_token && session?.refresh_token) {
                    await fetch('/api/auth/session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token })
                    });
                }
                holdLoading = true;
                router.replace('/dashboard');
                try { router.refresh(); } catch {}
            } 
            else if (authMode === 'signup') {
                if (password !== emailData.confirmPassword) {
                    throw new Error('As senhas não coincidem.');
                }

                const isTeacher = emailData.isTeacher === true
                const cref = String(emailData.cref || '').trim()
                if (isTeacher && !cref) {
                    throw new Error('CREF é obrigatório para cadastro de professor.');
                }
                
                const cleanPhone = emailData.phone.replace(/\D/g, '');
                if (cleanPhone.length < 10) {
                    throw new Error('Telefone inválido (mínimo 10 dígitos com DDD).');
                }

                try {
                    const res = await fetch('/api/access-request/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            email, 
                            full_name: emailData.fullName,
                            phone: emailData.phone,
                            birth_date: emailData.birthDate,
                            role_requested: isTeacher ? 'teacher' : 'student',
                            cref: isTeacher ? cref : null
                        }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok || !json?.ok) {
                        throw new Error(json?.error || 'Não foi possível enviar sua solicitação.');
                    }
                } catch (e: unknown) {
                    const eMsg = e instanceof Error ? e.message : 'Não foi possível enviar sua solicitação.'
                    throw new Error(eMsg);
                }

                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: emailData.fullName,
                            display_name: emailData.fullName,
                            phone: emailData.phone,
                            birth_date: emailData.birthDate,
                            role_requested: isTeacher ? 'teacher' : 'student',
                            cref: isTeacher ? cref : null
                        }
                    }
                });
                if (error) throw error;

                // Salvar e-mail se rememberMe estiver ativo
                if (rememberMe) {
                    localStorage.setItem('it_remembered_email', email);
                }

                // Auto login usually happens, or check email confirmation
                holdLoading = true;
                router.replace('/wait-approval');
                try { router.refresh(); } catch {}
            }
            else if (authMode === 'recover') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + '/auth/recovery'
                });
                if (error) throw error;
                setRecoverCooldownUntil(Date.now() + 60 * 1000);
                alert('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
                setAuthMode('login');
            }
            else if (authMode === 'recover_code') {
                const p2 = String(recoveryPassword2 || '').trim();
                if (password.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.');
                if (password !== p2) throw new Error('As senhas não coincidem.');
                const code = String(recoveryCode || '').trim();
                if (!code) throw new Error('Digite o código de recuperação.');

                const res = await fetch('/api/auth/recovery-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, code, password }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || !json?.ok) {
                    throw new Error(json?.error || 'Código inválido.');
                }

                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                const session = data?.session;
                if (session?.access_token && session?.refresh_token) {
                    await fetch('/api/auth/session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token })
                    });
                }
                holdLoading = true;
                router.replace('/dashboard');
                try { router.refresh(); } catch {}
            }
        } catch (err: unknown) {
            logError('error', "Auth Error:", err);
            let msg = err instanceof Error ? err.message : 'Erro na autenticação';
            if (msg.includes('Invalid login')) msg = 'E-mail ou senha incorretos.';
            if (msg.includes('User already registered')) msg = 'E-mail já cadastrado. Tente entrar ou recuperar senha.';
            if (msg.toLowerCase().includes('email rate limit')) msg = 'Limite de e-mails excedido. Aguarde alguns minutos e tente novamente.';
            if (msg.toLowerCase().includes('error sending recovery email')) {
                msg = 'Falha ao enviar o e-mail de recuperação. Verifique o SMTP no Supabase (domínio verificado no Resend, sender no mesmo domínio e senha = API key re_...).';
            }
            setErrorMsg(msg);
        } finally {
            if (!holdLoading) setIsLoading(false);
        }
    };

    const handleRequestSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setReqLoading(true);
        setReqError('');

        // Client-side Validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        // Basic BR format validation
        // const phoneRegex = ... (removed unused regex var to avoid lint warning if desired, keeping logic)

        if (!emailRegex.test(formData.email)) {
            setReqError('Formato de e-mail inválido.');
            setReqLoading(false);
            return;
        }

        // Clean phone for validation check (remove non-digits)
        const cleanPhone = formData.phone.replace(/\D/g, '');
        if (cleanPhone.length < 10 || cleanPhone.length > 11) {
             setReqError('Telefone inválido (DDD + Número).');
             setReqLoading(false);
             return;
        }
        
        const payload = {
            ...formData,
            role_requested: formData.is_teacher ? 'teacher' : 'student',
            cref: formData.is_teacher ? formData.cref : null
        };

        try {
            const res = await fetch('/api/access-request/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const json = await res.json();
            
            if (!res.ok || !json.ok) {
                throw new Error(json.error || 'Erro ao enviar solicitação.');
            }
            
            setReqSuccess(true);
        } catch (err: unknown) {
            setReqError(err instanceof Error ? err.message : 'Erro de conexão.');
        } finally {
            setReqLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    return (
        <div className="relative flex flex-col items-center justify-center min-h-[100dvh] overflow-hidden bg-neutral-950 text-white p-6">
            {isLoading && <LoadingScreen />}
            {/* Spotlight Gradient Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] opacity-60" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjAwIDIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZmlsdGVyIGlkPSJub2lzZUZpbHRlciI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuNjUiIG51bU9jdGF2ZXM9IjMiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbm9pc2VGaWx0ZXIpIiBvcGFjaXR5PSIwLjUiLz48L3N2Zz4=')] opacity-20 brightness-100 contrast-150 mix-blend-overlay" />
            </div>

            {/* Glassmorphism Card */}
            <div className="relative z-10 w-full max-w-sm p-8 rounded-[2rem] border border-white/5 bg-neutral-900/40 backdrop-blur-xl shadow-2xl shadow-black/50 flex flex-col items-center transition-all duration-500">
                
                <div className="mb-8 p-6 bg-gradient-to-br from-yellow-500 to-amber-600 rounded-3xl shadow-[0_0_40px_-10px_rgba(245,158,11,0.5)] ring-1 ring-white/20 animate-pulse-slow">
                    <Dumbbell size={48} className="text-black drop-shadow-md" />
                </div>

                <h1 className="text-4xl font-black mb-2 tracking-tighter italic text-center drop-shadow-lg">
                    IRON<span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500">TRACKS</span>
                </h1>
                
                <p className="text-zinc-500 mb-8 text-center text-[10px] uppercase tracking-[0.3em] font-bold">
                    Sistema de Alta Performance • {appVersionLabel}
                </p>
                
                {authMode === 'menu' && (
                    <div className="w-full space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Google button removed */}
                        <button
                            type="button"
                            onClick={() => setAuthMode('login')}
                            className="w-full flex items-center justify-center gap-3 bg-neutral-800/50 border border-neutral-700 text-white px-6 py-4 rounded-xl font-bold text-sm uppercase tracking-wide hover:bg-neutral-800 hover:border-yellow-500/50 transition-all"
                        >
                            <Mail size={20} className="text-yellow-500" />
                            Entrar com E-mail
                        </button>
                    </div>
                )}

                {(authMode === 'login' || authMode === 'signup' || authMode === 'recover' || authMode === 'recover_code') && (
                    <form onSubmit={handleEmailAuth} className="w-full space-y-4 animate-in fade-in slide-in-from-right-8 duration-300">
                        <div className="flex items-center mb-2">
                            <button 
                                type="button" 
                                onClick={() => { setAuthMode('login'); setErrorMsg(''); }}
                                className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <span className="text-sm font-bold text-neutral-300 ml-2">
                                {authMode === 'login' && 'Acessar com E-mail'}
                                {authMode === 'signup' && 'Criar Nova Conta'}
                                {authMode === 'recover' && 'Recuperar Senha'}
                                {authMode === 'recover_code' && 'Recuperar com Código'}
                            </span>
                        </div>

                        {authMode === 'signup' && (
                            <div className="space-y-4">
                                <div className="relative">
                                    <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                                    <input
                                        required
                                        type="text"
                                        placeholder="Nome Completo"
                                        value={emailData.fullName}
                                        onChange={e => setEmailData({...emailData, fullName: e.target.value})}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-12 pr-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="relative">
                                        <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                                        <input
                                            required
                                            type="date"
                                            value={emailData.birthDate}
                                            onChange={e => setEmailData({...emailData, birthDate: e.target.value})}
                                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-12 pr-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors text-xs"
                                        />
                                    </div>
                                    <div className="relative">
                                        <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                                        <input
                                            required
                                            type="tel"
                                            placeholder="(DDD) 99999-9999"
                                            value={emailData.phone}
                                            onChange={e => {
                                                let val = e.target.value.replace(/\D/g, '');
                                                if (val.length > 11) val = val.slice(0, 11);
                                                if (val.length > 2) val = `(${val.slice(0, 2)}) ${val.slice(2)}`;
                                                if (val.length > 9) val = `${val.slice(0, 10)}-${val.slice(10)}`;
                                                setEmailData({...emailData, phone: val});
                                            }}
                                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-12 pr-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors text-xs"
                                        />
                                    </div>
                                </div>
                                <div className="pt-2">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className="relative flex items-center justify-center w-5 h-5">
                                            <input
                                                type="checkbox"
                                                checked={emailData.isTeacher}
                                                onChange={(e) => setEmailData(prev => ({ ...prev, isTeacher: e.target.checked }))}
                                                className="peer appearance-none w-5 h-5 bg-neutral-950 border border-neutral-800 rounded-md checked:bg-yellow-500 checked:border-yellow-500 transition-all cursor-pointer"
                                            />
                                            <CheckCircle2 size={12} className="absolute text-black opacity-0 peer-checked:opacity-100 pointer-events-none" />
                                        </div>
                                        <span className="text-xs font-bold text-neutral-400 group-hover:text-white transition-colors uppercase tracking-wide">
                                            Sou Personal Trainer / Professor
                                        </span>
                                    </label>

                                    {emailData.isTeacher && (
                                        <div className="mt-3 space-y-1 animate-in fade-in slide-in-from-top-2">
                                            <label className="text-xs font-bold text-yellow-500 uppercase">Número do CREF</label>
                                            <input
                                                required
                                                name="cref"
                                                value={emailData.cref}
                                                onChange={e => setEmailData({ ...emailData, cref: e.target.value })}
                                                className="w-full bg-neutral-950 border border-yellow-500/50 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors"
                                                placeholder="Ex: 000000-G/SP"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="space-y-1">
                            <div className="relative">
                                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                                <input
                                        required
                                        type="email"
                                        placeholder="seu@email.com"
                                        autoComplete="username"
                                        value={emailData.email}
                                        onChange={e => setEmailData({...emailData, email: e.target.value})}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-12 pr-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors"
                                    />
                                </div>
                            </div>

                            {authMode !== 'recover' && (
                                <div className="space-y-4">
                                    <div className="relative">
                                        <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                                        <input
                                            required
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Senha"
                                            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                                            value={emailData.password}
                                            onChange={e => setEmailData({...emailData, password: e.target.value})}
                                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-12 pr-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors"
                                        />
                                    </div>
                                    
                                    {authMode === 'signup' && (
                                        <div className="relative">
                                            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                                            <input
                                                required
                                                type={showPassword ? "text" : "password"}
                                                placeholder="Confirmar Senha"
                                                autoComplete="new-password"
                                                value={emailData.confirmPassword}
                                                onChange={e => setEmailData({...emailData, confirmPassword: e.target.value})}
                                                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-12 pr-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {authMode === 'login' && (
                                <div className="flex items-center px-1">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className="relative flex items-center justify-center w-5 h-5">
                                            <input
                                                type="checkbox"
                                                checked={rememberMe}
                                                onChange={(e) => setRememberMe(e.target.checked)}
                                                className="peer appearance-none w-5 h-5 bg-neutral-950 border border-neutral-800 rounded-md checked:bg-yellow-500 checked:border-yellow-500 transition-all cursor-pointer"
                                            />
                                            <div className="absolute opacity-0 peer-checked:opacity-100 pointer-events-none text-black">
                                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                </svg>
                                            </div>
                                        </div>
                                        <span className="text-[11px] font-bold text-neutral-500 group-hover:text-neutral-300 transition-colors uppercase tracking-wider">Lembrar meu e-mail</span>
                                    </label>
                                </div>
                            )}

                        {authMode === 'recover_code' && (
                            <>
                                <div className="space-y-1">
                                    <input
                                        required
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Confirmar senha"
                                        value={recoveryPassword2}
                                        onChange={e => setRecoveryPassword2(e.target.value)}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <input
                                        required
                                        type="text"
                                        placeholder="Código de recuperação (ex: ABCD-EF12-...)"
                                        value={recoveryCode}
                                        onChange={e => setRecoveryCode(e.target.value)}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors"
                                        autoComplete="one-time-code"
                                    />
                                </div>
                            </>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading || (authMode === 'recover' && recoverCooldownLeft > 0)}
                            className="w-full bg-gradient-to-r from-yellow-500 to-amber-600 text-black px-6 py-3.5 rounded-xl font-black text-lg shadow-lg hover:shadow-yellow-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? <Loader2 className="animate-spin mx-auto" /> : (
                                authMode === 'login' ? 'ENTRAR' : 
                                authMode === 'signup' ? 'CADASTRAR' : authMode === 'recover_code' ? 'REDEFINIR SENHA' : recoverCooldownLeft > 0 ? `AGUARDE ${recoverCooldownLeft}s` : 'ENVIAR LINK'
                            )}
                        </button>

                        {authMode === 'login' && (
                            <button
                                type="button"
                                onClick={handleAppleLogin}
                                disabled={isLoading}
                                className="w-full flex items-center justify-center gap-3 bg-white text-black px-6 py-4 rounded-xl font-black text-sm uppercase tracking-wide hover:bg-neutral-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                                    <path
                                        fill="currentColor"
                                        d="M16.365 1.43c0 1.14-.444 2.21-1.21 2.97-.84.84-2.07 1.49-3.27 1.39-.14-1.2.43-2.4 1.2-3.2.85-.88 2.3-1.53 3.28-1.16zM20.79 17.18c-.58 1.33-.85 1.92-1.6 3.1-1.04 1.62-2.5 3.65-4.31 3.67-1.61.02-2.03-1.05-4.22-1.03-2.19.01-2.65 1.05-4.26 1.02-1.81-.02-3.2-1.83-4.24-3.45-2.9-4.5-3.2-9.78-1.41-12.54 1.28-1.97 3.3-3.12 5.2-3.12 1.94 0 3.15 1.06 4.75 1.06 1.55 0 2.49-1.06 4.74-1.06 1.69 0 3.48.92 4.75 2.5-4.18 2.3-3.5 8.3.6 9.85z"
                                    />
                                </svg>
                                Entrar com Apple
                            </button>
                        )}

                        {authMode === 'login' && (
                            <>
                                <div className="flex justify-between items-center text-xs mt-4 px-1 relative z-20">
                                    <button 
                                        type="button" 
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAuthMode('recover'); setErrorMsg(''); }} 
                                        className="text-neutral-400 hover:text-yellow-500 transition-colors cursor-pointer p-2"
                                    >
                                        Esqueci a senha
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAuthMode('signup'); setErrorMsg(''); }} 
                                        className="text-white font-bold hover:underline cursor-pointer p-2"
                                    >
                                        Criar conta
                                    </button>
                                </div>

                                {/* Migration Notice */}
                                <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-3 text-center relative z-20">
                                    <p className="text-[11px] text-neutral-400 mb-2">
                                        Já usava com Google?
                                    </p>
                                    <button 
                                        type="button" 
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAuthMode('recover'); setErrorMsg(''); }}
                                        className="text-xs font-bold text-yellow-500 hover:text-yellow-400 underline decoration-yellow-500/30 underline-offset-2 cursor-pointer p-1"
                                    >
                                        Crie sua senha aqui para acessar
                                    </button>
                                </div>
                            </>
                        )}

                        {authMode === 'recover' && (
                            <div className="space-y-2">
                                <p className="text-[11px] text-neutral-500 text-center leading-relaxed px-2">
                                    Enviaremos um link para você definir sua senha e acessar sua conta existente.
                                </p>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setAuthMode('recover_code');
                                        setErrorMsg('');
                                    }}
                                    className="w-full text-[11px] font-bold text-yellow-500 hover:text-yellow-400 underline decoration-yellow-500/30 underline-offset-2"
                                >
                                    Tenho um código de recuperação
                                </button>
                            </div>
                        )}

                        {authMode === 'recover_code' && (
                            <div className="space-y-2">
                                <p className="text-[11px] text-neutral-500 text-center leading-relaxed px-2">
                                    Use um código de recuperação gerado nas configurações para redefinir sua senha sem e-mail.
                                </p>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setAuthMode('recover');
                                        setErrorMsg('');
                                    }}
                                    className="w-full text-[11px] font-bold text-neutral-300 hover:text-white underline decoration-white/20 underline-offset-2"
                                >
                                    Voltar para recuperação por e-mail
                                </button>
                            </div>
                        )}
                    </form>
                )}

                {errorMsg && (
                    <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl w-full text-center animate-shake">
                        <p className="text-red-400 text-xs font-bold tracking-wide break-words">{errorMsg}</p>
                    </div>
                )}

                {/* Request Access Button (only in menu) */}
                {authMode === 'menu' && (
                    <button
                        type="button"
                        onClick={() => setShowRequestModal(true)}
                        className="mt-6 text-xs text-neutral-400 font-bold uppercase tracking-widest hover:text-white transition-colors"
                    >
                        Não tem acesso? <span className="text-yellow-500 underline decoration-yellow-500/30 underline-offset-4 hover:decoration-yellow-500">Pedir agora</span>
                    </button>
                )}
            </div>
            
            <div className="absolute bottom-6 text-[10px] text-zinc-700 font-mono tracking-widest uppercase opacity-50">
                Exclusive Access Only
            </div>

            {/* Access Request Modal */}
            {showRequestModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">
                            <h3 className="text-lg font-black text-white italic">PEDIR ACESSO</h3>
                            <button onClick={() => setShowRequestModal(false)} className="text-neutral-500 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6">
                            {reqSuccess ? (
                                <div className="text-center py-8">
                                    <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                                        <CheckCircle2 size={32} />
                                    </div>
                                    <h4 className="text-xl font-bold text-white mb-2">Solicitação Enviada!</h4>
                                    <p className="text-neutral-400 text-sm mb-6">
                                        Recebemos seus dados. Se aprovado, você receberá um e-mail com as instruções de acesso.
                                    </p>
                                    <button
                                        onClick={() => { setShowRequestModal(false); setReqSuccess(false); setFormData((prev) => ({ ...prev, full_name:'', email:'', phone:'', birth_date:'' })); }}
                                        className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold transition-colors"
                                    >
                                        Fechar
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleRequestSubmit} className="space-y-4">
                                    {reqError && (
                                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                                            <AlertCircle size={16} className="text-red-400 shrink-0" />
                                            <p className="text-red-300 text-xs font-bold">{reqError}</p>
                                        </div>
                                    )}

                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-neutral-400 uppercase">Nome Completo</label>
                                        <input
                                            required
                                            name="full_name"
                                            value={formData.full_name}
                                            onChange={handleInputChange}
                                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors"
                                            placeholder="Ex: João Silva"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-neutral-400 uppercase">E-mail</label>
                                        <input
                                            required
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors"
                                            placeholder="seu@email.com"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-neutral-400 uppercase">Telefone</label>
                                            <input
                                                required
                                                name="phone"
                                                value={formData.phone}
                                                onChange={handleInputChange}
                                                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors"
                                                placeholder="(11) 99999-9999"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-neutral-400 uppercase">Nascimento</label>
                                            <input
                                                required
                                                type="date"
                                                name="birth_date"
                                                value={formData.birth_date}
                                                onChange={handleInputChange}
                                                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors"
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-2">
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <div className="relative flex items-center justify-center w-5 h-5">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.is_teacher}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, is_teacher: e.target.checked }))}
                                                    className="peer appearance-none w-5 h-5 bg-neutral-950 border border-neutral-800 rounded-md checked:bg-yellow-500 checked:border-yellow-500 transition-all cursor-pointer"
                                                />
                                                <CheckCircle2 size={12} className="absolute text-black opacity-0 peer-checked:opacity-100 pointer-events-none" />
                                            </div>
                                            <span className="text-xs font-bold text-neutral-400 group-hover:text-white transition-colors uppercase tracking-wide">
                                                Sou Personal Trainer / Professor
                                            </span>
                                        </label>

                                        {formData.is_teacher && (
                                            <div className="mt-3 space-y-1 animate-in fade-in slide-in-from-top-2">
                                                <label className="text-xs font-bold text-yellow-500 uppercase">Número do CREF</label>
                                                <input
                                                    required
                                                    name="cref"
                                                    value={formData.cref}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-neutral-950 border border-yellow-500/50 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors"
                                                    placeholder="Ex: 000000-G/SP"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={reqLoading}
                                        className="w-full mt-2 bg-yellow-500 hover:bg-yellow-400 text-black py-4 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                    >
                                        {reqLoading ? <Loader2 className="animate-spin" size={18} /> : 'ENVIAR SOLICITAÇÃO'}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LoginScreen;
