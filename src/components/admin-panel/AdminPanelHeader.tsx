'use client'

/**
 * AdminPanelHeader — versão enxuta.
 *
 * Após o redesign de 2026-05-09, a navegação principal mora no
 * AdminPanelBottomTabs (categorias) + AdminPanelSubTabs (chips dentro
 * de cada categoria). O header deixa de carregar a lista completa de
 * tabs e fica apenas com:
 *
 *   - Logo + título "Painel de Controle"
 *   - Indicação de qual categoria está ativa (texto leve à direita)
 *   - Botão fechar (×)
 *   - Banner de erro de diagnóstico (quando aplicável)
 *
 * Resultado: header com ~64px de altura constante, em vez de ocupar
 * 25% da tela como o legacy fazia.
 */

import { Crown, X } from 'lucide-react'
import { AdminNotificationBell } from './AdminNotificationBell'

type AdminPanelHeaderProps = {
  debugError: string | null
  /** Label visível da tab atual — usado como subtítulo discreto */
  currentTabLabel: string
  /** Volta pra dashboard ao clicar no logo */
  setTab: (value: string) => void
  setSelectedStudent: (value: unknown) => void
  onClose?: () => void
}

export const AdminPanelHeader = ({
  debugError,
  currentTabLabel,
  setTab,
  setSelectedStudent,
  onClose,
}: AdminPanelHeaderProps) => {
  // Quando admin clica numa notificação com link tipo "/admin?tab=requests",
  // extrai a tab e navega via setTab — evita full page reload.
  const handleNotifNavigate = (link: string) => {
    try {
      const u = new URL(link, window.location.origin)
      const tab = u.searchParams.get('tab')
      if (tab) {
        setSelectedStudent(null)
        setTab(tab)
      }
    } catch {
      // link malformado, ignora
    }
  }

  return (
    <div className="sticky top-0 z-30 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-800 pt-safe flex-shrink-0">
      {debugError && (
        <div className="bg-red-600 text-white font-bold p-4 text-center text-xs break-all mb-2 rounded-xl mx-4 mt-2">
          DIAGNOSTIC MODE: {debugError}
        </div>
      )}
      <div className="px-4 md:px-8 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Logo + Título — também atalho pra voltar ao Dashboard */}
          <button
            type="button"
            onClick={() => {
              setSelectedStudent(null)
              setTab('dashboard')
            }}
            className="flex items-center gap-3 cursor-pointer group active:scale-[0.99] transition-transform min-w-0"
            aria-label="Voltar para o Início"
          >
            <div className="w-10 h-10 rounded-2xl bg-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/20 border border-yellow-400/40 shrink-0">
              <Crown size={20} className="text-black" />
            </div>
            <div className="flex flex-col items-start min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-500/80">
                IronTracks
              </span>
              <span className="text-sm md:text-base font-black text-white leading-tight truncate">
                Painel de Controle
              </span>
            </div>
          </button>

          {/* Subtítulo à direita: indica a categoria/tab ativa, sino de
              notificações admin e botão fechar. Em telas pequenas oculta
              o texto da tab e deixa só os botões. */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              {currentTabLabel}
            </span>
            <AdminNotificationBell onNavigate={handleNotifNavigate} />
            <button
              onClick={() => onClose && onClose()}
              className="w-10 h-10 rounded-full bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center transition-all border border-neutral-800 active:scale-95"
              aria-label="Fechar painel"
            >
              <X size={18} className="font-bold" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
