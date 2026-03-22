'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { X, CheckCircle2, XCircle, Bell, Info, AlertCircle } from 'lucide-react'

/* ──────────────────────────────────────────────────────────
 * NotificationToast — Premium in-app toast card
 *
 * Fixes applied:
 * - Inline CSS animation (no external class dependency)
 * - Stable auto-dismiss timer via ref (no dep-loop)
 * - Countdown progress bar
 * - Slide-in + fade-out transitions
 * - Default 5000ms duration
 * ────────────────────────────────────────────────────────── */

type NotifType = 'success' | 'error' | 'social' | 'info' | 'warning'

function detectType(n: Record<string, unknown>): NotifType {
  const raw = String(n?.type ?? n?.kind ?? '').toLowerCase()
  if (raw === 'success' || raw === 'workout_complete' || raw === 'milestone') return 'success'
  if (raw === 'error') return 'error'
  if (raw === 'social' || raw === 'message' || raw === 'follow' || raw === 'like') return 'social'
  if (raw === 'warning') return 'warning'
  return 'info'
}

const TYPE_CONFIG: Record<NotifType, {
  border: string
  bg: string
  barColor: string
  icon: React.ReactNode
}> = {
  success: {
    border: 'border-l-green-500',
    bg: 'from-green-950/60 to-neutral-900/95',
    barColor: '#22c55e',
    icon: <CheckCircle2 size={18} className="text-green-400 shrink-0" />,
  },
  error: {
    border: 'border-l-red-500',
    bg: 'from-red-950/60 to-neutral-900/95',
    barColor: '#ef4444',
    icon: <XCircle size={18} className="text-red-400 shrink-0" />,
  },
  social: {
    border: 'border-l-yellow-500',
    bg: 'from-yellow-950/60 to-neutral-900/95',
    barColor: '#eab308',
    icon: <Bell size={18} className="text-yellow-400 shrink-0" />,
  },
  warning: {
    border: 'border-l-orange-500',
    bg: 'from-orange-950/60 to-neutral-900/95',
    barColor: '#f97316',
    icon: <AlertCircle size={18} className="text-orange-400 shrink-0" />,
  },
  info: {
    border: 'border-l-blue-500',
    bg: 'from-blue-950/60 to-neutral-900/95',
    barColor: '#3b82f6',
    icon: <Info size={18} className="text-blue-400 shrink-0" />,
  },
}

interface NotificationToastProps {
  settings?: Record<string, unknown> | null
  notification?: Record<string, unknown> | null
  message?: string
  sender?: string
  durationMs?: number
  onClick?: () => void
  onClose?: () => void
}

export default function NotificationToast({
  settings,
  notification: rawNotification,
  message: legacyMessage,
  sender: legacySender,
  durationMs: durationProp,
  onClick,
  onClose,
}: NotificationToastProps) {
  const allowToast = settings ? settings.inAppToasts !== false : true
  const [exiting, setExiting] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onClickRef = useRef(onClick)
  onClickRef.current = onClick

  const notification =
    rawNotification ||
    (legacyMessage || legacySender
      ? {
          text: String(legacyMessage ?? ''),
          senderName: legacySender || null,
          displayName: legacySender || null,
          photoURL: null,
        }
      : null)

  const durationMs = Number(durationProp ?? 5000)
  const shouldRender = !!notification && allowToast

  // Graceful close with exit animation
  const closeToast = useCallback(() => {
    setExiting(true)
    const id = setTimeout(() => {
      try { onCloseRef.current?.() } catch { /* silent */ }
    }, 280) // match fade-out duration
    return () => clearTimeout(id)
  }, [])

  // Auto-dismiss timer — stable, no dependency loops
  useEffect(() => {
    if (!shouldRender) return
    if (!Number.isFinite(durationMs) || durationMs <= 0) return
    const id = setTimeout(closeToast, durationMs)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender, durationMs]) // intentionally no closeToast — it's stable via useCallback

  const handleRootClick = useCallback(() => {
    try {
      if (onClickRef.current) {
        onClickRef.current()
        return
      }
      closeToast()
    } catch { /* silent */ }
  }, [closeToast])

  const handleCloseClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    closeToast()
  }, [closeToast])

  const n = notification as Record<string, unknown> | null
  const photoURL = n?.photoURL ? String(n.photoURL).trim() : ''
  const displayName = String(n?.displayName || n?.senderName || 'S')
  const senderName = String(n?.senderName || 'Aviso do Sistema')
  const text = String(n?.text || '').trim()

  if (!shouldRender || !text) return null

  const type = detectType(n ?? {})
  const cfg = TYPE_CONFIG[type]

  return (
    <div
      onClick={handleRootClick}
      className={`w-[360px] max-w-[calc(100vw-2rem)] bg-gradient-to-r ${cfg.bg} border border-neutral-700/80 border-l-4 ${cfg.border} rounded-xl shadow-2xl cursor-pointer backdrop-blur-md overflow-hidden`}
      style={{
        animation: exiting
          ? 'toastFadeOut 0.28s ease-in forwards'
          : 'toastSlideDown 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      }}
    >
      {/* Content */}
      <div className="flex items-center gap-3 p-4 pb-3">
        {/* Type icon */}
        <div className="shrink-0">{cfg.icon}</div>

        {/* Avatar or initials */}
        {photoURL ? (
          <Image
            src={photoURL}
            width={36}
            height={36}
            className="w-9 h-9 rounded-full border border-neutral-600 object-cover shrink-0"
            alt="Notif"
            unoptimized
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-neutral-700 border border-neutral-600 flex items-center justify-center font-bold text-sm shrink-0">
            {displayName?.[0] || 'S'}
          </div>
        )}

        <div className="flex-1 overflow-hidden min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wider text-neutral-400 truncate">{senderName}</p>
          <p className="text-sm text-white break-words leading-snug">{text}</p>
        </div>

        <button
          className="text-neutral-500 hover:text-white transition-colors shrink-0 ml-1"
          onClick={handleCloseClick}
          type="button"
          aria-label="Fechar notificação"
        >
          <X size={15} />
        </button>
      </div>

      {/* Countdown progress bar */}
      {durationMs > 0 && (
        <div className="h-[2px] w-full bg-black/20">
          <div
            className="h-full rounded-r-full"
            style={{
              backgroundColor: cfg.barColor,
              opacity: 0.6,
              animation: `toastCountdown ${durationMs}ms linear forwards`,
            }}
          />
        </div>
      )}

      {/* Inline keyframes — guaranteed to exist */}
      <style jsx>{`
        @keyframes toastSlideDown {
          0% { opacity: 0; transform: translateY(-100%) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toastFadeOut {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-40%) scale(0.95); }
        }
        @keyframes toastCountdown {
          0% { width: 100%; }
          100% { width: 0%; }
        }
      `}</style>
    </div>
  )
}
