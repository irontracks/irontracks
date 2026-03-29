'use client'

import { memo, useCallback } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { triggerHaptic } from '@/utils/native/irontracksNative'

type DashboardTabsProps = {
  view: 'dashboard' | 'assessments' | 'community' | 'vip'
  onChangeView: (next: 'dashboard' | 'assessments' | 'community' | 'vip') => void
  showCommunityTab: boolean
  showVipTab: boolean
  vipLabel: string
  vipLocked: boolean
}

const tabs = [
  { key: 'dashboard', label: 'Treinos', icon: '/icons/tab-treinos.png' },
  { key: 'assessments', label: 'Avaliações', icon: '/icons/tab-avaliacoes.png' },
] as const

export const DashboardTabs = memo(({
  view,
  onChangeView,
  showCommunityTab,
  showVipTab,
  vipLabel,
  vipLocked,
}: DashboardTabsProps) => {
  const changeTab = useCallback((next: 'dashboard' | 'assessments' | 'community' | 'vip') => {
    triggerHaptic('light').catch(() => { })
    onChangeView(next)
  }, [onChangeView])

  const tabCls = (active: boolean) =>
    `flex-1 min-h-[52px] px-2 sm:px-3 rounded-xl text-[11px] sm:text-xs uppercase tracking-wider whitespace-nowrap leading-none transition-colors duration-200 flex flex-col items-center justify-center gap-[5px] relative z-10 ${active
      ? 'text-yellow-400 font-black'
      : 'text-neutral-500 hover:text-neutral-300 font-bold'
    }`

  const renderIndicator = (active: boolean) =>
    active ? (
      <>
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
        <motion.span
          layoutId="active-tab-underline"
          className="absolute bottom-[5px] left-1/2 -translate-x-1/2 h-[2px] w-5 rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, #eab308, transparent)',
            boxShadow: '0 0 8px rgba(234,179,8,0.6)',
          }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      </>
    ) : null

  const renderIcon = (src: string, active: boolean, alt: string) => (
    <motion.div
      animate={{ scale: active ? 1.15 : 1, rotate: active ? 3 : 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className="relative"
    >
      <Image
        src={src}
        alt={alt}
        width={22}
        height={22}
        className={`rounded-[4px] transition-all duration-300 ${
          active ? 'brightness-110 drop-shadow-[0_0_6px_rgba(234,179,8,0.5)]' : 'brightness-75 grayscale-[30%]'
        }`}
        unoptimized
      />
    </motion.div>
  )

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
            {tabs.map(({ key, label, icon }) => {
              const active = view === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => changeTab(key as typeof view)}
                  data-tour={`tab-${key === 'dashboard' ? 'workouts' : key}`}
                  className={tabCls(active)}
                >
                  {renderIndicator(active)}
                  {renderIcon(icon, active, label)}
                  <span>{label}</span>
                </button>
              )
            })}

            {showCommunityTab && (
              <button
                type="button"
                onClick={() => changeTab('community')}
                data-tour="tab-community"
                className={tabCls(view === 'community')}
              >
                {renderIndicator(view === 'community')}
                {renderIcon('/icons/tab-comunidade.png', view === 'community', 'Comunidade')}
                <span>Comunidade</span>
              </button>
            )}

            {showVipTab && (
              <button
                type="button"
                onClick={() => changeTab('vip')}
                data-tour="tab-vip"
                className={tabCls(view === 'vip')}
              >
                {renderIndicator(view === 'vip')}
                {renderIcon('/icons/tab-vip.png', view === 'vip', 'VIP')}
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
