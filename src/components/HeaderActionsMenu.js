'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { Bell, Calendar, Cog, Command, CreditCard, History, LogOut, MessageSquare, Sparkles, Users } from 'lucide-react'

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
}) {
  const [open, setOpen] = useState(false)
  const [cancellingVip, setCancellingVip] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
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
    } catch (e) {
      window.alert('Falha ao cancelar assinatura.')
    } finally {
      setCancellingVip(false)
      close()
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-tour="header-menu"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-yellow-500 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-neutral-950"
      >
        {user?.photoURL ? (
          <Image src={user.photoURL} width={40} height={40} className="w-full h-full object-cover" alt="Perfil" />
        ) : (
          <div className="w-full h-full bg-neutral-800 flex items-center justify-center font-black text-yellow-500 text-sm">
            {String(user?.displayName || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        {(hasUnreadChat || hasUnreadNotification) && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-neutral-900" />
        )}
      </button>

      {open && (
        <>
          <button type="button" aria-label="Fechar menu" onClick={close} className="fixed inset-0 z-40" />
          <div className="absolute right-0 mt-3 w-64 z-50 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-2 space-y-1 text-sm">
              {isCoach && (
                <button
                  type="button"
                  data-tour="menu-coach-tools"
                  onClick={() => {
                    onOpenAdmin?.()
                    close()
                  }}
                  className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  <Command size={16} className="text-yellow-500" />
                  <span className="flex-1 text-neutral-200 group-hover:text-white">Painel de Controle</span>
                </button>
              )}

              {isCoach && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenSchedule?.()
                    close()
                  }}
                  className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  <Calendar size={16} className="text-neutral-300" />
                  <span className="flex-1 text-neutral-200 group-hover:text-white">Agenda</span>
                </button>
              )}

              {isCoach && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenWallet?.()
                    close()
                  }}
                  className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  <CreditCard size={16} className="text-neutral-300" />
                  <span className="flex-1 text-neutral-200 group-hover:text-white">Carteira</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onOpenNotifications?.()
                  close()
                }}
                className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <Bell size={16} className="text-neutral-300" />
                <span className="flex-1 text-neutral-200 group-hover:text-white">Notificações</span>
                {hasUnreadNotification && <span className="text-[10px] bg-red-500 text-white rounded-full px-2 py-0.5">Novo</span>}
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenChatList?.()
                  close()
                }}
                className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <MessageSquare size={16} className="text-neutral-300" />
                <span className="flex-1 text-neutral-200 group-hover:text-white">Conversas</span>
                {hasUnreadChat && <span className="text-[10px] bg-red-500 text-white rounded-full px-2 py-0.5">Novo</span>}
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenGlobalChat?.()
                  close()
                }}
                className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <Users size={16} className="text-neutral-300" />
                <span className="flex-1 text-neutral-200 group-hover:text-white">Iron Lounge</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenHistory?.()
                  close()
                }}
                className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <History size={16} className="text-neutral-300" />
                <span className="flex-1 text-neutral-200 group-hover:text-white">Histórico</span>
              </button>

              <button
                type="button"
                data-tour="menu-tour"
                onClick={() => {
                  onOpenTour?.()
                  close()
                }}
                className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <Sparkles size={16} className="text-yellow-500" />
                <span className="flex-1 text-neutral-200 group-hover:text-white">Ver tour</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenSettings?.()
                  close()
                }}
                className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <Cog size={16} className="text-neutral-300" />
                <span className="flex-1 text-neutral-200 group-hover:text-white">Configurações</span>
              </button>

              <button
                type="button"
                disabled={cancellingVip}
                onClick={cancelVip}
                className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-60"
              >
                <CreditCard size={16} className="text-red-500" />
                <span className="flex-1 text-neutral-200 group-hover:text-white">Cancelar assinatura VIP</span>
              </button>

              <div className="h-px bg-neutral-800 my-1" />

              <button
                type="button"
                onClick={() => {
                  onLogout?.()
                  close()
                }}
                className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <LogOut size={16} className="text-red-500" />
                <span className="flex-1 text-neutral-200 group-hover:text-white">Sair</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
