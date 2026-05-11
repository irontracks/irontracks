'use client'

/**
 * AdminPanelSubTabs — chips horizontais que aparecem no topo do
 * conteúdo quando a categoria atual (definida na bottom tab) tem
 * mais de uma sub-tab.
 *
 * Comportamento:
 * - Se a categoria só tem 1 sub-tab (ex: "Início" só tem Dashboard),
 *   o componente não renderiza nada.
 * - Caso contrário, mostra todas as sub-tabs como chips clicáveis,
 *   com scroll horizontal se não couberem todas na largura.
 *
 * Ex: tocando "Alunos" no bottom, os chips no topo viram:
 *   [Alunos] [Solicitações] [Professores]
 */

import { useRef, useEffect } from 'react'
import {
  ADMIN_CATEGORIES,
  TAB_META,
  type AdminCategory,
} from './adminPanelTabs'

interface AdminPanelSubTabsProps {
  category: AdminCategory
  currentTab: string
  availableTabs: ReadonlySet<string>
  tabLabels: Record<string, string>
  setTab: (key: string) => void
  setSelectedStudent: (value: unknown) => void
}

export const AdminPanelSubTabs = ({
  category,
  currentTab,
  availableTabs,
  tabLabels,
  setTab,
  setSelectedStudent,
}: AdminPanelSubTabsProps) => {
  const def = ADMIN_CATEGORIES.find((c) => c.id === category)
  const tabsInCategory = (def?.tabKeys ?? []).filter((k) => availableTabs.has(k))
  const activeRef = useRef<HTMLButtonElement | null>(null)

  // Quando o tab ativo muda, scrolla pra mostrá-lo se estiver fora da viewport.
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [currentTab])

  // Categorias com 0 ou 1 sub-tab não precisam de chips.
  if (tabsInCategory.length <= 1) return null

  return (
    <div
      className="sticky top-0 z-20 -mx-4 px-4 pt-3 pb-2 bg-neutral-950/90 backdrop-blur-md border-b border-white/[0.04]"
      role="tablist"
      aria-label="Sub-navegação"
    >
      <div
        className="flex items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabsInCategory.map((key) => {
          const isActive = currentTab === key
          const label = tabLabels[key] || key
          const Icon = TAB_META[key]?.icon
          return (
            <button
              key={key}
              ref={isActive ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setTab(key)
                setSelectedStudent(null)
              }}
              className={`shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3.5 rounded-full border text-[11px] font-black uppercase tracking-wide whitespace-nowrap transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'bg-yellow-500 text-black border-yellow-400 shadow-md shadow-yellow-500/20'
                  : 'bg-white/[0.03] text-neutral-300 border-white/[0.08] hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {Icon ? <Icon size={13} strokeWidth={2.2} /> : null}
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
