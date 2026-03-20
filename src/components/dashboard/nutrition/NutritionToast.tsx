'use client'

import { useEffect, useState } from 'react'

type ToastType = 'success' | 'error' | 'info'

const ICON: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

const COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: 'bg-emerald-500/12', border: 'border-emerald-500/25', text: 'text-emerald-200', icon: 'bg-emerald-500/20 text-emerald-400' },
  error: { bg: 'bg-red-500/12', border: 'border-red-500/25', text: 'text-red-200', icon: 'bg-red-500/20 text-red-400' },
  info: { bg: 'bg-blue-500/12', border: 'border-blue-500/25', text: 'text-blue-200', icon: 'bg-blue-500/20 text-blue-400' },
}

export type ToastMessage = { id: string; text: string; type: ToastType }

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const show = (text: string, type: ToastType = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setToasts((prev) => [...prev.slice(-2), { id, text, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }

  return { toasts, show }
}

export default function NutritionToast({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

function ToastItem({ toast }: { toast: ToastMessage }) {
  const [visible, setVisible] = useState(false)
  const c = COLORS[toast.type]

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => setVisible(false), 2500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className={`
        pointer-events-auto rounded-2xl ${c.bg} border ${c.border} backdrop-blur-xl
        px-4 py-3 flex items-center gap-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)]
        transition-all duration-300 ease-out
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}
      `}
    >
      <div className={`shrink-0 w-7 h-7 rounded-full ${c.icon} flex items-center justify-center text-sm font-bold`}>
        {ICON[toast.type]}
      </div>
      <div className={`text-sm font-semibold ${c.text}`}>{toast.text}</div>
    </div>
  )
}
