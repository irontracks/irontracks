'use client'

import React, { useState } from 'react'
import { LayoutGrid, Bell, MessageSquare, Users, History, LogOut, Command } from 'lucide-react'
import NotificationCenter from '@/components/NotificationCenter'

const HeaderActionsMenu = ({ user, isCoach, hasUnreadChat, onOpenAdmin, onOpenChatList, onOpenGlobalChat, onOpenHistory, onLogout }) => {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative mt-1.5">
      <button
        aria-label="Abrir menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="group relative w-12 h-12 rounded-full bg-gradient-to-b from-neutral-800 to-neutral-900 text-neutral-200 flex items-center justify-center border border-white/10 shadow-md backdrop-blur-sm hover:from-neutral-700 hover:to-neutral-800 hover:text-white hover:shadow-lg hover:border-white/20 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        title="Menu"
      >
        <span className="absolute inset-0 rounded-full ring-1 ring-white/10"></span>
        <LayoutGrid size={20} strokeWidth={2.5} className="drop-shadow-sm" />
        {hasUnreadChat && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-neutral-900" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}></div>
          <div className="absolute right-0 top-12 w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in text-neutral-300">
            <div className="p-2 space-y-1">
              <div className="px-2 py-1.5 text-[10px] text-neutral-500 uppercase font-bold">Ações</div>
              <button onClick={() => { onOpenAdmin?.(); setOpen(false); }} className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm transition-all duration-150">
                <div className="w-5 h-5 flex items-center justify-center transition-transform duration-150 group-hover:scale-110"><Command size={16} className="text-yellow-500" /></div>
                <span className="flex-1 text-neutral-300 group-hover:text-white">Painel de Controle</span>
              </button>
              <button className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm transition-all duration-150">
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
