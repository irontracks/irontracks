'use client'

import React, { useState } from 'react';
import Image from 'next/image';
import { Dumbbell, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';

const LoginScreen = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    
    // Request Access State
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [reqLoading, setReqLoading] = useState(false);
    const [reqSuccess, setReqSuccess] = useState(false);
    const [reqError, setReqError] = useState('');
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',
        birth_date: ''
    });

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
        console.log('Iniciando login...');
        setIsLoading(true);
        setErrorMsg('');
        
        try {
            const href = getLoginHref();
            console.log('Navegando para:', href);
            window.location.assign(href);
        } catch (error) {
            console.error("Login Error:", error);
            setIsLoading(false);
            const msg = (error && error.message) ? error.message : 'Falha ao fazer login.';
            setErrorMsg(msg);
        }
    };

    const handleRequestSubmit = async (e) => {
        e.preventDefault();
        setReqLoading(true);
        setReqError('');

        // Client-side Validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^(\(?\d{2}\)?\s?)?(\d{4,5}[-\s]?\d{4})$/; // Basic BR format validation

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
        
        try {
            const res = await fetch('/api/access-request/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const json = await res.json();
            
            if (!res.ok || !json.ok) {
                throw new Error(json.error || 'Erro ao enviar solicitação.');
            }
            
            setReqSuccess(true);
        } catch (err) {
            setReqError(err.message || 'Erro de conexão.');
        } finally {
            setReqLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    return (
        <div className="relative flex flex-col items-center justify-center min-h-[100dvh] overflow-hidden bg-neutral-950 text-white p-6">
            {/* Spotlight Gradient Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] opacity-60" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjAwIDIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZmlsdGVyIGlkPSJub2lzZUZpbHRlciI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuNjUiIG51bU9jdGF2ZXM9IjMiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbm9pc2VGaWx0ZXIpIiBvcGFjaXR5PSIwLjUiLz48L3N2Zz4=')] opacity-20 brightness-100 contrast-150 mix-blend-overlay" />
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

                {/* Request Access Button */}
                <button
                    type="button"
                    onClick={() => setShowRequestModal(true)}
                    className="mt-6 text-xs text-neutral-400 font-bold uppercase tracking-widest hover:text-white transition-colors"
                >
                    Não tem acesso? <span className="text-yellow-500 underline decoration-yellow-500/30 underline-offset-4 hover:decoration-yellow-500">Pedir agora</span>
                </button>
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
                                        onClick={() => { setShowRequestModal(false); setReqSuccess(false); setFormData({full_name:'', email:'', phone:'', birth_date:''}); }}
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
