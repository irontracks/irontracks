'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { LayoutGrid, Bell, MessageSquare, Users, History, LogOut, Command, Calendar, CreditCard } from 'lucide-react'

const HeaderActionsMenu = ({ user, isCoach, hasUnreadChat, hasUnreadNotification, onOpenAdmin, onOpenChatList, onOpenGlobalChat, onOpenHistory, onOpenNotifications, onLogout, onOpenSchedule, onOpenWallet }) => {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative flex items-center">
      <div className="relative w-10 h-10">
        <button
          aria-label="Abrir menu"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          className="w-10 h-10 rounded-full overflow-hidden border-2 border-yellow-500 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
          title="Menu"
        >
          {user?.photoURL ? (
            <Image 
              src={user.photoURL} 
              width={40} 
              height={40} 
              className="w-full h-full object-cover" 
              alt="Profile" 
            />
          ) : (
            <div className="w-full h-full bg-neutral-800 flex items-center justify-center font-bold text-yellow-500 text-sm">
              {user?.displayName?.[0] || '?'}
            </div>
          )}
        </button>
        {(hasUnreadChat || hasUnreadNotification) && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-neutral-900" />
        )}
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}></div>
          <div className="absolute right-0 top-12 w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in text-neutral-300">
            <div className="p-2 space-y-1">
              <div className="px-2 py-1.5 text-[10px] text-neutral-500 uppercase font-bold">Ações</div>
              {isCoach && (
                <button onClick={() => { onOpenAdmin?.(); setOpen(false); }} className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm transition-all duration-150">
                  <div className="w-5 h-5 flex items-center justify-center transition-transform duration-150 group-hover:scale-110"><Command size={16} className="text-yellow-500" /></div>
                  <span className="flex-1 text-neutral-300 group-hover:text-white">Painel de Controle</span>
                </button>
              )}
              {isCoach && (
                <button onClick={() => { onOpenSchedule?.(); setOpen(false); }} className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm transition-all duration-150">
                  <div className="w-5 h-5 flex items-center justify-center transition-transform duration-150 group-hover:scale-110"><Calendar size={16} className="text-neutral-300" /></div>
                  <span className="flex-1 text-neutral-300 group-hover:text-white">Agenda</span>
                </button>
              )}
              {isCoach && (
                <button onClick={() => { onOpenWallet?.(); setOpen(false); }} className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm transition-all duration-150">
                  <div className="w-5 h-5 flex items-center justify-center transition-transform duration-150 group-hover:scale-110"><CreditCard size={16} className="text-neutral-300" /></div>
                  <span className="flex-1 text-neutral-300 group-hover:text-white">Carteira (Asaas)</span>
                </button>
              )}
              <button onClick={() => { onOpenNotifications?.(); setOpen(false); }} className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm transition-all duration-150">
                <div className="w-5 h-5 flex items-center justify-center transition-transform duration-150 group-hover:scale-110">
                  <Bell size={16} className="text-neutral-300" />
                </div>
                <span className="flex-1 text-neutral-300 group-hover:text-white">Notificações</span>
              </button>
              <button onClick={() => { onOpenChatList?.(); setOpen(false); }} className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm transition-all duration-150">
                <div className="w-5 h-5 flex items-center justify-center transition-transform duration-150 group-hover:scale-110"><MessageSquare size={16} className="text-neutral-300" /></div>
                <span className="flex-1 text-neutral-300 group-hover:text-white">Conversas Diretas</span>
                {hasUnreadChat && <span className="text-[10px] bg-red-500 text-white rounded-full px-2 py-0.5">Novo</span>}
              </button>
              <button onClick={() => { onOpenGlobalChat?.(); setOpen(false); }} className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm transition-all duration-150">
                <div className="w-5 h-5 flex items-center justify-center transition-transform duration-150 group-hover:scale-110"><Users size={16} className="text-neutral-300" /></div>
                <span className="flex-1 text-neutral-300 group-hover:text-white">Iron Lounge</span>
              </button>
              <button onClick={() => { onOpenHistory?.(); setOpen(false); }} className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm transition-all duration-150">
                <div className="w-5 h-5 flex items-center justify-center transition-transform duration-150 group-hover:scale-110"><History size={16} className="text-neutral-300" /></div>
                <span className="flex-1 text-neutral-300 group-hover:text-white">Histórico</span>
              </button>
              
              <button onClick={() => { onLogout?.(); setOpen(false); }} className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm transition-all duration-150">
                <div className="w-5 h-5 flex items-center justify-center transition-transform duration-150 group-hover:scale-110"><LogOut size={16} className="text-red-500" /></div>
                <span className="flex-1 text-neutral-300 group-hover:text-white">Sair</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default HeaderActionsMenu
