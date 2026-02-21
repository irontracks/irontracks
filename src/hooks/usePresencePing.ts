'use client'

import { useEffect } from 'react'

/**
 * Fires presence ping endpoints once per session per user.
 * Stores a sessionStorage flag so re-renders don't resend.
 */
export function usePresencePing(userId?: string | null) {
  useEffect(() => {
    const uid = userId ? String(userId) : ''
    if (!uid) return

    const key = `irontracks.socialPresencePing.v1.${uid}`
    try {
      if (typeof window !== 'undefined') {
        const seen = window.sessionStorage.getItem(key) || ''
        if (seen === '1') return
        window.sessionStorage.setItem(key, '1')
      }
    } catch { }

    try {
      fetch('/api/social/presence/ping', { method: 'POST' }).catch(() => { })
    } catch { }

    try {
      fetch('/api/profiles/ping', { method: 'POST' }).catch(() => { })
    } catch { }
  }, [userId])
}
