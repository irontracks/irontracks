'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo } from 'react'
import { AlertTriangle, ArrowLeft } from 'lucide-react'

function AuthErrorInner() {
  const sp = useSearchParams()
  const err = useMemo(() => String(sp?.get('error') || '').trim(), [sp])
  const errLower = String(err || '').toLowerCase()
  const hashErrorCode = useMemo(() => {
    try {
      const raw = typeof window !== 'undefined' ? String(window.location.hash || '') : ''
      const s = raw.startsWith('#') ? raw.slice(1) : raw
      const hp = new URLSearchParams(s)
      return String(hp.get('error_code') || '').trim().toLowerCase()
    } catch {
      return ''
    }
  }, [])
  const isOtpExpired = errLower.includes('otp_expired') || errLower.includes('expired') || hashErrorCode === 'otp_expired'

  const hint =
    errLower.includes('missing_env')
      ? 'Faltam variáveis do Supabase neste ambiente (Preview). Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel (Environment Variables → Preview) e faça Redeploy.'
      : errLower.includes('signups not allowed') || errLower.includes('signup') || errLower.includes('sign up')
      ? 'Parece que o Supabase está bloqueando novos usuários (signups).'
      : errLower.includes('test user') ||
        errLower.includes('access denied') ||
        errLower.includes('consent') ||
        errLower.includes('access_denied')
      ? 'Parece bloqueio do Google OAuth (app em modo Testing / test users).'
      : errLower.includes('flow_state_not_found')
      ? 'Falha no estado do OAuth. Normalmente isso acontece quando cookies são bloqueados ou o fluxo começa em um domínio e volta em outro.'
      : errLower.includes('pkce')
      ? 'Normalmente isso acontece quando o fluxo começou em um domínio e voltou em outro (www vs sem www), ou quando cookies foram bloqueados.'
      : isOtpExpired
      ? 'Esse link expirou (ou você clicou em um e-mail antigo). Volte ao login e solicite um novo link de recuperação. Use sempre o último e-mail recebido.'
      : ''

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-neutral-800 p-8 rounded-2xl border border-neutral-700 max-w-md w-full shadow-2xl">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
          <AlertTriangle size={32} />
        </div>

        <h1 className="text-2xl font-black text-white mb-2 uppercase">Erro de Autenticação</h1>

        <p className="text-neutral-400 mb-8 leading-relaxed">
          Não foi possível validar seu login.
          {err ? ` (${err})` : ''}
        </p>

        {hint ? (
          <div className="mb-6 rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-left text-sm text-neutral-300">
            {hint}
          </div>
        ) : null}

        <Link
          href="/"
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <ArrowLeft size={20} />
          Voltar para o Início
        </Link>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-neutral-800 p-8 rounded-2xl border border-neutral-700 max-w-md w-full shadow-2xl" />
        </div>
      }
    >
      <AuthErrorInner />
    </Suspense>
  )
}
