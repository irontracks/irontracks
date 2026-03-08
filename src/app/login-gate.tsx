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
import LoadingScreen from '@/components/LoadingScreen'
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

    const supabase = createClient()
    // getSession() reads from localStorage — no network request, very fast
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        // Client-side navigation: no page reload, no black screen
        router.replace('/dashboard')
        // Keep showing LoadingScreen while navigating
      } else {
        setNoSession(true)
      }
    }).catch(() => {
      setNoSession(true)
    })
  }, [router])

  if (!noSession) {
    return <LoadingScreen />
  }

  return <LoginScreen />
}
