'use client'

import { AlertCircle, AlertTriangle, ChevronDown, Crown, Dumbbell, Play, ShieldAlert, UserCog, UserPlus, X } from 'lucide-react'

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
                      className={`min-h-[40px] px-3.5 md:px-4 py-2 rounded-full font-black text-[11px] uppercase tracking-wide whitespace-nowrap transition-all duration-300 border active:scale-95 ${
                        tab === key
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
              <div className="px-4 pt-3 pb-2 border-b border-neutral-800 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold">Mais</div>
                  <div className="text-base font-black text-white">Navegação</div>
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
              <div className="p-3 grid gap-2">
                {(Array.isArray(tabKeys) ? tabKeys : []).map((key) => {
                  const isActive = tab === key
                  const label = tabLabels[key] || key
                  let subtitle = ''
                  if (key === 'dashboard') subtitle = 'Visão geral do negócio'
                  else if (key === 'students') subtitle = 'Gestão de alunos e status'
                  else if (key === 'templates') subtitle = 'Biblioteca de treinos-base'
                  else if (key === 'teachers') subtitle = 'Gestão de professores e convites'
                  else if (key === 'videos') subtitle = 'Fila de vídeos por exercício'
                  else if (key === 'priorities') subtitle = 'Triagem inteligente do coach'
                  else if (key === 'errors') subtitle = 'Erros reportados pelos usuários'
                  else if (key === 'system') subtitle = 'Backup, broadcasts e operações críticas'

                  let iconColor = isActive ? 'text-yellow-400' : 'text-neutral-400'
                  let badgeClass = isActive ? 'bg-yellow-500/15 border-yellow-500/40' : 'bg-neutral-900 border-neutral-800'

                  if (key === 'system') {
                    iconColor = isActive ? 'text-red-400' : 'text-red-300'
                    badgeClass = isActive ? 'bg-red-900/60 border-red-500/60' : 'bg-red-950/70 border-red-700/70'
                  }

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setTab(key)
                        setSelectedStudent(null)
                        setMoreTabsOpen(false)
                      }}
                      className={`w-full min-h-[56px] px-4 rounded-2xl border flex items-center justify-between gap-3 transition-all duration-300 active:scale-[0.99] ${
                        isActive
                          ? key === 'system'
                            ? 'bg-red-900/20 text-red-300 border-red-500/40 shadow-lg shadow-red-500/20'
                            : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 shadow-lg shadow-yellow-500/10'
                          : key === 'system'
                            ? 'bg-neutral-900/80 text-red-300 border-red-800 hover:bg-neutral-900'
                            : 'bg-neutral-900/60 text-neutral-200 border-neutral-800 hover:bg-neutral-900'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 border ${badgeClass}`}>
                          {key === 'dashboard' && <Crown size={16} className={iconColor} />}
                          {key === 'students' && <UserPlus size={16} className={iconColor} />}
                          {key === 'templates' && <Dumbbell size={16} className={iconColor} />}
                          {key === 'teachers' && <UserCog size={16} className={iconColor} />}
                          {key === 'videos' && <Play size={16} className={iconColor} />}
                          {key === 'priorities' && <AlertCircle size={16} className={iconColor} />}
                          {key === 'errors' && <AlertTriangle size={16} className={iconColor} />}
                          {key === 'system' && <ShieldAlert size={16} className={iconColor} />}
                        </div>
                        <div className="min-w-0 text-left">
                          <div className="font-black text-[12px] uppercase tracking-widest truncate">{label}</div>
                          {subtitle && <div className="text-[11px] text-neutral-400 truncate">{subtitle}</div>}
                        </div>
                      </div>
                      <ChevronDown size={16} className={`transition-transform text-neutral-500 ${isActive ? 'rotate-90' : '-rotate-90'}`} />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
