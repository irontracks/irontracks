'use client'

/**
 * login-gate.tsx
 *
 * Guard that checks for an existing Supabase session before mounting
 * LoginScreen. If a session is found, immediately redirects to /dashboard.
 * This prevents the login form from ever flashing for already-logged-in users.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import LoadingScreen from '@/components/LoadingScreen'
import LoginScreen from '@/components/LoginScreen'

export default function LoginGate() {
  // null = still checking, true = has session, false = no session
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  useEffect(() => {
    // getSession() reads from localStorage — no network request
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        // Session found — redirect immediately
        window.location.replace('/dashboard')
        // Stay in loading state while navigating
      } else {
        setHasSession(false)
      }
    }).catch(() => {
      // On error, show the login form
      setHasSession(false)
    })
  }, [])

  // Show loading screen while checking session or navigating to dashboard
  if (hasSession !== false) {
    return <LoadingScreen />
  }

  return <LoginScreen />
}
