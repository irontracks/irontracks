'use client'

import { useEffect } from 'react'

function parseHashParams(hash: string) {
  try {
    const raw = String(hash || '')
    const s = raw.startsWith('#') ? raw.slice(1) : raw
    return new URLSearchParams(s)
  } catch {
    return new URLSearchParams()
  }
}

export default function RecoveryBridgeClient(): null {
  useEffect(() => {
    try {
      const hashParams = parseHashParams(window.location.hash)
      const hashType = String(hashParams.get('type') || '').trim().toLowerCase()
      const hasRecoveryHash = hashType === 'recovery'

      const url = new URL(window.location.href)
      const queryType = String(url.searchParams.get('type') || '').trim().toLowerCase()
      const hasRecoveryQuery = queryType === 'recovery'

      if (!hasRecoveryHash && !hasRecoveryQuery) return

      const nextRaw = String(url.searchParams.get('next') || '').trim()
      const next = nextRaw.startsWith('/') ? nextRaw : '/dashboard'

      const target = new URL('/auth/recovery', window.location.origin)
      target.searchParams.set('next', next)

      const queryCode = String(url.searchParams.get('code') || '').trim()
      if (queryCode) target.searchParams.set('code', queryCode)

      if (hasRecoveryQuery) target.searchParams.set('type', 'recovery')

      const nextHref = target.pathname + target.search + (hasRecoveryHash ? window.location.hash : '')
      if (window.location.pathname === '/auth/recovery') return
      window.location.replace(nextHref)
    } catch {}
  }, [])

  return null
}
