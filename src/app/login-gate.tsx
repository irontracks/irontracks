'use client'

/**
 * login-gate.tsx
 *
 * Guard that checks for an existing Supabase session before mounting
 * LoginScreen. If a session is found, immediately redirects to /dashboard
 * using Next.js client-side navigation (no full page reload = no black screen).
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import LoginScreen from '@/components/LoginScreen'

export default function LoginGate() {
  const router = useRouter()
  // null = still checking, false = no session → show login
  const [noSession, setNoSession] = useState<boolean>(false)
  const didCheck = useRef(false)

  useEffect(() => {
    if (didCheck.current) return
    didCheck.current = true

    // Prefetch dashboard chunks immediately (parallel with session check)
    router.prefetch('/dashboard')

    let supabase: ReturnType<typeof createClient> | null = null
    try { supabase = createClient() } catch { }
    if (!supabase) {
      Promise.resolve().then(() => {
        setNoSession(true)
        try { window.dispatchEvent(new CustomEvent('irontracks:app:ready')) } catch { }
      })
      return
    }
    // getSession() reads from localStorage — no network request, very fast
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        // Client-side navigation: no page reload, no black screen
        router.replace('/dashboard')
        // Keep showing LoadingScreen while navigating (AppLoadingOverlay covers the transition)
      } else {
        setNoSession(true)
        // App is ready to show the login screen — dismiss the root overlay
        try { window.dispatchEvent(new CustomEvent('irontracks:app:ready')) } catch { }
      }
    }).catch(() => {
      setNoSession(true)
      try { window.dispatchEvent(new CustomEvent('irontracks:app:ready')) } catch { }
    })
  }, [router])

  // While checking session or navigating to dashboard, render nothing —
  // AppLoadingOverlay (root layout) covers the screen.
  if (!noSession) return null

  return <LoginScreen />
}
