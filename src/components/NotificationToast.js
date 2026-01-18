import React, { useEffect } from 'react'
import Image from 'next/image'
import { X } from 'lucide-react'

export default function NotificationToast(props) {
  const settings = props?.settings && typeof props.settings === 'object' ? props.settings : null
  const allowToast = settings ? settings.inAppToasts !== false : true
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

  if (!notification || !allowToast) return null

  const durationMs = Number(props?.durationMs ?? 5000)

  useEffect(() => {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return
    const id = setTimeout(() => {
      try {
        if (typeof props?.onClose === 'function') props.onClose()
      } catch {}
    }, durationMs)
    return () => clearTimeout(id)
  }, [durationMs, props])

  const handleRootClick = () => {
    try {
      if (typeof props?.onClick === 'function') {
        props.onClick()
        return
      }
      if (typeof props?.onClose === 'function') props.onClose()
    } catch {}
  }

  const handleCloseClick = (event) => {
    try {
      event?.stopPropagation?.()
    } catch {}
    try {
      if (typeof props?.onClose === 'function') props.onClose()
    } catch {}
  }

  const photoURL = notification?.photoURL ? String(notification.photoURL).trim() : ''
  const displayName = String(notification?.displayName || notification?.senderName || 'S')
  const senderName = String(notification?.senderName || 'Aviso do Sistema')
  const text = String(notification?.text || '').trim()

  if (!text) return null

  return (
    <div
      onClick={handleRootClick}
      className="fixed top-4 right-4 z-[2000] w-[360px] max-w-[calc(100vw-2rem)] bg-neutral-800 border-l-4 border-yellow-500 rounded-r-lg shadow-2xl p-4 flex items-center gap-3 animate-slide-down cursor-pointer"
    >
      {photoURL ? (
        <Image
          src={photoURL}
          width={40}
          height={40}
          className="w-10 h-10 rounded-full border border-neutral-600 object-cover"
          alt="Notif"
          unoptimized
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-neutral-700 flex items-center justify-center font-bold">
          {displayName?.[0] || 'S'}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <p className="text-xs font-bold text-yellow-500">{senderName}</p>
        <p className="text-sm text-white break-words">{text}</p>
      </div>
      <button className="text-neutral-400" onClick={handleCloseClick}>
        <X size={16} />
      </button>
    </div>
  )
}

