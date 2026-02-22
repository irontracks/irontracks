'use client'

import NutritionConsoleShell from '@/components/dashboard/nutrition/NutritionConsoleShell'
import VipWeeklySummaryCard from '@/components/vip/VipWeeklySummaryCard'
import VipInsightsPanel from '@/components/vip/VipInsightsPanel'

export default function VipAnalyticsClient() {
  return (
    <NutritionConsoleShell title="Analytics" subtitle="Performance">
      <div className="space-y-4">
        <div className="rounded-3xl bg-neutral-900/85 border border-neutral-800 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.5)] ring-1 ring-neutral-800/70">
          <div className="text-[10px] uppercase tracking-[0.24em] text-neutral-400">Analytics</div>
          <div className="mt-2 text-sm font-semibold text-white">Resumo e insights</div>
          <div className="mt-1 text-xs text-neutral-400">Acompanhe consistência, padrões e recomendações.</div>
        </div>

        <VipWeeklySummaryCard />
        <VipInsightsPanel />
      </div>
    </NutritionConsoleShell>
  )
}
