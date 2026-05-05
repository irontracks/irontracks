/**
 * useSharePlayBroadcast
 *
 * Watches the active workout's `logs` map and broadcasts a "set_done" SharePlay
 * message every time a brand-new set is completed (done flips false → true).
 *
 * Uses sendSharePlayMessage directly — the message goes to whichever
 * SharePlay session is currently active (managed by SharePlayBadge / native
 * plugin). When no session is active, the call is a cheap no-op.
 *
 * iOS-only — guarded internally so callers can drop it in unconditionally.
 */
'use client'

import { useEffect, useRef } from 'react'
import { sendSharePlayMessage } from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function useSharePlayBroadcast(logs: Record<string, unknown>): void {
  // Track which keys were already done in the previous render so we only
  // emit on the rising edge (false → true).
  const prevDoneRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!isIosNative()) return
    const prev = prevDoneRef.current
    const now = new Set<string>()

    for (const [key, raw] of Object.entries(logs)) {
      if (!isObj(raw)) continue
      const done = raw.done === true || raw.completed === true
      if (!done) continue
      now.add(key)
      // Skip already-known-done entries
      if (prev.has(key)) continue

      const parts = key.split('_')
      const exIdx = Number(parts[0])
      const setIdx = Number(parts[1])
      if (!Number.isFinite(exIdx) || !Number.isFinite(setIdx)) continue

      void sendSharePlayMessage('set_done', {
        exIdx,
        setIdx,
        weight: num(raw.weight),
        reps: num(raw.reps),
        rpe: num(raw.rpe),
      })
    }

    prevDoneRef.current = now
  }, [logs])
}
