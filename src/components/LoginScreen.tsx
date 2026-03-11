'use client'

import React from 'react';
import Image from 'next/image';
import { Dumbbell, X, CheckCircle2, AlertCircle, Loader2, Mail, ArrowLeft, Lock, User, Phone, Calendar, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import LoadingScreen from '@/components/LoadingScreen';
import { useNativeAppSetup } from '@/hooks/useNativeAppSetup'
import { useLoginScreen } from '@/hooks/useLoginScreen'


const LoginScreen = () => {
    useNativeAppSetup(null)
    const appVersionLabel = 'v1.0';

    const {
        isLoading,
        errorMsg, setErrorMsg,
        authMode, setAuthMode,
        showNoAccountModal, setShowNoAccountModal,
        showPassword, setShowPassword,
        rememberMe, setRememberMe,
        validationErrors, validateField, clearValidation,
        emailData, setEmailData,
        recoveryCode, setRecoveryCode,
        recoveryPassword2, setRecoveryPassword2,
        recoverCooldownLeft,
        showRequestModal, setShowRequestModal,
        reqLoading, reqSuccess, setReqSuccess,
        reqError, formData, setFormData,
        handleGoogleLogin,
        handleAppleLogin,
        handleEmailAuth,
        handleRequestSubmit,
        handleInputChange,
    } = useLoginScreen()

    if (isLoading) {
        return <LoadingScreen />
    }

    return (
        <div className="relative flex flex-col items-center justify-center h-[100dvh] overflow-hidden bg-neutral-950 text-white p-4">
            {/* Subtle ambient glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-amber-500/8 rounded-full blur-[100px]" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjAwIDIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZmlsdGVyIGlkPSJub2lzZUZpbHRlciI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuNjUiIG51bU9jdGF2ZXM9IjMiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbm9pc2VGaWx0ZXIpIiBvcGFjaXR5PSIwLjUiLz48L3N2Zz4=')] opacity-15 mix-blend-overlay" />
            </div>

            {/* Card with integrated hero */}
            <div className="relative z-10 w-full max-w-sm rounded-[2rem] border border-white/5 bg-neutral-900/60 backdrop-blur-xl shadow-2xl shadow-black/50 flex flex-col items-center transition-all duration-500 overflow-hidden">

                {/* Hero image section — visible on all devices */}
                <div className="relative w-full h-48 sm:h-56 overflow-hidden">
                    <img
                        src="/login-hero.png"
                        alt=""
                        className="w-full h-full object-cover object-top"
                        draggable={false}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/40 via-transparent to-transparent" />
                </div>

                <div className="px-8 pb-8 pt-4 w-full flex flex-col items-center">

                <h1 className="text-3xl font-black mb-1 tracking-tighter italic text-center drop-shadow-lg pr-2">
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
                                aria-label="Voltar"
                                onClick={() => { setAuthMode('login'); setErrorMsg(''); clearValidation(); }}
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
                                        aria-label="Nome completo"
                                        aria-required="true"
                                        aria-invalid={!!validationErrors.fullName}
                                        aria-describedby={validationErrors.fullName ? 'error-fullName' : undefined}
                                        value={emailData.fullName}
                                        onChange={e => setEmailData({ ...emailData, fullName: e.target.value })}
                                        onBlur={e => validateField('fullName', e.target.value)}
                                        className={`w-full bg-neutral-950 border rounded-xl pl-12 pr-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors ${validationErrors.fullName ? 'border-red-500/60' : 'border-neutral-800'}`}
                                    />
                                    {validationErrors.fullName && <p id="error-fullName" className="mt-1 text-xs text-red-400">{validationErrors.fullName}</p>}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="relative">
                                        <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                                        <input
                                            required
                                            type="date"
                                            aria-label="Data de nascimento"
                                            aria-required="true"
                                            value={emailData.birthDate}
                                            onChange={e => setEmailData({ ...emailData, birthDate: e.target.value })}
                                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-12 pr-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors text-xs"
                                        />
                                    </div>
                                    <div className="relative">
                                        <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                                        <input
                                            required
                                            type="tel"
                                            placeholder="(DDD) 99999-9999"
                                            aria-label="Telefone com DDD"
                                            aria-required="true"
                                            aria-invalid={!!validationErrors.phone}
                                            aria-describedby={validationErrors.phone ? 'error-phone' : undefined}
                                            value={emailData.phone}
                                            onChange={e => {
                                                let val = e.target.value.replace(/\D/g, '');
                                                if (val.length > 11) val = val.slice(0, 11);
                                                if (val.length > 2) val = `(${val.slice(0, 2)}) ${val.slice(2)}`;
                                                if (val.length > 9) val = `${val.slice(0, 10)}-${val.slice(10)}`;
                                                setEmailData({ ...emailData, phone: val });
                                            }}
                                            onBlur={e => validateField('phone', e.target.value)}
                                            className={`w-full bg-neutral-950 border rounded-xl pl-12 pr-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors text-xs ${validationErrors.phone ? 'border-red-500/60' : 'border-neutral-800'}`}
                                        />
                                        {validationErrors.phone && <p id="error-phone" className="mt-1 text-xs text-red-400">{validationErrors.phone}</p>}
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
                                                aria-label="Número do CREF"
                                                aria-required="true"
                                                aria-invalid={!!validationErrors.cref}
                                                aria-describedby={validationErrors.cref ? 'error-cref' : undefined}
                                                value={emailData.cref}
                                                onChange={e => setEmailData({ ...emailData, cref: e.target.value })}
                                                onBlur={e => validateField('cref', e.target.value)}
                                                className={`w-full bg-neutral-950 border rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors ${validationErrors.cref ? 'border-red-500/60' : 'border-yellow-500/50'}`}
                                                placeholder="Ex: 000000-G/SP"
                                            />
                                            {validationErrors.cref && <p id="error-cref" className="mt-1 text-xs text-red-400">{validationErrors.cref}</p>}
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
                                    aria-label="E-mail"
                                    aria-required="true"
                                    aria-invalid={!!validationErrors.email}
                                    aria-describedby={validationErrors.email ? 'error-email' : undefined}
                                    autoComplete="username"
                                    value={emailData.email}
                                    onChange={e => setEmailData({ ...emailData, email: e.target.value })}
                                    onBlur={e => validateField('email', e.target.value)}
                                    className={`w-full bg-neutral-950 border rounded-xl pl-12 pr-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors ${validationErrors.email ? 'border-red-500/60' : 'border-neutral-800'}`}
                                />
                            </div>
                            {validationErrors.email && <p id="error-email" className="mt-1 text-xs text-red-400">{validationErrors.email}</p>}
                        </div>

                        {authMode !== 'recover' && (
                            <div className="space-y-4">
                                <div>
                                    <div className="relative">
                                        <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                                        <input
                                            required
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Senha"
                                            aria-label="Senha"
                                            aria-required="true"
                                            aria-invalid={!!validationErrors.password}
                                            aria-describedby={validationErrors.password ? 'error-password' : undefined}
                                            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                                            value={emailData.password}
                                            onChange={e => setEmailData({ ...emailData, password: e.target.value })}
                                            onBlur={e => authMode !== 'login' && validateField('password', e.target.value)}
                                            className={`w-full bg-neutral-950 border rounded-xl pl-12 pr-12 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors ${validationErrors.password ? 'border-red-500/60' : 'border-neutral-800'}`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-yellow-400 transition-colors p-1"
                                            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                        >
                                            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                        </button>
                                    </div>
                                    {validationErrors.password && <p id="error-password" className="mt-1 text-xs text-red-400">{validationErrors.password}</p>}
                                </div>

                                {authMode === 'signup' && (
                                    <div>
                                        <div className="relative">
                                            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                                            <input
                                                required
                                                type={showPassword ? "text" : "password"}
                                                placeholder="Confirmar Senha"
                                                aria-label="Confirmar senha"
                                                aria-required="true"
                                                aria-invalid={!!validationErrors.confirmPassword}
                                                aria-describedby={validationErrors.confirmPassword ? 'error-confirmPassword' : undefined}
                                                autoComplete="new-password"
                                                value={emailData.confirmPassword}
                                                onChange={e => setEmailData({ ...emailData, confirmPassword: e.target.value })}
                                                onBlur={e => validateField('confirmPassword', e.target.value)}
                                                className={`w-full bg-neutral-950 border rounded-xl pl-12 pr-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors ${validationErrors.confirmPassword ? 'border-red-500/60' : 'border-neutral-800'}`}
                                            />
                                        </div>
                                        {validationErrors.confirmPassword && <p id="error-confirmPassword" className="mt-1 text-xs text-red-400">{validationErrors.confirmPassword}</p>}
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
                                        aria-label="Confirmar nova senha"
                                        aria-required="true"
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
                                        aria-label="Código de recuperação"
                                        aria-required="true"
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
                            aria-label={
                                authMode === 'login' ? 'Entrar na conta' :
                                    authMode === 'signup' ? 'Criar conta' :
                                        authMode === 'recover_code' ? 'Redefinir senha' : 'Enviar link de recuperação'
                            }
                            aria-busy={isLoading}
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
            </div>

            <div className="absolute bottom-6 text-[10px] text-zinc-700 font-mono tracking-widest uppercase opacity-50">
                Exclusive Access Only
            </div>

            {/* Access Request Modal */}
            {showRequestModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-safe pb-safe bg-black/80 backdrop-blur-sm">
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
                                        onClick={() => { setShowRequestModal(false); setReqSuccess(false); setFormData((prev) => ({ ...prev, full_name: '', email: '', phone: '', birth_date: '' })); }}
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

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            {/* Modal: Sem Cadastro (Apple Sign-In sem conta) */}
            {showNoAccountModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 pt-safe pb-safe">
                    <div className="w-full max-w-sm bg-neutral-900 border border-neutral-700/50 rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                        {/* Icon */}
                        <div className="flex justify-center mb-5">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/30 flex items-center justify-center">
                                <ShieldAlert size={32} className="text-red-400" />
                            </div>
                        </div>

                        {/* Title */}
                        <h3 className="text-white font-black text-lg text-center mb-2">
                            Conta não encontrada
                        </h3>

                        {/* Description */}
                        <p className="text-neutral-400 text-sm text-center leading-relaxed mb-6">
                            Não encontramos um cadastro vinculado a esta conta Apple.
                            Para acessar o IronTracks, é necessário que seu <span className="text-white font-semibold">professor/personal</span> cadastre você no sistema primeiro.
                        </p>

                        {/* Steps */}
                        <div className="bg-neutral-800/50 rounded-2xl p-4 mb-6 space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="flex-none w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center text-yellow-500 text-xs font-black">1</div>
                                <p className="text-sm text-neutral-300">Peça ao seu professor para cadastrar você no app</p>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="flex-none w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center text-yellow-500 text-xs font-black">2</div>
                                <p className="text-sm text-neutral-300">Após o cadastro, volte e entre com a mesma conta Apple</p>
                            </div>
                        </div>

                        {/* Button */}
                        <button
                            onClick={() => setShowNoAccountModal(false)}
                            className="w-full min-h-[48px] bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 hover:from-yellow-400 hover:via-amber-300 hover:to-yellow-400 text-black font-black text-sm uppercase tracking-wider rounded-xl transition-all active:scale-[0.97]"
                        >
                            ENTENDI
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LoginScreen;
