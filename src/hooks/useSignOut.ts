'use client'

import { useCallback, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

interface UseSignOutOptions {
  userId?: string | null
  supabase: SupabaseClient
  onClear: () => void
}

interface UseSignOutReturn {
  safeSignOut: (scope?: string) => Promise<void>
  clearClientSessionState: () => void
}

/**
 * Provides safeSignOut and clearClientSessionState utilities.
 * Clears Supabase cookies, localStorage tokens, and local app state on sign-out.
 */
export function useSignOut({ userId, supabase, onClear }: UseSignOutOptions): UseSignOutReturn {
  const signOutInFlightRef = useRef(false)

  const clearSupabaseCookiesBestEffort = useCallback(() => {
    try {
      if (typeof document === 'undefined') return
      const raw = String(document.cookie || '')
      const cookieNames = raw
        .split(';')
        .map((p) => p.trim())
        .map((p) => p.split('=')[0])
        .filter(Boolean)
      const targets = cookieNames.filter((n) => n.startsWith('sb-') || n.includes('supabase'))
      targets.forEach((name) => {
        try {
          document.cookie = `${name}=; Max-Age=0; path=/`
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
        } catch { }
      })
    } catch { }
  }, [])

  const clearSupabaseStorageBestEffort = useCallback(() => {
    try {
      if (typeof window === 'undefined') return
      const ls = window.localStorage
      if (!ls) return
      const keys: string[] = []
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i)
        if (!k) continue
        if (k.startsWith('sb-') || k.includes('supabase') || k.includes('auth-token')) keys.push(k)
      }
      keys.forEach((k) => {
        try { ls.removeItem(k) } catch { }
      })
    } catch { }
  }, [])

  const clearClientSessionState = useCallback(() => {
    try {
      localStorage.removeItem('activeSession')
      localStorage.removeItem('appView')
      if (userId) {
        localStorage.removeItem(`irontracks.activeSession.v2.${userId}`)
        localStorage.removeItem(`irontracks.appView.v2.${userId}`)
      }
    } catch { }
    onClear()
  }, [userId, onClear])

  const safeSignOut = useCallback(async (scope = 'local') => {
    if (signOutInFlightRef.current) return
    signOutInFlightRef.current = true
    try {
      clearSupabaseCookiesBestEffort()
      clearSupabaseStorageBestEffort()
      await supabase.auth.signOut({ scope: scope as 'local' | 'global' | 'others' })
    } catch {
      try {
        clearSupabaseCookiesBestEffort()
        clearSupabaseStorageBestEffort()
      } catch { }
    } finally {
      signOutInFlightRef.current = false
    }
  }, [clearSupabaseCookiesBestEffort, clearSupabaseStorageBestEffort, supabase])

  return {
    safeSignOut,
    clearClientSessionState,
  }
}
