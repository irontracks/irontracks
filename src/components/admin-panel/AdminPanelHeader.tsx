'use client'

import { AlertCircle, BarChart3, ChevronDown, ChevronRight, Crown, Dumbbell, FileText, MessageSquare, Play, Settings, UserCog, UserPlus, Users, X } from 'lucide-react'

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
    vip_reports: { key: 'vip_reports', icon: <BarChart3 size={ICON_SIZE} />, subtitle: 'Relatórios avançados' },
    errors: { key: 'errors', icon: <MessageSquare size={ICON_SIZE} />, subtitle: 'Feedbacks reportados' },
    system: { key: 'system', icon: <Settings size={ICON_SIZE} />, subtitle: 'Mensagens em massa e manutenção' },
  }

  const groups: MenuGroup[] = []
  const available = new Set(tabKeys)

  // Group 1: Gestão
  const gestao = ['dashboard', 'students', 'requests', 'teachers', 'priorities'].filter(k => available.has(k))
  if (gestao.length > 0) groups.push({ label: 'Gestão', items: gestao.map(k => allItems[k]) })

  // Group 2: Conteúdo
  const conteudo = ['templates', 'videos', 'vip_reports'].filter(k => available.has(k))
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
          className="md:hidden fixed inset-0 z-[60]"
          role="dialog"
          aria-modal="true"
          onClick={() => setMoreTabsOpen(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="absolute inset-x-0 bottom-0 pb-safe" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto w-full max-w-md rounded-t-3xl bg-neutral-950 border border-neutral-800 shadow-[0_-20px_60px_rgba(0,0,0,0.65)] overflow-hidden">
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-neutral-700" />
              </div>
              <div className="px-4 pt-1 pb-3 border-b border-neutral-800 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-black text-white">Menu</div>
                </div>
                <button
                  type="button"
                  onClick={() => setMoreTabsOpen(false)}
                  className="w-10 h-10 rounded-full bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-300 hover:text-white flex items-center justify-center transition-all duration-300 active:scale-95"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Grouped menu items */}
              <div className="p-3 max-h-[65vh] overflow-y-auto custom-scrollbar space-y-5">
                {buildMenuGroups(tabKeys).map((group) => (
                  <div key={group.label}>
                    {/* Section header */}
                    <div className="px-2 mb-2 flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">{group.label}</span>
                      <div className="flex-1 h-px bg-neutral-800" />
                    </div>

                    {/* Section items */}
                    <div className="grid gap-1.5">
                      {group.items.map((item) => {
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
                            className={`w-full min-h-[56px] px-4 rounded-2xl border flex items-center justify-between gap-3 transition-all duration-300 active:scale-[0.99] ${isActive
                                ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 shadow-lg shadow-yellow-500/10'
                                : 'bg-neutral-900/60 text-neutral-200 border-neutral-800 hover:bg-neutral-900'
                              }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 border ${isActive ? 'bg-yellow-500/15 border-yellow-500/40' : 'bg-neutral-900 border-neutral-800'
                                }`}>
                                <span className={isActive ? 'text-yellow-400' : 'text-neutral-400'}>
                                  {item.icon}
                                </span>
                              </div>
                              <div className="min-w-0 text-left">
                                <div className="font-black text-[12px] uppercase tracking-widest truncate">{label}</div>
                                <div className="text-[11px] text-neutral-500 truncate">{item.subtitle}</div>
                              </div>
                            </div>
                            <ChevronRight size={14} className={`flex-shrink-0 transition-colors ${isActive ? 'text-yellow-500' : 'text-neutral-600'}`} />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
