'use client'

/**
 * AdminNotificationBell — sino de notificações operacionais pro admin.
 *
 * Mostra:
 *   - Badge com contador de não-lidas
 *   - Dropdown com últimas 30 notificações (admin_*)
 *   - Botão "marcar todas como lidas"
 *   - Cada item clica e navega pro link associado (ex: /admin?tab=requests)
 *
 * Polling: refetch a cada 60s + on window focus. Sem realtime listener
 * pra evitar complicação de cleanup (regra do projeto Supabase).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Check, User, CreditCard, UserPlus } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { adminFetchJson } from '@/utils/admin/adminFetch'

type AdminNotification = {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  metadata: Record<string, unknown> | null
  is_read: boolean
  created_at: string
}

type ListResponse =
  | { ok: true; notifications: AdminNotification[]; unreadCount: number }
  | { ok: false; error: string }

const POLL_INTERVAL_MS = 60_000

const iconForType = (type: string) => {
  if (type === 'admin_new_signup' || type === 'admin_access_request') return UserPlus
  if (type === 'admin_vip_expiring') return CreditCard
  return User
}

const formatRelative = (iso: string): string => {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d`
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch {
    return ''
  }
}

interface Props {
  /** Chamado quando admin clica em "ver mais" / item com link. */
  onNavigate?: (link: string) => void
}

export function AdminNotificationBell({ onNavigate }: Props) {
  const [items, setItems] = useState<AdminNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  // useState lazy init: createClient() roda 1x. Antes useRef(createClient()) alocava
  // nova instância (com listener storage no window) a cada render — leak.
  const [supabase] = useState(() => createClient())
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const fetchNotifs = useCallback(async () => {
    try {
      setLoading(true)
      const res = await adminFetchJson<ListResponse>(
        supabase,
        '/api/admin/notifications/list',
        { cache: 'no-store' },
      )
      if (res && 'ok' in res && res.ok) {
        setItems(res.notifications ?? [])
        setUnread(res.unreadCount ?? 0)
      }
    } catch {
      // silencioso — sino não pode quebrar admin panel
    } finally {
      setLoading(false)
    }
  }, [supabase])

  // Initial fetch + polling
  useEffect(() => {
    fetchNotifs()
    const interval = setInterval(fetchNotifs, POLL_INTERVAL_MS)
    const onFocus = () => fetchNotifs()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchNotifs])

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const markAllRead = useCallback(async () => {
    try {
      await adminFetchJson(supabase, '/api/admin/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      // Atualização otimista
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnread(0)
    } catch {
      // silencioso
    }
  }, [supabase])

  const handleItemClick = useCallback(
    async (notif: AdminNotification) => {
      // Marca como lida (otimista) e navega
      if (!notif.is_read) {
        setItems((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)))
        setUnread((prev) => Math.max(0, prev - 1))
        adminFetchJson(supabase, '/api/admin/notifications/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: notif.id }),
        }).catch(() => { })
      }
      setOpen(false)
      if (notif.link && onNavigate) onNavigate(notif.link)
    },
    [onNavigate, supabase],
  )

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-10 h-10 rounded-full bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center transition-all border border-neutral-800 active:scale-95"
        aria-label={`Notificações${unread > 0 ? ` (${unread} não lidas)` : ''}`}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border border-neutral-950">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-[340px] max-w-[calc(100vw-32px)] max-h-[480px] overflow-hidden bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 flex-shrink-0">
            <div className="text-sm font-bold text-white">Notificações</div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] font-semibold text-yellow-500 hover:text-yellow-400 flex items-center gap-1"
              >
                <Check size={12} />
                Marcar todas
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && items.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-neutral-500">Carregando…</div>
            )}
            {!loading && items.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-neutral-500">
                Sem notificações no momento.
              </div>
            )}
            {items.map((n) => {
              const Icon = iconForType(n.type)
              return (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-neutral-900 hover:bg-neutral-900/60 transition-colors flex items-start gap-3 ${n.is_read ? 'opacity-60' : ''
                    }`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${n.is_read
                      ? 'bg-neutral-900 text-neutral-500'
                      : 'bg-yellow-500/15 text-yellow-400'
                      }`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-bold text-white truncate">{n.title}</div>
                      <div className="text-[10px] text-neutral-500 shrink-0">
                        {formatRelative(n.created_at)}
                      </div>
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5 line-clamp-2">{n.message}</div>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full bg-yellow-500 mt-2 shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
