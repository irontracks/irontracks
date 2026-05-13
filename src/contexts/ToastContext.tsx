'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ActionToast } from '@/components/ui/ActionToast'
import { useLazyRef } from '@/hooks/useLazyRef'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void
}

// Exportado pra permitir leitura defensiva via `useContext(ToastContext)` em
// componentes que precisam funcionar mesmo se o provider estiver ausente
// (ex: WatchSyncProvider em árvores parciais durante hot-reload). Não usar
// `useToast()` nesses casos — ele lança e quebra Rules of Hooks dentro de try/catch.
export const ToastContext = createContext<ToastContextValue | null>(null)

let idCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  // Lazy init: Map criado 1x. Antes era `useRef(new Map())` que alocava novo
  // Map a cada render do provider (descartado, mas pressure no GC).
  const timers = useLazyRef(() => new Map<string, ReturnType<typeof setTimeout>>())

  // Cancel all pending timers when the provider unmounts. `timers` é o objeto ref
  // estável (useLazyRef retorna mesma identidade entre renders), então pode entrar
  // nas deps sem disparar re-runs.
  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((t) => clearTimeout(t))
      map.clear()
    }
  }, [timers])

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t !== undefined) { clearTimeout(t); timers.current.delete(id) }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [timers])

  const toast = useCallback((message: string, type: ToastType = 'info', duration = 3500) => {
    const id = String(++idCounter)
    setToasts((prev) => {
      // keep at most 3 toasts visible
      const trimmed = prev.length >= 3 ? prev.slice(1) : prev
      return [...trimmed, { id, message, type }]
    })
    const t = setTimeout(() => { dismiss(id); timers.current.delete(id) }, duration)
    timers.current.set(id, t)
  }, [dismiss, timers])

  // Memoiza value — `toast` é estável (useCallback), então o context value nunca
  // muda após o primeiro render. Evita re-render de todos os consumers.
  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
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
