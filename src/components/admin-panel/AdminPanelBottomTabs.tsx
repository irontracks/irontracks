'use client'

/**
 * AdminPanelBottomTabs — barra inferior fixa do Painel Admin.
 *
 * Substitui o dropdown "VISÃO GERAL" + modal-cheia que abria o menu de
 * 14 itens. Quatro categorias visíveis o tempo todo:
 *
 *   🏠 Início   👥 Alunos   📚 Conteúdo   ⚙️ Mais
 *
 * Quando há solicitações pendentes, mostra um badge com o número no
 * tab "Alunos" — feedback imediato sem precisar navegar.
 */

import { useEffect, useState } from 'react'
import {
  ADMIN_CATEGORIES,
  categoryForTab,
  firstAvailableTabInCategory,
  type AdminCategory,
} from './adminPanelTabs'
import { useAdminPanel } from './AdminPanelContext'

interface AdminPanelBottomTabsProps {
  currentTab: string
  availableTabs: ReadonlySet<string>
  setTab: (key: string) => void
  setSelectedStudent: (value: unknown) => void
}

export const AdminPanelBottomTabs = ({
  currentTab,
  availableTabs,
  setTab,
  setSelectedStudent,
}: AdminPanelBottomTabsProps) => {
  const ctrl = useAdminPanel()
  const activeCategory: AdminCategory = categoryForTab(currentTab)

  // Badge dinâmico: número de solicitações pendentes — fica visível
  // na tab "Alunos" pra você ver sem precisar navegar.
  const [pendingRequests, setPendingRequests] = useState<number>(0)
  useEffect(() => {
    let cancelled = false
    const fetchPending = async () => {
      try {
        const supabase = ctrl.supabase
        if (!supabase) return
        // Conta requests pendentes (use `count: 'exact', head: true` pra
        // não trazer payload — só o número).
        const { count } = await supabase
          .from('access_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
        if (!cancelled && typeof count === 'number') setPendingRequests(count)
      } catch {
        /* silent — badge é cosmético */
      }
    }
    void fetchPending()
    // Refresh quando o tab muda — captura "voltei de outra tela, talvez
    // alguém solicitou" sem polling agressivo.
    return () => { cancelled = true }
  }, [ctrl.supabase, currentTab])

  const handleSelect = (categoryId: AdminCategory) => {
    const tabKey = firstAvailableTabInCategory(categoryId, availableTabs)
    if (!tabKey) return
    setTab(tabKey)
    setSelectedStudent(null)
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 pb-safe pointer-events-none"
      aria-label="Navegação principal do painel"
    >
      <div className="pointer-events-auto mx-auto max-w-2xl px-3 pb-2">
        <div
          className="grid grid-cols-4 gap-1 rounded-2xl border border-white/[0.08] bg-neutral-950/95 backdrop-blur-xl shadow-[0_-12px_40px_rgba(0,0,0,0.55)] p-1.5"
        >
          {ADMIN_CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isActive = activeCategory === cat.id
            const showBadge = cat.id === 'students' && pendingRequests > 0
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelect(cat.id)}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl transition-all duration-200 active:scale-[0.97] ${
                  isActive
                    ? 'bg-yellow-500/10 text-yellow-300'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                aria-label={cat.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className="relative">
                  <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                  {showBadge && (
                    <span
                      className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-red-500/40 border border-neutral-950"
                      aria-label={`${pendingRequests} solicitações pendentes`}
                    >
                      {pendingRequests > 99 ? '99+' : pendingRequests}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider leading-none ${
                    isActive ? 'font-black' : 'font-bold'
                  }`}
                >
                  {cat.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
