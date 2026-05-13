'use client'

import { memo, useCallback } from 'react'
import Image from 'next/image'
import { triggerHaptic } from '@/utils/native/irontracksNative'

type DashboardTabsProps = {
  view: 'dashboard' | 'assessments' | 'community' | 'vip'
  onChangeView: (next: 'dashboard' | 'assessments' | 'community' | 'vip') => void
  showCommunityTab: boolean
  showVipTab: boolean
  vipLabel: string
  vipLocked: boolean
  showNutritionTab?: boolean
  nutritionActive?: boolean
  onOpenNutrition?: () => void
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
  showNutritionTab,
  nutritionActive,
  onOpenNutrition,
}: DashboardTabsProps) => {
  const changeTab = useCallback((next: 'dashboard' | 'assessments' | 'community' | 'vip') => {
    triggerHaptic('light').catch(() => { })
    onChangeView(next)
  }, [onChangeView])

  const openNutrition = useCallback(() => {
    triggerHaptic('light').catch(() => { })
    onOpenNutrition?.()
  }, [onOpenNutrition])

  // WCAG 1.4.3 AA — tab labels visíveis precisam de contraste 4.5:1 sobre dark; neutral-500 falha
  const tabCls = (active: boolean) =>
    `flex-1 min-w-0 min-h-[52px] px-1 sm:px-3 rounded-xl text-[10px] sm:text-xs uppercase tracking-tight sm:tracking-wider whitespace-nowrap leading-none overflow-hidden transition-colors duration-200 flex flex-col items-center justify-center gap-[5px] relative z-10 ${active
      ? 'text-yellow-400 font-black'
      : 'text-neutral-400 hover:text-neutral-200 font-bold'
    }`

  const renderIndicator = (active: boolean) =>
    active ? (
      <>
        <div
          className="absolute inset-0 rounded-xl transition-all duration-200"
          style={{
            background: 'linear-gradient(135deg, rgba(234,179,8,0.1) 0%, rgba(234,179,8,0.04) 100%)',
            border: '1px solid rgba(234,179,8,0.18)',
            boxShadow: '0 0 16px rgba(234,179,8,0.08), inset 0 1px 0 rgba(234,179,8,0.1)',
          }}
        />
        <span
          className="absolute bottom-[5px] left-1/2 -translate-x-1/2 h-[2px] w-5 rounded-full transition-all duration-200"
          style={{
            background: 'linear-gradient(90deg, transparent, #eab308, transparent)',
            boxShadow: '0 0 8px rgba(234,179,8,0.6)',
          }}
        />
      </>
    ) : null

  const renderIcon = (src: string, active: boolean, alt: string) => (
    <div className={`relative transition-transform duration-200 ${active ? 'scale-[1.15] rotate-[3deg]' : ''}`}>
      <Image
        src={src}
        alt={alt}
        width={22}
        height={22}
        className={`rounded-[4px] transition-all duration-300 ${
          active ? 'brightness-110 drop-shadow-[0_0_6px_rgba(234,179,8,0.5)]' : 'brightness-75 grayscale-[30%]'
        }`}
      />
    </div>
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
            className="rounded-[14px] p-1 flex gap-0.5 sm:gap-1 relative"
            style={{
              background: 'linear-gradient(160deg, rgba(18,18,18,0.99) 0%, rgba(10,10,10,0.99) 100%)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/*
              When the Nutrição overlay is open it sits on top of every view —
              so visually the user is "in" Nutrição regardless of `view`.
              Other tabs must dim out, otherwise the previously-selected tab
              stays lit alongside Nutrição (the bug from PR #88's follow-up).
            */}
            {tabs.map(({ key, label, icon }) => {
              const active = view === key && !nutritionActive
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

            {showCommunityTab && (() => {
              const active = view === 'community' && !nutritionActive
              return (
                <button
                  type="button"
                  onClick={() => changeTab('community')}
                  data-tour="tab-community"
                  className={tabCls(active)}
                >
                  {renderIndicator(active)}
                  {renderIcon('/icons/tab-comunidade.png', active, 'Comunidade')}
                  <span>Comunidade</span>
                </button>
              )
            })()}

            {showNutritionTab && (
              <button
                type="button"
                onClick={openNutrition}
                data-tour="tab-nutrition"
                className={tabCls(!!nutritionActive)}
                aria-label="Abrir Nutrição"
              >
                {renderIndicator(!!nutritionActive)}
                {renderIcon('/icons/tab-nutricao.png', !!nutritionActive, 'Nutrição')}
                <span>Nutrição</span>
              </button>
            )}

            {showVipTab && (() => {
              const active = view === 'vip' && !nutritionActive
              return (
                <button
                  type="button"
                  onClick={() => changeTab('vip')}
                  data-tour="tab-vip"
                  className={tabCls(active)}
                >
                  {renderIndicator(active)}
                  {renderIcon('/icons/tab-vip.png', active, 'VIP')}
                  <span>{vipLabel}{vipLocked ? ' 🔒' : ''}</span>
                </button>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
})

DashboardTabs.displayName = 'DashboardTabs'
