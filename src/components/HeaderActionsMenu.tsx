'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import {
  Bell,
  Calendar,
  Cog,
  Command,
  CreditCard,
  History,
  LogOut,
  MessageSquare,
  Sparkles,
  Users,
  Crown,
} from 'lucide-react'
import { isIosNative } from '@/utils/platform'

interface HeaderActionsMenuProps {
  user: {
    photoURL?: string | null
    displayName?: string | null
    role?: string | null
  } | null
  isCoach?: boolean
  hasUnreadChat?: boolean
  hasUnreadNotification?: boolean
  onOpenAdmin?: () => void
  onOpenChatList?: () => void
  onOpenGlobalChat?: () => void
  onOpenHistory?: () => void
  onOpenNotifications?: () => void
  onLogout?: () => void
  onOpenSchedule?: () => void
  onOpenWallet?: () => void
  onOpenSettings?: () => void
  onOpenTour?: () => void
}

function IconBox({ children, gold = false }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <div
      className={[
        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
        gold
          ? 'bg-yellow-500/15 border border-yellow-500/25'
          : 'bg-white/5 border border-white/8',
      ].join(' ')}
    >
      {children}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  gold = false,
  badge,
  danger = false,
  onClick,
  disabled = false,
  'data-tour': dataTour,
}: {
  icon: React.ReactNode
  label: string
  gold?: boolean
  badge?: React.ReactNode
  danger?: boolean
  onClick?: () => void
  disabled?: boolean
  'data-tour'?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-tour={dataTour}
      className={[
        'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 disabled:opacity-50',
        danger
          ? 'hover:bg-red-500/10 active:bg-red-500/15'
          : gold
            ? 'hover:bg-yellow-500/8 active:bg-yellow-500/12'
            : 'hover:bg-white/6 active:bg-white/10',
      ].join(' ')}
    >
      <IconBox gold={gold && !danger}>
        {icon}
      </IconBox>
      <span
        className={[
          'flex-1 text-[13.5px] font-medium text-left transition-colors',
          danger
            ? 'text-red-400 group-hover:text-red-300'
            : gold
              ? 'text-yellow-100/90 group-hover:text-yellow-50'
              : 'text-neutral-300 group-hover:text-white',
        ].join(' ')}
      >
        {label}
      </span>
      {badge}
    </button>
  )
}

function Divider() {
  return (
    <div className="mx-3 my-1">
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  )
}

export default function HeaderActionsMenu({
  user,
  isCoach,
  hasUnreadChat,
  hasUnreadNotification,
  onOpenAdmin,
  onOpenChatList,
  onOpenGlobalChat,
  onOpenHistory,
  onOpenNotifications,
  onLogout,
  onOpenSchedule,
  onOpenWallet,
  onOpenSettings,
  onOpenTour,
}: HeaderActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const [cancellingVip, setCancellingVip] = useState(false)
  const hideVipCtas = isIosNative()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const close = () => setOpen(false)

  const cancelVip = async () => {
    if (cancellingVip) return
    const confirmed = window.confirm('Cancelar sua assinatura VIP agora?')
    if (!confirmed) return
    setCancellingVip(true)
    try {
      const res = await fetch('/api/app/subscriptions/cancel-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json().catch(() => ({}))
      if (!json?.ok) {
        window.alert(String(json?.error || 'Falha ao cancelar assinatura.'))
        return
      }
      if (!json?.cancelled) {
        window.alert('Nenhuma assinatura ativa encontrada.')
        return
      }
      window.alert('Assinatura cancelada.')
    } catch {
      window.alert('Falha ao cancelar assinatura.')
    } finally {
      setCancellingVip(false)
      close()
    }
  }

  const displayName = String(user?.displayName || '').trim() || 'Usuário'
  const initial = displayName.slice(0, 1).toUpperCase()
  const roleLabel = isCoach ? 'Coach' : user?.role === 'admin' ? 'Admin' : null

  return (
    <div className="relative">
      {/* Avatar trigger */}
      <button
        type="button"
        data-tour="header-menu"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-yellow-500 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-neutral-950"
      >
        {user?.photoURL ? (
          <Image src={user.photoURL} width={40} height={40} className="w-full h-full object-cover" alt="Perfil" unoptimized />
        ) : (
          <div className="w-full h-full bg-neutral-800 flex items-center justify-center font-black text-yellow-500 text-sm">
            {initial}
          </div>
        )}
        {(hasUnreadChat || hasUnreadNotification) && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-neutral-950 animate-pulse-fast" />
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={close}
            className="fixed inset-0 z-40"
          />

          {/* Dropdown panel */}
          <div
            className="absolute right-0 mt-2 w-72 z-50 rounded-2xl overflow-hidden animate-dropdown-in"
            style={{
              background: 'linear-gradient(160deg, #161200 0%, #0c0c0c 25%)',
              boxShadow:
                '0 32px 64px -12px rgba(0,0,0,0.95), 0 0 0 1px rgba(234,179,8,0.18), inset 0 1px 0 rgba(234,179,8,0.22)',
            }}
          >
            {/* Gold shimmer top line */}
            <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/80 to-transparent" />

            {/* User mini-profile */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5">
              <div className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-yellow-500/60 flex-shrink-0">
                {user?.photoURL ? (
                  <Image
                    src={user.photoURL}
                    width={36}
                    height={36}
                    className="w-full h-full object-cover"
                    alt="Perfil"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full bg-neutral-800 flex items-center justify-center font-black text-yellow-500 text-xs">
                    {initial}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate">{displayName}</p>
                {roleLabel && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Crown size={9} className="text-yellow-500" />
                    <span className="text-[10px] font-bold text-yellow-500/90 uppercase tracking-wide">{roleLabel}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Menu items */}
            <div className="p-2 space-y-0.5">

              {/* Coach tools group */}
              {isCoach && (
                <>
                  <MenuItem
                    icon={<Command size={14} className="text-yellow-400" />}
                    label="Painel de Controle"
                    gold
                    data-tour="menu-coach-tools"
                    onClick={() => { onOpenAdmin?.(); close() }}
                  />
                  <MenuItem
                    icon={<Calendar size={14} className="text-yellow-400" />}
                    label="Agenda"
                    gold
                    onClick={() => { onOpenSchedule?.(); close() }}
                  />
                  <MenuItem
                    icon={<CreditCard size={14} className="text-yellow-400" />}
                    label="Carteira"
                    gold
                    onClick={() => { onOpenWallet?.(); close() }}
                  />
                  <Divider />
                </>
              )}

              {/* Communication */}
              <MenuItem
                icon={<Bell size={14} className={hasUnreadNotification ? 'text-yellow-400' : 'text-neutral-400'} />}
                label="Notificações"
                gold={!!hasUnreadNotification}
                badge={
                  hasUnreadNotification ? (
                    <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-2 py-0.5 leading-none">
                      Novo
                    </span>
                  ) : undefined
                }
                onClick={() => { onOpenNotifications?.(); close() }}
              />
              <MenuItem
                icon={<MessageSquare size={14} className={hasUnreadChat ? 'text-yellow-400' : 'text-neutral-400'} />}
                label="Conversas"
                gold={!!hasUnreadChat}
                badge={
                  hasUnreadChat ? (
                    <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-2 py-0.5 leading-none">
                      Novo
                    </span>
                  ) : undefined
                }
                onClick={() => { onOpenChatList?.(); close() }}
              />
              <MenuItem
                icon={<Users size={14} className="text-neutral-400" />}
                label="Iron Lounge"
                onClick={() => { onOpenGlobalChat?.(); close() }}
              />

              <Divider />

              {/* Utility */}
              <MenuItem
                icon={<History size={14} className="text-neutral-400" />}
                label="Histórico"
                onClick={() => { onOpenHistory?.(); close() }}
              />
              <MenuItem
                icon={<Sparkles size={14} className="text-yellow-400" />}
                label="Ver tour"
                gold
                data-tour="menu-tour"
                onClick={() => { onOpenTour?.(); close() }}
              />
              <MenuItem
                icon={<Cog size={14} className="text-neutral-400" />}
                label="Configurações"
                onClick={() => { onOpenSettings?.(); close() }}
              />

              {/* Cancel VIP */}
              {!hideVipCtas && (
                <>
                  <Divider />
                  <MenuItem
                    icon={<CreditCard size={14} className="text-red-400" />}
                    label="Cancelar assinatura VIP"
                    danger
                    disabled={cancellingVip}
                    onClick={cancelVip}
                  />
                </>
              )}

              <Divider />

              {/* Logout */}
              <MenuItem
                icon={<LogOut size={14} className="text-red-400" />}
                label="Sair"
                danger
                onClick={() => { onLogout?.(); close() }}
              />
            </div>

            {/* Gold shimmer bottom line */}
            <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
          </div>
        </>
      )}
    </div>
  )
}
