'use client'
import { useState, useCallback, useMemo, useEffect } from 'react'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { isIosNative } from '@/utils/platform'
import { logError } from '@/lib/logger'

// ─── Capacitor optional imports ───────────────────────────────────────────────
let Capacitor: { getPlatform: () => string } = { getPlatform: () => 'web' }
type AppleAuthorizeOptions = { clientId: string; scopes: string; state?: string; nonce?: string }
type AppleAuthorizeResponse = { response: { identityToken?: string; email?: string; givenName?: string; familyName?: string } }
let SignInWithApple: { authorize: (opts: AppleAuthorizeOptions) => Promise<AppleAuthorizeResponse> } | null = null
if (typeof window !== 'undefined') {
    try {
        const cap = require('@capacitor/core')
        if (cap?.Capacitor) Capacitor = cap.Capacitor
        const appleSignIn = require('@capacitor-community/apple-sign-in')
        if (appleSignIn?.SignInWithApple) SignInWithApple = appleSignIn.SignInWithApple
    } catch { }
}

// ─── Private helpers ──────────────────────────────────────────────────────────
const randomString = (length: number) => {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    try {
        if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function') {
            const array = new Uint8Array(length)
            window.crypto.getRandomValues(array)
            return Array.from(array).map((v) => chars[v % chars.length]).join('')
        }
    } catch { }
    let out = ''
    for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)]
    return out
}

const hashSha256 = async (value: string) => {
    try {
        if (typeof window === 'undefined' || !window.crypto?.subtle) return ''
        const data = new TextEncoder().encode(value)
        const digest = await window.crypto.subtle.digest('SHA-256', data)
        return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
    } catch { return '' }
}

const friendlyAuthError = (raw: string): string => {
    const m = raw.toLowerCase()
    if (m.includes('authorizationerror') || m.includes('1000') || m.includes('authorization')) return 'Não foi possível continuar com a Apple. Tente novamente ou use e-mail e senha.'
    if (m.includes('invalid login') || m.includes('invalid credentials')) return 'E-mail ou senha incorretos.'
    if (m.includes('user already registered') || m.includes('already registered')) return 'Este e-mail já possui uma conta. Tente entrar ou recuperar a senha.'
    if (m.includes('email rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
    if (m.includes('error sending recovery') || m.includes('smtp')) return 'Não foi possível enviar o e-mail. Tente novamente em instantes.'
    if (m.includes('network') || m.includes('fetch') || m.includes('conexão')) return 'Sem conexão com a internet. Verifique sua rede e tente novamente.'
    if (m.includes('token') || m.includes('session')) return 'Sua sessão expirou. Faça login novamente.'
    if (m.includes('user not found') || m.includes('no account')) return 'Não encontramos uma conta com este e-mail.'
    if (m.includes('weak password') || m.includes('password')) return 'A senha precisa ter pelo menos 6 caracteres.'
    if (m.includes('timeout') || m.includes('timed out')) return 'A conexão demorou muito. Tente novamente.'
    return raw.length > 120 ? 'Ocorreu um erro inesperado. Por favor, tente novamente.' : raw
}

const shouldFallbackToWeb = (error: unknown) => {
    const rec = (error && typeof error === 'object' ? (error as Record<string, unknown>) : {}) as Record<string, unknown>
    const msg = String(rec.message ?? error ?? '').toLowerCase()
    const code = String(rec.code ?? '')
    return msg.includes('authorizationerror') || msg.includes('1000') || code === '1000'
}

const getOAuthHref = (provider: string) => {
    const safeProvider = String(provider || '').trim().toLowerCase() === 'apple' ? 'apple' : 'google'
    try {
        const url = new URL(window.location.href)
        const fromQuery = String(url.searchParams.get('next') || '').trim()
        const nextPath = fromQuery && fromQuery.startsWith('/') ? fromQuery : '/dashboard'
        return `/auth/login?provider=${encodeURIComponent(safeProvider)}&next=${encodeURIComponent(nextPath)}`
    } catch {
        return `/auth/login?provider=${encodeURIComponent(safeProvider)}&next=${encodeURIComponent('/dashboard')}`
    }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLoginScreen() {
    const router = useRouter()

    const [isLoading, setIsLoading] = useState(() => {
        if (typeof window === 'undefined') return false
        try {
            if (localStorage.getItem('it.logged_in') === '1') return true
            const raw = localStorage.getItem('it.session.backup')
            if (raw) {
                const backup = JSON.parse(raw) as Record<string, unknown>
                if (backup?.access_token && backup?.refresh_token) return true
            }
        } catch { }
        return false
    })

    const [errorMsg, setErrorMsg] = useState('')
    const [recoverCooldownUntil, setRecoverCooldownUntil] = useState(0)
    const [cooldownTick, setCooldownTick] = useState(0)
    const [recoveryCode, setRecoveryCode] = useState('')
    const [recoveryPassword2, setRecoveryPassword2] = useState('')
    const [authMode, setAuthMode] = useState('login')
    const [showNoAccountModal, setShowNoAccountModal] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [rememberMe, setRememberMe] = useState(true)
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

    const [emailData, setEmailData] = useState({
        email: '', password: '', confirmPassword: '', fullName: '', phone: '', birthDate: '', isTeacher: false, cref: ''
    })

    const [showRequestModal, setShowRequestModal] = useState(false)
    const [reqLoading, setReqLoading] = useState(false)
    const [reqSuccess, setReqSuccess] = useState(false)
    const [reqError, setReqError] = useState('')
    const [formData, setFormData] = useState({ full_name: '', email: '', phone: '', birth_date: '', is_teacher: false, cref: '' })

    const fieldSchemas = useMemo(() => ({
        email: z.string().min(1, 'E-mail obrigatório').email('E-mail inválido'),
        password: z.string().min(6, 'Mínimo 6 caracteres'),
        confirmPassword: z.string(),
        fullName: z.string().min(2, 'Mínimo 2 caracteres'),
        phone: z.string().refine(v => v.replace(/\D/g, '').length >= 10, 'Mínimo 10 dígitos com DDD'),
        cref: z.string().min(3, 'CREF inválido'),
    }), [])

    const validateField = useCallback((field: string, value: string): string => {
        const schema = fieldSchemas[field as keyof typeof fieldSchemas]
        if (!schema) return ''
        let error = ''
        if (field === 'confirmPassword') {
            error = value !== emailData.password ? 'As senhas não coincidem' : ''
        } else {
            const result = schema.safeParse(value)
            error = result.success ? '' : (result.error.issues[0]?.message ?? '')
        }
        setValidationErrors(prev => ({ ...prev, [field]: error }))
        return error
    }, [fieldSchemas, emailData.password])

    const clearValidation = useCallback(() => setValidationErrors({}), [])

    const recoverCooldownLeft = useMemo(() => {
        if (!recoverCooldownUntil) return 0
        const now = Date.now() + cooldownTick
        return Math.max(0, Math.ceil((recoverCooldownUntil - now) / 1000))
    }, [recoverCooldownUntil, cooldownTick])

    // Session restore on mount
    useEffect(() => {
        if (typeof window === 'undefined') return
        const savedEmail = localStorage.getItem('it_remembered_email')
        if (savedEmail) { setEmailData(prev => ({ ...prev, email: savedEmail })); setRememberMe(true) }
        if (localStorage.getItem('it.logged_in') === '1') { setIsLoading(true); window.location.replace('/dashboard'); return }
        try {
            const backupRaw = localStorage.getItem('it.session.backup')
            if (backupRaw) {
                const backup = JSON.parse(backupRaw)
                if (backup?.access_token && backup?.refresh_token) {
                    setIsLoading(true)
                    const supabase = createClient()
                    supabase.auth.setSession({ access_token: backup.access_token, refresh_token: backup.refresh_token }).then(({ error, data }) => {
                        if (!error && data?.session) {
                            fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }) })
                                .then(() => { try { localStorage.setItem('it.logged_in', '1') } catch { }; window.location.replace('/dashboard') })
                                .catch(() => setIsLoading(false))
                        } else { setIsLoading(false) }
                    }).catch(() => setIsLoading(false))
                }
            }
        } catch { }
    }, [])

    // Cooldown ticker
    useEffect(() => {
        if (!recoverCooldownUntil) return
        if (recoverCooldownLeft <= 0) return
        const id = setInterval(() => setCooldownTick((t) => t + 1), 1000)
        return () => clearInterval(id)
    }, [recoverCooldownUntil, recoverCooldownLeft])

    const handleGoogleLogin = useCallback(async () => {
        setIsLoading(true); setErrorMsg('')
        try { window.location.assign(getOAuthHref('google')) }
        catch (error: unknown) { logError('error', 'Login Error:', error); setIsLoading(false); setErrorMsg(error instanceof Error ? error.message : 'Falha ao fazer login.') }
    }, [])

    const handleAppleLogin = useCallback(async () => {
        setIsLoading(true); setErrorMsg('')
        try {
            const isIOSNative = isIosNative()
            if (isIOSNative) {
                if (!SignInWithApple) throw new Error('Login com Apple indisponível neste dispositivo.')
                const clientId = String(process.env.NEXT_PUBLIC_APPLE_IOS_CLIENT_ID || 'com.irontracks.app').trim()
                if (!clientId) throw new Error('Client ID da Apple não configurado.')
                const state = randomString(16)
                // For native iOS, we do NOT use a nonce. The ASAuthorizationAppleIDRequest flow
                // delivers the token directly via the OS — no web redirect replay risk.
                // Passing a nonce causes a persistent "Nonces mismatch" because the Apple JWT
                // nonce claim verification depends on exact matching between client sessions.
                const result = await SignInWithApple.authorize({ clientId, scopes: 'name email', state })
                const token = result?.response?.identityToken
                if (!token) throw new Error('Falha ao obter token da Apple.')
                const email = String(result?.response?.email || '').trim()
                const givenName = String(result?.response?.givenName || '').trim()
                const familyName = String(result?.response?.familyName || '').trim()
                const fullName = `${givenName} ${familyName}`.trim()
                if (email) {
                    try { await fetch('/api/auth/apple/preflight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, full_name: fullName }) }) } catch { }
                }
                const supabase = createClient()
                // No nonce: Supabase skips nonce verification, validates purely by Apple JWT signature
                const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token })
                if (error) throw error
                const userId = data?.user?.id
                const userEmail = data?.user?.email?.trim().toLowerCase() || ''
                if (userId) {
                    const { data: profile } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle()
                    if (!profile?.id) {
                        const checkRes = await fetch('/api/auth/apple/preflight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: userEmail, full_name: '', check_only: true }) }).then(r => r.json()).catch(() => ({ ok: false }))
                        if (!checkRes?.existed) { await supabase.auth.signOut(); setShowNoAccountModal(true); setIsLoading(false); return }
                    }
                }
                const session = data?.session
                if (session?.access_token && session?.refresh_token) {
                    await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }) })
                }
                try { localStorage.setItem('it.logged_in', '1') } catch { }
                router.replace('/dashboard'); try { router.refresh() } catch { }
                return
            }
            window.location.assign(getOAuthHref('apple'))
        } catch (error: unknown) {
            logError('error', 'Login Error:', error); setIsLoading(false)
            setErrorMsg(friendlyAuthError(error instanceof Error ? error.message : 'Falha ao fazer login.'))
        }
    }, [router])

    const handleEmailAuth = useCallback(async (e: React.FormEvent) => {
        e.preventDefault()
        if (authMode === 'recover' && recoverCooldownLeft > 0) { setErrorMsg(`Aguarde ${recoverCooldownLeft}s para tentar novamente.`); return }
        setIsLoading(true); setErrorMsg('')
        let holdLoading = false
        try {
            const supabase = createClient()
            const email = emailData.email.trim()
            const password = emailData.password.trim()
            if (authMode === 'login') {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password })
                if (error) throw error
                if (rememberMe) localStorage.setItem('it_remembered_email', email); else localStorage.removeItem('it_remembered_email')
                const session = data?.session
                if (session?.access_token && session?.refresh_token) await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }) })
                holdLoading = true; try { localStorage.setItem('it.logged_in', '1') } catch { }
                router.replace('/dashboard'); try { router.refresh() } catch { }
            } else if (authMode === 'signup') {
                if (password !== emailData.confirmPassword) throw new Error('As senhas não coincidem.')
                const isTeacher = emailData.isTeacher === true
                const cref = String(emailData.cref || '').trim()
                if (isTeacher && !cref) throw new Error('CREF é obrigatório para cadastro de professor.')
                const cleanPhone = emailData.phone.replace(/\D/g, '')
                if (cleanPhone.length < 10) throw new Error('Telefone inválido (mínimo 10 dígitos com DDD).')
                try {
                    const res = await fetch('/api/access-request/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, full_name: emailData.fullName, phone: emailData.phone, birth_date: emailData.birthDate, role_requested: isTeacher ? 'teacher' : 'student', cref: isTeacher ? cref : null }) })
                    const json = await res.json().catch(() => ({}))
                    if (!res.ok || !json?.ok) throw new Error(json?.error || 'Não foi possível enviar sua solicitação.')
                } catch (e: unknown) { throw new Error(e instanceof Error ? e.message : 'Não foi possível enviar sua solicitação.') }
                const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: emailData.fullName, display_name: emailData.fullName, phone: emailData.phone, birth_date: emailData.birthDate, role_requested: isTeacher ? 'teacher' : 'student', cref: isTeacher ? cref : null } } })
                if (error) throw error
                if (rememberMe) localStorage.setItem('it_remembered_email', email)
                holdLoading = true; router.replace('/wait-approval'); try { router.refresh() } catch { }
            } else if (authMode === 'recover') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/auth/recovery' })
                if (error) throw error
                setRecoverCooldownUntil(Date.now() + 60 * 1000)
                alert('E-mail de recuperação enviado! Verifique sua caixa de entrada.')
                setAuthMode('login')
            } else if (authMode === 'recover_code') {
                const p2 = String(recoveryPassword2 || '').trim()
                if (password.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.')
                if (password !== p2) throw new Error('As senhas não coincidem.')
                const code = String(recoveryCode || '').trim()
                if (!code) throw new Error('Digite o código de recuperação.')
                const res = await fetch('/api/auth/recovery-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, password }) })
                const json = await res.json().catch(() => ({}))
                if (!res.ok || !json?.ok) throw new Error(json?.error || 'Código inválido.')
                const { data, error } = await supabase.auth.signInWithPassword({ email, password })
                if (error) throw error
                const session = data?.session
                if (session?.access_token && session?.refresh_token) await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }) })
                holdLoading = true; try { localStorage.setItem('it.logged_in', '1') } catch { }
                router.replace('/dashboard'); try { router.refresh() } catch { }
            }
        } catch (err: unknown) {
            logError('error', 'Auth Error:', err)
            setErrorMsg(friendlyAuthError(err instanceof Error ? err.message : 'Erro na autenticação'))
        } finally {
            if (!holdLoading) setIsLoading(false)
        }
    }, [authMode, emailData, rememberMe, recoverCooldownLeft, recoveryCode, recoveryPassword2, router])

    const handleRequestSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault(); setReqLoading(true); setReqError('')
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(formData.email)) { setReqError('Formato de e-mail inválido.'); setReqLoading(false); return }
        const cleanPhone = formData.phone.replace(/\D/g, '')
        if (cleanPhone.length < 10 || cleanPhone.length > 11) { setReqError('Telefone inválido (DDD + Número).'); setReqLoading(false); return }
        const payload = { ...formData, role_requested: formData.is_teacher ? 'teacher' : 'student', cref: formData.is_teacher ? formData.cref : null }
        try {
            const res = await fetch('/api/access-request/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            const json = await res.json()
            if (!res.ok || !json.ok) throw new Error(json.error || 'Erro ao enviar solicitação.')
            setReqSuccess(true)
        } catch (err: unknown) { setReqError(err instanceof Error ? err.message : 'Erro de conexão.') }
        finally { setReqLoading(false) }
    }, [formData])

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value }))
    }, [])

    return {
        isLoading, setIsLoading,
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
    }
}
