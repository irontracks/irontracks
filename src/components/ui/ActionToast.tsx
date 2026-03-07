'use client'

import React, { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import type { ToastItem } from '@/contexts/ToastContext'

interface ActionToastProps {
  item: ToastItem
  onDismiss: (id: string) => void
}

const icons = {
  success: <CheckCircle2 size={16} className="text-green-400 shrink-0" />,
  error: <XCircle size={16} className="text-red-400 shrink-0" />,
  info: <Info size={16} className="text-blue-400 shrink-0" />,
}

const borders = {
  success: 'border-green-500/30',
  error: 'border-red-500/30',
  info: 'border-blue-500/30',
}

export function ActionToast({ item, onDismiss }: ActionToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // trigger enter animation on mount
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    setTimeout(() => onDismiss(item.id), 200)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'pointer-events-auto flex items-center gap-2.5 px-4 py-3',
        'rounded-xl border bg-neutral-900 shadow-xl shadow-black/40',
        'min-w-[220px] max-w-[320px] transition-all duration-200',
        borders[item.type],
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
      ].join(' ')}
    >
      {icons[item.type]}
      <span className="flex-1 text-sm text-neutral-100 leading-snug">{item.message}</span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Fechar notificação"
        className="text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  )
}
