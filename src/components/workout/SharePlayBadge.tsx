/**
 * SharePlayBadge — UI for the SharePlay (Feature 18) integration in the workout
 * header. Three states:
 *
 *   • inactive  → small icon button labeled "Treinar Junto"
 *   • waiting   → spinner + "Aguardando..."
 *   • joined    → "📡 2" pill (count of participants), tap to end session
 *
 * Listens for incoming set-completion messages from peers and shows a small
 * toast banner at the top of the screen for ~3s ("João fez Série 3 ✓").
 *
 * iOS-only — renders nothing on other platforms.
 */
'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Users, X } from 'lucide-react'
import { useSharePlay, type PeerSetUpdate } from '@/hooks/useSharePlay'
import { useIsIosNative } from '@/hooks/useIsIosNative'

interface SharePlayBadgeProps {
  workout: { id: string; name: string } | null
  hostName?: string
  /** Optional callback so parent can mirror peer updates into local state. */
  onPeerSetDone?: (update: PeerSetUpdate) => void
}

interface ToastEntry {
  id: number
  text: string
}

export function SharePlayBadge({ workout, hostName, onPeerSetDone }: SharePlayBadgeProps) {
  const iosNative = useIsIosNative()
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const toastIdRef = useRef(0)

  const handlePeerSet = React.useCallback((update: PeerSetUpdate) => {
    const id = ++toastIdRef.current
    const w = update.weight != null && update.weight > 0 ? `${update.weight}kg` : ''
    const r = update.reps != null && update.reps > 0 ? `× ${update.reps}` : ''
    const meta = [w, r].filter(Boolean).join(' ')
    setToasts((prev) => [...prev, {
      id,
      text: `Parceiro: Exercício ${update.exIdx + 1} · Série ${update.setIdx + 1}${meta ? ` · ${meta}` : ''} ✓`,
    }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
    try { onPeerSetDone?.(update) } catch { /* swallow */ }
  }, [onPeerSetDone])

  const { state, info, hasPeers, start, end } = useSharePlay({
    workout,
    hostName,
    onPeerSetDone: handlePeerSet,
  })

  // Auto-end on unmount so users don't stay in a SharePlay session after
  // closing the workout view by accident.
  useEffect(() => {
    return () => { void end() }
  }, [end])

  if (!iosNative) return null
  if (!workout) return null

  const handleClick = async () => {
    if (state === 'joined' || state === 'waiting') {
      await end()
      return
    }
    const result = await start()
    if (!result.ok && result.error === 'not_activated') {
      // Inform user they need to be on a FaceTime call. Keep it short and
      // non-modal — the toast is enough.
      const id = ++toastIdRef.current
      setToasts((prev) => [...prev, {
        id,
        text: 'Inicie um FaceTime primeiro pra Treinar Junto.',
      }])
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
    }
  }

  const label = state === 'joined'
    ? `${info.participantCount}`
    : state === 'waiting'
      ? '...'
      : ''

  const isOn = state === 'joined' || state === 'waiting'

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={isOn ? 'Encerrar Treinar Junto' : 'Treinar Junto via FaceTime'}
        aria-label={isOn ? 'Encerrar Treinar Junto' : 'Treinar Junto via FaceTime'}
        className={[
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border font-black text-xs transition-all active:scale-95',
          isOn
            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
            : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-emerald-400 hover:border-emerald-500/30',
        ].join(' ')}
      >
        {isOn ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <Users size={12} />
            {label}
            <X size={11} className="opacity-60" />
          </>
        ) : (
          <>
            <Users size={12} />
            <span className="hidden sm:inline">Treinar Junto</span>
          </>
        )}
      </button>

      {/* Toast layer — fixed top, animated in/out */}
      {toasts.length > 0 && (
        <div className="fixed top-safe left-0 right-0 z-[1500] pointer-events-none flex flex-col items-center gap-2 px-4 pt-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto max-w-md w-full px-4 py-2.5 rounded-xl text-sm font-bold text-emerald-100 animate-dropdown-in"
              style={{
                background: 'rgba(6, 78, 59, 0.92)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              }}
            >
              {hasPeers || t.text.includes('FaceTime') ? t.text : `${t.text}`}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
