'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { AlertTriangle, Eye, EyeOff, Loader2, Lock } from 'lucide-react'

export default function AuthRecoveryClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const startedRef = useRef(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const nextPath = useMemo(() => {
    const rawNext = String(searchParams.get('next') || '').trim()
    return rawNext.startsWith('/') ? rawNext : '/dashboard'
  }, [searchParams])

  const code = useMemo(() => {
    const raw = searchParams.get('code') || searchParams.get('token') || ''
    return String(raw).trim()
  }, [searchParams])

  const tokenHash = useMemo(() => {
    const raw = searchParams.get('token_hash') || ''
    return String(raw).trim()
  }, [searchParams])

  const type = useMemo(() => {
    return String(searchParams.get('type') || '').trim().toLowerCase()
  }, [searchParams])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const run = async () => {
      try {
        const supabase = createClient()
        const hash = typeof window !== 'undefined' ? String(window.location.hash || '') : ''
        const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
        const hashType = String(hashParams.get('type') || '').trim().toLowerCase()
        const hashErrorCode = String(hashParams.get('error_code') || '').trim().toLowerCase()
        const hashErrorDescription = String(
          hashParams.get('error_description') || hashParams.get('error') || '',
        ).trim()
        const resolvedType = type || hashType

        if (hashErrorCode || hashErrorDescription) {
          if (hashErrorCode === 'otp_expired' || hashErrorDescription.toLowerCase().includes('expired')) {
            setError(
              'Esse link expirou (ou você clicou em um e-mail antigo). Volte ao login e solicite um novo link de recuperação. Use sempre o último e-mail recebido.',
            )
            return
          }
          setError(hashErrorDescription || 'Não foi possível validar seu login.')
          return
        }

        const accessToken = String(hashParams.get('access_token') || '').trim()
        const refreshToken = String(hashParams.get('refresh_token') || '').trim()

        if (tokenHash) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            type: 'recovery',
            token_hash: tokenHash,
          })
          if (verifyError) {
            setError(verifyError.message || 'Não foi possível validar seu login.')
            return
          }
        } else if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            setError(exchangeError.message || 'Não foi possível validar seu login.')
            return
          }
        } else if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (setSessionError) {
            setError(setSessionError.message || 'Não foi possível validar seu login.')
            return
          }
        } else {
          setError(
            'Link inválido, incompleto ou expirado. Solicite a recuperação novamente e use sempre o último e-mail recebido.',
          )
          return
        }

        if (resolvedType && resolvedType !== 'recovery') {
          router.replace(nextPath)
          return
        }

        setReady(true)
      } catch (e) {
        setError((e as any)?.message || 'Não foi possível validar seu login.')
      }
    }

    void run()
  }, [code, nextPath, router, tokenHash, type])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    setError('')

    const p1 = String(password || '').trim()
    const p2 = String(password2 || '').trim()
    if (p1.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (p1 !== p2) {
      setError('As senhas não coincidem.')
      return
    }

    setSaving(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password: p1 })
      if (updateError) {
        setError(updateError.message || 'Não foi possível atualizar sua senha.')
        return
      }
      router.replace(nextPath)
    } catch (e) {
      setError((e as any)?.message || 'Não foi possível atualizar sua senha.')
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-center text-white">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-black mb-2 italic tracking-tight">ERRO DE AUTENTICAÇÃO</h1>
          <p className="text-neutral-400 mb-6">{error}</p>
          <button
            type="button"
            onClick={() => router.replace('/')}
            className="w-full py-4 px-6 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-black transition-colors"
          >
            Voltar para o Início
          </button>
        </div>
      </div>
    )
  }

  if (ready) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-white">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
          <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-yellow-500/20">
            <Lock className="w-8 h-8 text-yellow-500" />
          </div>
          <h1 className="text-xl font-black mb-2 italic tracking-tight text-center">DEFINIR NOVA SENHA</h1>
          <p className="text-neutral-400 mb-6 text-center text-sm">Crie uma senha para acessar sua conta.</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-400 uppercase">Nova senha</label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors pr-12"
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors p-2"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-400 uppercase">Confirmar senha</label>
              <input
                required
                type={showPassword ? 'text' : 'password'}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors"
                placeholder="Digite novamente"
                autoComplete="new-password"
              />
            </div>

            {error ? (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
                <p className="text-red-300 text-xs font-bold break-words">{error}</p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="w-full mt-2 bg-gradient-to-r from-yellow-500 to-amber-600 text-black px-6 py-3.5 rounded-xl font-black text-lg shadow-lg hover:shadow-yellow-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="animate-spin mx-auto" /> : 'SALVAR SENHA'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-center text-white">
      <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
        <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-yellow-500/20">
          <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
        </div>
        <h1 className="text-xl font-black mb-2 italic tracking-tight">VALIDANDO LOGIN…</h1>
        <p className="text-neutral-400">Aguarde um instante.</p>
      </div>
    </div>
  )
}
