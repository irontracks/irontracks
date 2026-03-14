'use client'

import { memo } from 'react'
import { Dumbbell, BarChart2, Users, Star } from 'lucide-react'
import { motion } from 'framer-motion'

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
  const tabCls = (active: boolean) =>
    `flex-1 min-h-[52px] px-2 sm:px-3 rounded-xl text-[11px] sm:text-xs uppercase tracking-wider whitespace-nowrap leading-none transition-colors duration-200 flex flex-col items-center justify-center gap-[5px] relative z-10 ${active
      ? 'text-yellow-400 font-black'
      : 'text-neutral-500 hover:text-neutral-300 font-bold'
    }`

  return (
    <div className="min-h-[64px]">
      <div className="sticky top-[var(--dashboard-sticky-top)] z-30">
        {/* Glass container */}
        <div
          className="rounded-2xl p-[1px] shadow-2xl shadow-black/60"
          style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)' }}
        >
          <div
            className="rounded-[14px] p-1 flex gap-1 relative"
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
                  {active && (
                    <motion.div
                      layoutId="active-tab-indicator"
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background: 'linear-gradient(135deg, rgba(234,179,8,0.1) 0%, rgba(234,179,8,0.04) 100%)',
                        border: '1px solid rgba(234,179,8,0.18)',
                        boxShadow: '0 0 16px rgba(234,179,8,0.08), inset 0 1px 0 rgba(234,179,8,0.1)',
                      }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <motion.div
                    animate={{ scale: active ? 1.1 : 1, rotate: active ? 3 : 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  >
                    <Icon size={15} strokeWidth={active ? 2.5 : 1.8} />
                  </motion.div>
                  <span>{label}</span>
                  {active && (
                    <motion.span
                      layoutId="active-tab-underline"
                      className="absolute bottom-[5px] left-1/2 -translate-x-1/2 h-[2px] w-5 rounded-full"
                      style={{
                        background: 'linear-gradient(90deg, transparent, #eab308, transparent)',
                        boxShadow: '0 0 8px rgba(234,179,8,0.6)',
                      }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
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
                {view === 'community' && (
                  <motion.div
                    layoutId="active-tab-indicator"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: 'linear-gradient(135deg, rgba(234,179,8,0.1) 0%, rgba(234,179,8,0.04) 100%)',
                      border: '1px solid rgba(234,179,8,0.18)',
                      boxShadow: '0 0 16px rgba(234,179,8,0.08), inset 0 1px 0 rgba(234,179,8,0.1)',
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <motion.div
                  animate={{ scale: view === 'community' ? 1.1 : 1, rotate: view === 'community' ? 3 : 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <Users size={15} strokeWidth={view === 'community' ? 2.5 : 1.8} />
                </motion.div>
                <span>Comunidade</span>
                {view === 'community' && (
                  <motion.span
                    layoutId="active-tab-underline"
                    className="absolute bottom-[5px] left-1/2 -translate-x-1/2 h-[2px] w-5 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, transparent, #eab308, transparent)',
                      boxShadow: '0 0 8px rgba(234,179,8,0.6)',
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            )}

            {showVipTab && (
              <button
                type="button"
                onClick={() => onChangeView('vip')}
                data-tour="tab-vip"
                className={tabCls(view === 'vip')}
              >
                {view === 'vip' && (
                  <motion.div
                    layoutId="active-tab-indicator"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: 'linear-gradient(135deg, rgba(234,179,8,0.1) 0%, rgba(234,179,8,0.04) 100%)',
                      border: '1px solid rgba(234,179,8,0.18)',
                      boxShadow: '0 0 16px rgba(234,179,8,0.08), inset 0 1px 0 rgba(234,179,8,0.1)',
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <motion.div
                  animate={{ scale: view === 'vip' ? 1.1 : 1, rotate: view === 'vip' ? 3 : 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <Star size={15} strokeWidth={view === 'vip' ? 2.5 : 1.8} />
                </motion.div>
                <span>{vipLabel}{vipLocked ? ' 🔒' : ''}</span>
                {view === 'vip' && (
                  <motion.span
                    layoutId="active-tab-underline"
                    className="absolute bottom-[5px] left-1/2 -translate-x-1/2 h-[2px] w-5 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, transparent, #eab308, transparent)',
                      boxShadow: '0 0 8px rgba(234,179,8,0.6)',
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

DashboardTabs.displayName = 'DashboardTabs'
