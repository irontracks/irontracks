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

/** Dot indicator for active tab — yellow glow */
const ActiveDot = () => (
  <span className="absolute bottom-[5px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-yellow-500 shadow-[0_0_6px_2px_rgba(234,179,8,0.5)]" />
)

export const DashboardTabs = memo(({
  view,
  onChangeView,
  showCommunityTab,
  showVipTab,
  vipLabel,
  vipLocked,
}: DashboardTabsProps) => {
  const tabCls = (active: boolean) =>
    `flex-1 min-h-[52px] px-2 sm:px-3 rounded-xl text-[11px] sm:text-xs uppercase tracking-wider whitespace-nowrap leading-none transition-all duration-200 flex flex-col items-center justify-center gap-[5px] relative ${active
      ? 'text-yellow-400 font-black'
      : 'text-neutral-500 hover:text-neutral-300 font-bold hover:bg-white/[0.03]'
    }`

  return (
    <div className="min-h-[64px]">
      <div className="sticky top-[var(--dashboard-sticky-top)] z-30">
        {/* Glass container — borda neutra sutil, sem amarelo dominante */}
        <div
          className="rounded-2xl p-[1px] shadow-2xl shadow-black/60"
          style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)' }}
        >
          <div
            className="rounded-[14px] p-1 flex gap-1"
            style={{
              background: 'linear-gradient(160deg, rgba(18,18,18,0.99) 0%, rgba(10,10,10,0.99) 100%)',
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
                  className={tabCls(active)}
                >
                  <Icon size={15} strokeWidth={active ? 2.5 : 1.8} />
                  <span>{label}</span>
                  {active && <ActiveDot />}
                </button>
              )
            })}

            {showCommunityTab && (
              <button
                type="button"
                onClick={() => onChangeView('community')}
                data-tour="tab-community"
                className={tabCls(view === 'community')}
              >
                <Users size={15} strokeWidth={view === 'community' ? 2.5 : 1.8} />
                <span>Comunidade</span>
                {view === 'community' && <ActiveDot />}
              </button>
            )}

            {showVipTab && (
              <button
                type="button"
                onClick={() => onChangeView('vip')}
                data-tour="tab-vip"
                className={tabCls(view === 'vip')}
              >
                <Star size={15} strokeWidth={view === 'vip' ? 2.5 : 1.8} />
                <span>{vipLabel}{vipLocked ? ' 🔒' : ''}</span>
                {view === 'vip' && <ActiveDot />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

DashboardTabs.displayName = 'DashboardTabs'
