import React, { useEffect } from 'react'
import Image from 'next/image'
import { X, CheckCircle2, XCircle, Bell, Info, AlertCircle } from 'lucide-react'

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
  icon: React.ReactNode
}> = {
  success: {
    border: 'border-l-green-500',
    bg: 'from-green-950/50',
    icon: <CheckCircle2 size={18} className="text-green-400 shrink-0" />,
  },
  error: {
    border: 'border-l-red-500',
    bg: 'from-red-950/50',
    icon: <XCircle size={18} className="text-red-400 shrink-0" />,
  },
  social: {
    border: 'border-l-yellow-500',
    bg: 'from-yellow-950/50',
    icon: <Bell size={18} className="text-yellow-400 shrink-0 animate-pulse-fast" />,
  },
  warning: {
    border: 'border-l-orange-500',
    bg: 'from-orange-950/50',
    icon: <AlertCircle size={18} className="text-orange-400 shrink-0" />,
  },
  info: {
    border: 'border-l-blue-500',
    bg: 'from-blue-950/50',
    icon: <Info size={18} className="text-blue-400 shrink-0" />,
  },
}

export default function NotificationToast(props: Record<string, unknown>) {
  const settings = props?.settings && typeof props.settings === 'object' ? props.settings : null
  const allowToast = settings ? (settings as Record<string, unknown>).inAppToasts !== false : true
  const rawNotification = props?.notification ?? null
  const legacyMessage = props?.message ?? null
  const legacySender = props?.sender ?? null

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

  const durationMs = Number(props?.durationMs ?? 7000)
  const shouldRender = !!notification && allowToast

  useEffect(() => {
    if (!shouldRender) return
    if (!Number.isFinite(durationMs) || durationMs <= 0) return
    const id = setTimeout(() => {
      try {
        if (typeof props?.onClose === 'function') props.onClose()
      } catch { }
    }, durationMs)
    return () => clearTimeout(id)
  }, [durationMs, props, shouldRender])

  const handleRootClick = () => {
    try {
      if (typeof props?.onClick === 'function') {
        props.onClick()
        return
      }
      if (typeof props?.onClose === 'function') props.onClose()
    } catch { }
  }

  const handleCloseClick = (event: unknown) => {
    try {
      (event as { stopPropagation?: () => void })?.stopPropagation?.()
    } catch { }
    try {
      if (typeof props?.onClose === 'function') props.onClose()
    } catch { }
  }

  const n = notification as Record<string, unknown> | null
  const photoURL = n?.photoURL ? String(n.photoURL).trim() : ''
  const displayName = String(n?.displayName || n?.senderName || 'S')
  const senderName = String(n?.senderName || 'Aviso do Sistema')
  const text = String(n?.text || '').trim()

  if (!shouldRender) return null
  if (!text) return null

  const type = detectType(n ?? {})
  const cfg = TYPE_CONFIG[type]

  return (
    <div
      onClick={handleRootClick}
      className={`fixed top-4 right-4 z-[999999] w-[360px] max-w-[calc(100vw-2rem)] bg-gradient-to-r ${cfg.bg} to-neutral-900 border border-neutral-700/80 border-l-4 ${cfg.border} rounded-xl shadow-2xl p-4 flex items-center gap-3 animate-slide-down cursor-pointer backdrop-blur-sm`}
    >
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
  )
}
