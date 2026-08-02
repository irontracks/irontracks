'use client'

import { useState, useEffect, useCallback } from 'react'
import { Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'

/* Primeiro acesso do aluno convidado — depois de entrar por OTP (só email), ele define uma
 * senha (pra logar normal depois) e confirma o nome. A conta já está criada e aprovada; esta
 * tela só completa os dados. Se não houver sessão, volta pro login. */

export default function OnboardingPage() {
  const [ready, setReady] = useState(false)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getUser()
        const user = data?.user
        if (!alive) return
        if (!user) { window.location.replace('/'); return }
        const meta = (user.user_metadata || {}) as Record<string, unknown>
        const prefill = String(meta.full_name || meta.display_name || meta.name || '').trim()
        if (prefill) setFullName(prefill)
        setReady(true)
      } catch (e) {
        logError('onboarding:init', e)
        if (alive) window.location.replace('/')
      }
    })()
    return () => { alive = false }
  }, [])

  const submit = useCallback(async () => {
    if (busy) return
    setError('')
    const name = fullName.trim()
    if (name.length < 2) { setError('Digite seu nome completo.'); return }
    if (password.length < 6) { setError('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    setBusy(true)
    try {
      const supabase = createClient()
      // Define a senha (exige a sessão atual) + guarda o nome no metadata.
      const { error: updErr } = await supabase.auth.updateUser({ password, data: { full_name: name, display_name: name } })
      if (updErr) throw updErr
      // Grava o nome no profile/students (o OTP não traz nome → handle_new_user usa o prefixo do email).
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fullName: name }),
      })
      const json = await res.json().catch((): null => null)
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || 'Falha ao salvar seus dados.'))
      try { localStorage.setItem('it.logged_in', '1') } catch { }
      window.location.replace('/dashboard')
    } catch (e: unknown) {
      logError('onboarding:submit', e)
      setError(getErrorMessage(e) || 'Não foi possível concluir. Tente novamente.')
      setBusy(false)
    }
  }, [busy, fullName, password, confirm])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <Loader2 className="animate-spin text-yellow-500" size={28} />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white p-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/5 bg-neutral-900/60 backdrop-blur-xl shadow-2xl p-7 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-black tracking-wide">Bem-vindo! 🎉</h1>
          <p className="text-xs text-neutral-400 leading-relaxed">Falta pouco. Confirme seu nome e crie uma senha para acessar sua conta.</p>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="ob-name" className="block text-[11px] font-black uppercase tracking-widest text-neutral-400 mb-1.5">Nome completo</label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                id="ob-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
                className="w-full bg-neutral-800/60 border border-neutral-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:border-yellow-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ob-pass" className="block text-[11px] font-black uppercase tracking-widest text-neutral-400 mb-1.5">Criar senha</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                id="ob-pass"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-neutral-800/60 border border-neutral-700 rounded-xl pl-10 pr-11 py-3 text-sm text-white placeholder:text-neutral-600 focus:border-yellow-500 focus:outline-none"
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="ob-pass2" className="block text-[11px] font-black uppercase tracking-widest text-neutral-400 mb-1.5">Confirmar senha</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                id="ob-pass2"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repita a senha"
                className="w-full bg-neutral-800/60 border border-neutral-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:border-yellow-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center">
            <p className="text-xs font-bold text-red-400 break-words">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-black py-3.5 rounded-xl text-sm uppercase tracking-wide hover:from-yellow-300 hover:to-amber-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <><Loader2 size={18} className="animate-spin" /> Salvando...</> : 'Concluir e entrar'}
        </button>
      </div>
    </div>
  )
}
