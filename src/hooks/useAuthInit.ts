'use client'

import { useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { logError } from '@/lib/logger'
import type { UserRecord } from '@/types/app'

interface UseAuthInitOptions {
  initialUser: unknown
  initialProfile: unknown
  clearClientSessionState: () => void
  setUser: (u: UserRecord) => void
  setIsCoach: (v: boolean) => void
}

/**
 * Handles auth state change subscription and initial user hydration
 * from SSR props into the client-side state. Extracted from IronTracksAppClientImpl.
 */
export function useAuthInit({
  initialUser,
  initialProfile,
  clearClientSessionState,
  setUser,
  setIsCoach,
}: UseAuthInitOptions) {
  const supabase = createClient()

  // Hydrate user from SSR props
  useEffect(() => {
    const baseUserObj = initialUser && typeof initialUser === 'object' ? (initialUser as Record<string, unknown>) : null
    if (!baseUserObj?.id) {
      try {
        if (typeof window !== 'undefined') window.location.href = '/?next=/dashboard'
      } catch { }
      return
    }
    const meta = baseUserObj?.user_metadata && typeof baseUserObj.user_metadata === 'object' ? (baseUserObj.user_metadata as Record<string, unknown>) : {}
    const emailRaw = String(baseUserObj?.email || '').trim()
    const emailUser = emailRaw.includes('@') ? emailRaw.split('@')[0] : (emailRaw || 'Usuário')
    const profileObj = initialProfile && typeof initialProfile === 'object' ? (initialProfile as Record<string, unknown>) : {}
    const profileDisplayName = String(profileObj?.display_name || profileObj?.displayName || '').trim()
    const profilePhotoURL = String(profileObj?.photo_url || profileObj?.photoURL || profileObj?.photoUrl || '').trim()
    const metaDisplayName = String(meta?.full_name || meta?.name || '').trim()
    const displayName = profileDisplayName || metaDisplayName || emailUser
    const photoURL = profilePhotoURL || meta?.avatar_url || meta?.picture || null
    const nextUser = { ...baseUserObj, id: String(baseUserObj.id), displayName, photoURL, role: profileObj?.role || 'user' }
    setUser(nextUser as UserRecord)
    const role = String(profileObj?.role || '').toLowerCase()
    setIsCoach(role === 'teacher' || role === 'admin')
  }, [initialUser, initialProfile, setUser, setIsCoach])

  // Auth state change subscription
  useEffect(() => {
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        try {
          const ev = String(_event || '').toUpperCase()
          if (session && session.user?.id) return
          if (ev === 'SIGNED_OUT') {
            clearClientSessionState()
            if (typeof window !== 'undefined') window.location.href = '/?next=/dashboard'
            return
          }
          if (ev === 'INITIAL_SESSION') {
            fetch('/api/auth/ping', { method: 'GET', credentials: 'include', cache: 'no-store' })
              .then((r) => {
                if (r && r.status === 204) return
                clearClientSessionState()
                if (typeof window !== 'undefined') window.location.href = '/?next=/dashboard'
              })
              .catch(() => { })
            return
          }
        } catch (e) { logError('IronTracksApp.authStateChange', e) }
      })
      return () => {
        try { sub?.subscription?.unsubscribe?.() } catch { }
      }
    } catch (e) {
      logError('IronTracksApp.authSubscribe', e)
      return
    }
  }, [supabase, clearClientSessionState])
}
