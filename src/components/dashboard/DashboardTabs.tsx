'use client'

import { memo } from 'react'
import { Dumbbell, BarChart2, Users, Star } from 'lucide-react'

type DashboardTabsProps = {
  view: 'dashboard' | 'assessments' | 'community' | 'vip'
  onChangeView: (next: 'dashboard' | 'assessments' | 'community' | 'vip') => void
  showCommunityTab: boolean
  showVipTab: boolean
  vipLabel: string
  vipLocked: boolean
}

const tabs = [
  { key: 'dashboard', label: 'Treinos', Icon: Dumbbell },
  { key: 'assessments', label: 'Avaliações', Icon: BarChart2 },
] as const

export const DashboardTabs = memo(({
  view,
  onChangeView,
  showCommunityTab,
  showVipTab,
  vipLabel,
  vipLocked,
}: DashboardTabsProps) => {
  return (
    <div className="min-h-[64px]">
      <div className="sticky top-[var(--dashboard-sticky-top)] z-30">
        {/* Outer glass container */}
        <div
          className="rounded-2xl p-[1.5px] shadow-2xl shadow-black/50"
          style={{
            background: 'linear-gradient(135deg, rgba(234,179,8,0.25) 0%, rgba(255,255,255,0.04) 50%, rgba(234,179,8,0.10) 100%)',
          }}
        >
          <div
            className="rounded-[14px] p-1 flex gap-1"
            style={{
              background: 'linear-gradient(160deg, rgba(20,20,20,0.98) 0%, rgba(10,10,10,0.98) 100%)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {tabs.map(({ key, label, Icon }) => {
              const active = view === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onChangeView(key as typeof view)}
                  data-tour={`tab-${key === 'dashboard' ? 'workouts' : key}`}
                  className={`flex-1 min-h-[48px] px-2 sm:px-3 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-wider whitespace-nowrap leading-none transition-all duration-200 flex flex-col items-center justify-center gap-[3px] ${active
                      ? 'text-black shadow-lg shadow-yellow-600/30 scale-[1.02]'
                      : 'text-neutral-500 hover:text-white hover:bg-white/5'
                    }`}
                  style={active ? {
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
                  } : {}}
                >
                  <Icon size={14} strokeWidth={active ? 2.5 : 2} />
                  <span>{label}</span>
                </button>
              )
            })}

            {showCommunityTab && (
              <button
                type="button"
                onClick={() => onChangeView('community')}
                data-tour="tab-community"
                className={`flex-1 min-h-[48px] px-2 sm:px-3 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-wider whitespace-nowrap leading-none transition-all duration-200 flex flex-col items-center justify-center gap-[3px] ${view === 'community'
                    ? 'text-black shadow-lg shadow-yellow-600/30 scale-[1.02]'
                    : 'text-neutral-500 hover:text-white hover:bg-white/5'
                  }`}
                style={view === 'community' ? {
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
                } : {}}
              >
                <Users size={14} strokeWidth={view === 'community' ? 2.5 : 2} />
                <span>Comunidade</span>
              </button>
            )}

            {showVipTab && (
              <button
                type="button"
                onClick={() => onChangeView('vip')}
                data-tour="tab-vip"
                className={`flex-1 min-h-[48px] px-2 sm:px-3 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-wider whitespace-nowrap leading-none transition-all duration-200 flex flex-col items-center justify-center gap-[3px] ${view === 'vip'
                    ? 'text-black shadow-lg shadow-yellow-600/30 scale-[1.02]'
                    : 'text-neutral-500 hover:text-white hover:bg-white/5'
                  }`}
                style={view === 'vip' ? {
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
                } : {}}
              >
                <Star size={14} strokeWidth={view === 'vip' ? 2.5 : 2} />
                <span>{vipLabel}{vipLocked ? ' 🔒' : ''}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

DashboardTabs.displayName = 'DashboardTabs'
