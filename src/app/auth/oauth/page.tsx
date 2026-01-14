'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

function OAuthCallbackInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const [error, setError] = useState('')

  const params = useMemo(() => {
    const code = String(sp?.get('code') || '').trim()
    const next = String(sp?.get('next') || '/dashboard').trim() || '/dashboard'
    const err = String(sp?.get('error') || '').trim()
    const errDesc = String(sp?.get('error_description') || '').trim()
    return { code, next, err, errDesc }
  }, [sp])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const { code, next, err, errDesc } = params
        if (err || errDesc) {
          const msg = errDesc || err || 'oauth_error'
          router.replace(`/auth/auth-code-error?error=${encodeURIComponent(msg)}`)
          return
        }
        if (!code) {
          router.replace(`/auth/auth-code-error?error=${encodeURIComponent('missing_code')}`)
          return
        }

        const restorePkceCookiesBestEffort = () => {
          try {
            const backupRaw = window?.sessionStorage?.getItem('irontracks.pkce.backup.v1') || ''
            if (!backupRaw) return
            const parsed = JSON.parse(backupRaw)
            const list = Array.isArray(parsed) ? parsed : []
            if (list.length === 0) return

            const existing = new Set(
              String(document?.cookie || '')
                .split(';')
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p) => {
                  const idx = p.indexOf('=')
                  return idx < 0 ? '' : p.slice(0, idx).trim()
                })
                .filter(Boolean),
            )

            list.forEach((c: any) => {
              try {
                const name = String(c?.name || '').trim()
                const value = String(c?.value || '')
                if (!name || existing.has(name)) return
                document.cookie = `${name}=${value}; Path=/; SameSite=Lax; Max-Age=600`
              } catch {}
            })
          } catch {}
        }

        const restorePkceLocalStorageBestEffort = () => {
          try {
            const raw = window?.sessionStorage?.getItem('irontracks.pkce.lsbackup.v1') || ''
            if (!raw) return
            const parsed = JSON.parse(raw)
            const list = Array.isArray(parsed) ? parsed : []
            if (list.length === 0) return
            const ls = window?.localStorage
            if (!ls) return
            list.forEach((it: any) => {
              try {
                const k = String(it?.key || '')
                const v = typeof it?.value === 'string' ? it.value : null
                if (!k || v === null) return
                if (ls.getItem(k) !== null) return
                ls.setItem(k, v)
              } catch {}
            })
          } catch {}
        }

        const supabase = createClient()

        restorePkceCookiesBestEffort()
        restorePkceLocalStorageBestEffort()

        let exchangeError: any = null
        try {
          const res = await supabase.auth.exchangeCodeForSession(code)
          exchangeError = res?.error || null
        } catch (e: any) {
          exchangeError = e
        }

        const looksLikeMissingVerifier =
          String(exchangeError?.code || '').toLowerCase() === 'pkce_code_verifier_not_found' ||
          String(exchangeError?.message || '').toLowerCase().includes('code verifier not found')

        if (exchangeError && looksLikeMissingVerifier) {
          restorePkceCookiesBestEffort()
          restorePkceLocalStorageBestEffort()
          try {
            const res2 = await supabase.auth.exchangeCodeForSession(code)
            exchangeError = res2?.error || null
          } catch (e: any) {
            exchangeError = e
          }
        }

        if (exchangeError) {
          router.replace(`/auth/auth-code-error?error=${encodeURIComponent(exchangeError?.message || 'exchange_failed')}`)
          return
        }

        try {
          let uid: string | null = null
          for (let i = 0; i < 3; i += 1) {
            const { data } = await supabase.auth.getSession()
            uid = (data?.session?.user?.id || null) as string | null
            if (uid) break
            await new Promise((r) => setTimeout(r, 120))
          }
          if (!uid) {
            router.replace(`/auth/auth-code-error?error=${encodeURIComponent('session_missing_after_exchange')}`)
            return
          }
        } catch (e: any) {
          const msg = String(e?.message || 'session_check_failed')
          router.replace(`/auth/auth-code-error?error=${encodeURIComponent(msg)}`)
          return
        }

        try {
          window?.sessionStorage?.removeItem('irontracks.pkce.backup.v1')
          window?.sessionStorage?.removeItem('irontracks.pkce.lsbackup.v1')
        } catch {}

        if (!cancelled) router.replace(next)
      } catch (e: any) {
        if (cancelled) return
        const msg = String(e?.message || 'exchange_failed')
        setError(msg)
        router.replace(`/auth/auth-code-error?error=${encodeURIComponent(msg)}`)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [params, router])

  return (
    <div className="min-h-[100dvh] bg-neutral-900 flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-yellow-500/30 border-t-yellow-500 animate-spin" />
        <div className="text-white font-black tracking-tight">Autenticando...</div>
        {error ? <div className="text-xs text-red-300 font-mono max-w-md break-words">{error}</div> : null}
      </div>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-neutral-900 flex items-center justify-center p-6">
          <div className="w-12 h-12 rounded-full border-4 border-yellow-500/30 border-t-yellow-500 animate-spin" />
        </div>
      }
    >
      <OAuthCallbackInner />
    </Suspense>
  )
}
