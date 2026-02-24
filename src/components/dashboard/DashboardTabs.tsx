'use client'

type DashboardTabsProps = {
  view: 'dashboard' | 'assessments' | 'community' | 'vip'
  onChangeView: (next: 'dashboard' | 'assessments' | 'community' | 'vip') => void
  showCommunityTab: boolean
  showVipTab: boolean
  vipLabel: string
  vipLocked: boolean
}

export const DashboardTabs = ({
  view,
  onChangeView,
  showCommunityTab,
  showVipTab,
  vipLabel,
  vipLocked,
}: DashboardTabsProps) => {
  return (
    <div className="min-h-[60px]">
      <div className="sticky top-[var(--dashboard-sticky-top)] z-30">
        <div className="bg-neutral-900/70 backdrop-blur-md border border-neutral-800/70 rounded-2xl p-1 shadow-lg shadow-black/30">
          <div data-tour="tabs" className="bg-neutral-800 border border-neutral-700 rounded-xl p-1 flex gap-1">
            <button
              type="button"
              onClick={() => onChangeView('dashboard')}
              data-tour="tab-workouts"
              className={`flex-1 min-h-[44px] px-2 sm:px-3 rounded-lg font-black text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-wider whitespace-nowrap leading-none transition-colors ${
                view === 'dashboard'
                  ? 'bg-neutral-900 text-yellow-500 border border-yellow-500/30'
                  : 'bg-transparent text-neutral-400 hover:text-white'
              }`}
            >
              Treinos
            </button>
            <button
              type="button"
              onClick={() => onChangeView('assessments')}
              data-tour="tab-assessments"
              className={`flex-1 min-h-[44px] px-2 sm:px-3 rounded-lg font-black text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-wider whitespace-nowrap leading-none transition-colors ${
                view === 'assessments'
                  ? 'bg-neutral-900 text-yellow-500 border border-yellow-500/30'
                  : 'bg-transparent text-neutral-400 hover:text-white'
              }`}
            >
              Avaliações
            </button>
            {showCommunityTab ? (
              <button
                type="button"
                onClick={() => onChangeView('community')}
                data-tour="tab-community"
                className={`flex-1 min-h-[44px] px-2 sm:px-3 rounded-lg font-black text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-wider whitespace-nowrap leading-none transition-colors ${
                  view === 'community'
                    ? 'bg-neutral-900 text-yellow-500 border border-yellow-500/30'
                    : 'bg-transparent text-neutral-400 hover:text-white'
                }`}
              >
                Comunidade
              </button>
            ) : null}
            {showVipTab ? (
              <button
                type="button"
                onClick={() => onChangeView('vip')}
                data-tour="tab-vip"
                className={`flex-1 min-h-[44px] px-2 sm:px-3 rounded-lg font-black text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-wider whitespace-nowrap leading-none transition-colors ${
                  view === 'vip'
                    ? 'bg-neutral-900 text-yellow-500 border border-yellow-500/30'
                    : 'bg-transparent text-neutral-400 hover:text-white'
                }`}
              >
                {vipLabel}
                {vipLocked ? ' 🔒' : ''}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
