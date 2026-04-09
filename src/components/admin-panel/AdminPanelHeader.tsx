'use client'

import { AlertCircle, BarChart3, BookOpen, ChevronDown, ChevronRight, Crown, CreditCard, Dumbbell, MessageSquare, Play, Settings, UserCog, UserPlus, Users, X } from 'lucide-react'

type AdminPanelHeaderProps = {
  debugError: string | null
  tabLabels: Record<string, string>
  tabKeys: string[]
  tab: string
  currentTabLabel: string
  moreTabsOpen: boolean
  setMoreTabsOpen: (value: boolean) => void
  setTab: (value: string) => void
  setSelectedStudent: (value: unknown) => void
  onClose?: () => void
}

// ─── Menu Item Config ──────────────────────────────────────────────────────
type MenuItem = {
  key: string
  icon: React.ReactNode
  subtitle: string
}

type MenuGroup = {
  label: string
  items: MenuItem[]
}

const ICON_SIZE = 16

const buildMenuGroups = (tabKeys: string[]): MenuGroup[] => {
  const allItems: Record<string, MenuItem> = {
    dashboard: { key: 'dashboard', icon: <Crown size={ICON_SIZE} />, subtitle: 'Resumo e métricas do seu negócio' },
    students: { key: 'students', icon: <Users size={ICON_SIZE} />, subtitle: 'Gestão completa dos alunos' },
    requests: { key: 'requests', icon: <UserPlus size={ICON_SIZE} />, subtitle: 'Pedidos de acesso pendentes' },
    teachers: { key: 'teachers', icon: <UserCog size={ICON_SIZE} />, subtitle: 'Professores e convites' },
    priorities: { key: 'priorities', icon: <AlertCircle size={ICON_SIZE} />, subtitle: 'Triagem inteligente do coach' },
    templates: { key: 'templates', icon: <Dumbbell size={ICON_SIZE} />, subtitle: 'Biblioteca de treinos-base' },
    videos: { key: 'videos', icon: <Play size={ICON_SIZE} />, subtitle: 'Vídeos demonstrativos' },
    vip_reports: { key: 'vip_reports', icon: <BarChart3 size={ICON_SIZE} />, subtitle: 'Relatórios de uso VIP' },
    vip: { key: 'vip', icon: <Crown size={ICON_SIZE} />, subtitle: 'Gestão de assinantes VIP' },
    errors: { key: 'errors', icon: <MessageSquare size={ICON_SIZE} />, subtitle: 'Feedbacks reportados' },
    system: { key: 'system', icon: <Settings size={ICON_SIZE} />, subtitle: 'Mensagens em massa e manutenção' },
    billing: { key: 'billing', icon: <CreditCard size={ICON_SIZE} />, subtitle: 'Planos de serviço e cobranças dos alunos' },
    guide:   { key: 'guide',   icon: <BookOpen size={ICON_SIZE} />,  subtitle: 'Manual completo para professores' },
  }

  const groups: MenuGroup[] = []
  const available = new Set(tabKeys)

  // Group 1: Gestão
  const gestao = ['dashboard', 'students', 'requests', 'teachers', 'priorities', 'billing', 'guide'].filter(k => available.has(k))
  if (gestao.length > 0) groups.push({ label: 'Gestão', items: gestao.map(k => allItems[k]) })

  // Group 2: Conteúdo
  const conteudo = ['templates', 'videos', 'vip', 'vip_reports'].filter(k => available.has(k))
  if (conteudo.length > 0) groups.push({ label: 'Conteúdo', items: conteudo.map(k => allItems[k]) })

  // Group 3: Ferramentas
  const ferramentas = ['errors', 'system'].filter(k => available.has(k))
  if (ferramentas.length > 0) groups.push({ label: 'Ferramentas', items: ferramentas.map(k => allItems[k]) })

  return groups
}

export const AdminPanelHeader = ({
  debugError,
  tabLabels,
  tabKeys,
  tab,
  currentTabLabel,
  moreTabsOpen,
  setMoreTabsOpen,
  setTab,
  setSelectedStudent,
  onClose,
}: AdminPanelHeaderProps) => {
  return (
    <>
      <div className="sticky top-0 z-50 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-800 shadow-[0_16px_40px_rgba(0,0,0,0.55)] pt-safe flex-shrink-0">
        {debugError && (
          <div className="bg-red-600 text-white font-bold p-4 text-center text-xs break-all mb-2 rounded-xl">
            DIAGNOSTIC MODE: {debugError}
          </div>
        )}
        <div className="px-4 md:px-8 py-2">
          <div className="w-full flex flex-col md:flex-row md:items-center md:justify-between gap-1 md:gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudent(null)
                    setTab('dashboard')
                  }}
                  className="flex items-center gap-3 cursor-pointer group active:scale-[0.99] transition-transform"
                >
                  <div className="w-10 h-10 rounded-2xl bg-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/20 border border-yellow-400/40">
                    <Crown size={20} className="text-black" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-yellow-500/80">IronTracks</span>
                    <span className="text-sm md:text-base font-black text-white leading-tight">Painel de Controle</span>
                  </div>
                </button>
                <div className="hidden md:block text-[11px] uppercase tracking-widest text-neutral-500 font-bold">
                  Operações do seu negócio
                </div>
              </div>
              <button
                onClick={() => onClose && onClose()}
                className="md:hidden flex-shrink-0 w-10 h-10 rounded-full bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center transition-all border border-neutral-800 active:scale-95"
              >
                <X size={18} className="font-bold" />
              </button>
            </div>

            <div className="flex items-center gap-2 min-w-0 mt-1 md:mt-0">
              <div className="flex-1 min-w-0">
                <div data-tour="adminpanel.tabs" className="hidden md:flex items-center gap-2 justify-end flex-wrap">
                  {Object.entries(tabLabels).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setTab(key)
                        setSelectedStudent(null)
                        setMoreTabsOpen(false)
                      }}
                      className={`min-h-[40px] px-3.5 md:px-4 py-2 rounded-full font-black text-[11px] uppercase tracking-wide whitespace-nowrap transition-all duration-300 border active:scale-95 ${tab === key
                        ? 'bg-yellow-500 text-black border-yellow-400 shadow-lg shadow-yellow-500/20'
                        : 'bg-neutral-900/70 text-neutral-200 border-neutral-800 hover:bg-neutral-900'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    onClick={() => onClose && onClose()}
                    className="hidden md:inline-flex items-center justify-center w-10 h-10 rounded-full bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300 hover:text-white transition-all border border-neutral-800 active:scale-95 ml-1"
                  >
                    <X size={18} className="font-bold" />
                  </button>
                </div>

                <div className="md:hidden flex items-center gap-2">
                  <button
                    type="button"
                    data-tour="adminpanel.tabs"
                    onClick={() => setMoreTabsOpen(true)}
                    className="flex-1 min-h-[44px] px-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 flex items-center justify-between gap-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)] active:scale-95 transition-all duration-300"
                  >
                    <span className="text-[11px] font-black uppercase tracking-widest text-neutral-100 truncate">{currentTabLabel}</span>
                    <ChevronDown size={18} className="text-neutral-300" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {moreTabsOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
          role="presentation"
        >
          {/* Premium blurred backdrop — closes modal on click */}
          <button
            type="button"
            className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-default"
            onClick={() => setMoreTabsOpen(false)}
            onKeyDown={(e) => { if (e.key === 'Escape') setMoreTabsOpen(false) }}
            aria-label="Fechar menu"
          />

          {/* Modal card */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            tabIndex={-1}
            className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.8)] border border-white/[0.06] animate-in fade-in slide-in-from-top-4 duration-300"
          >
            {/* Glassmorphism background layers */}
            <div className="absolute inset-0 bg-neutral-950/95 backdrop-blur-2xl" />
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/[0.04] via-transparent to-transparent" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent" />

            {/* Content */}
            <div className="relative">
              {/* Header */}
              <div className="px-5 pt-5 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center shadow-lg shadow-yellow-500/25">
                    <Crown size={16} className="text-black" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-yellow-500/70">IronTracks</div>
                    <div className="text-sm font-black text-white leading-none">Painel de Controle</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMoreTabsOpen(false)}
                  className="w-9 h-9 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-400 hover:text-white flex items-center justify-center transition-all duration-200 active:scale-95"
                  aria-label="Fechar"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Divider */}
              <div className="mx-5 h-px bg-gradient-to-r from-transparent via-neutral-700/60 to-transparent mb-1" />

              {/* Grouped menu items */}
              <div className="p-3 max-h-[60vh] overflow-y-auto space-y-4">
                {buildMenuGroups(tabKeys).map((group, groupIdx) => {
                  const groupAccents: Record<string, { text: string; dot: string }> = {
                    'Gestão': { text: 'text-yellow-400/70', dot: 'bg-yellow-500' },
                    'Conteúdo': { text: 'text-blue-400/70', dot: 'bg-blue-500' },
                    'Ferramentas': { text: 'text-violet-400/70', dot: 'bg-violet-500' },
                  }
                  const accent = groupAccents[group.label] ?? { text: 'text-neutral-500', dot: 'bg-neutral-500' }

                  return (
                    <div key={group.label}>
                      {/* Section header */}
                      <div className="px-2 mb-2 flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />
                        <span className={`text-[10px] font-black uppercase tracking-[0.22em] ${accent.text}`}>{group.label}</span>
                        <div className="flex-1 h-px bg-white/[0.06]" />
                      </div>

                      {/* Section items */}
                      <div className="grid gap-1">
                        {group.items.map((item, itemIdx) => {
                          const isActive = tab === item.key
                          const label = tabLabels[item.key] || item.key

                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => {
                                setTab(item.key)
                                setSelectedStudent(null)
                                setMoreTabsOpen(false)
                              }}
                              style={{ animationDelay: `${(groupIdx * 5 + itemIdx) * 30}ms` }}
                              className={`w-full min-h-[58px] px-4 rounded-2xl border flex items-center justify-between gap-3 transition-all duration-200 active:scale-[0.98] animate-in fade-in slide-in-from-left-2 ${isActive
                                ? 'bg-gradient-to-r from-yellow-500/15 to-amber-500/5 text-yellow-300 border-yellow-500/25 shadow-[0_4px_20px_rgba(234,179,8,0.12)]'
                                : 'bg-white/[0.03] text-neutral-200 border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.12]'
                                }`}
                            >
                              <div className="flex items-center gap-3.5 min-w-0">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${isActive
                                  ? 'bg-yellow-500/20 border border-yellow-400/30'
                                  : 'bg-white/[0.04] border border-white/[0.08]'
                                  }`}>
                                  <span className={`transition-colors ${isActive ? 'text-yellow-400' : 'text-neutral-400'}`}>
                                    {item.icon}
                                  </span>
                                </div>
                                <div className="min-w-0 text-left">
                                  <div className={`font-black text-[11.5px] uppercase tracking-widest truncate leading-none mb-0.5 ${isActive ? 'text-yellow-300' : 'text-white'}`}>
                                    {label}
                                  </div>
                                  <div className="text-[10.5px] text-neutral-500 truncate leading-none">{item.subtitle}</div>
                                </div>
                              </div>
                              <div className={`flex-shrink-0 transition-all ${isActive ? 'opacity-100' : 'opacity-30'}`}>
                                {isActive ? (
                                  <div className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.8)]" />
                                ) : (
                                  <ChevronRight size={13} className="text-neutral-500" />
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Bottom padding */}
              <div className="h-3" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
