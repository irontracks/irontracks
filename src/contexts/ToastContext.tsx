'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ActionToast } from '@/components/ui/ActionToast'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let idCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // Cancel all pending timers when the provider unmounts
  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t))
      timers.current.clear()
    }
  }, [])

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t !== undefined) { clearTimeout(t); timers.current.delete(id) }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info', duration = 3500) => {
    const id = String(++idCounter)
    setToasts((prev) => {
      // keep at most 3 toasts visible
      const trimmed = prev.length >= 3 ? prev.slice(1) : prev
      return [...trimmed, { id, message, type }]
    })
    const t = setTimeout(() => { dismiss(id); timers.current.delete(id) }, duration)
    timers.current.set(id, t)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed top-4 right-4 z-[999998] flex flex-col gap-2 pointer-events-none"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {toasts.map((t) => (
          <ActionToast key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
