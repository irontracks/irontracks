'use client'

/**
 * VipTabUnified — agrupa Assinantes (VipTab) + Relatórios (AdminVipReports)
 * em uma única tab com toggle interno.
 *
 * Antes: 2 tabs separadas no menu (VIP Gestão + VIP Reports), o que forçava
 * o admin a sair de uma pra ver a outra. Agora é 1 tab "VIP" com 2 modos.
 */

import { useState } from 'react'
import { Crown, BarChart3 } from 'lucide-react'
import { VipTab } from './VipTab'
import dynamic from 'next/dynamic'
import { useAdminPanel } from './AdminPanelContext'

const AdminVipReports = dynamic(() => import('@/components/admin/AdminVipReports'), { ssr: false })

type VipMode = 'subscribers' | 'reports'

export function VipTabUnified() {
  const ctrl = useAdminPanel()
  const [mode, setMode] = useState<VipMode>('subscribers')

  return (
    <div className="space-y-4">
      {/* Toggle interno — 2 botões grandes pra alternar entre os modos.
          Mais visível que sub-tabs minúsculos; bom em mobile. */}
      <div
        className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          type="button"
          onClick={() => setMode('subscribers')}
          className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all duration-200 active:scale-[0.98] ${
            mode === 'subscribers'
              ? 'bg-yellow-500 text-black shadow-md shadow-yellow-500/20'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Crown size={14} strokeWidth={2.4} />
          Assinantes
        </button>
        <button
          type="button"
          onClick={() => setMode('reports')}
          className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all duration-200 active:scale-[0.98] ${
            mode === 'reports'
              ? 'bg-yellow-500 text-black shadow-md shadow-yellow-500/20'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <BarChart3 size={14} strokeWidth={2.4} />
          Relatórios
        </button>
      </div>

      {/* Conteúdo conforme modo. Renderização condicional pra não pagar
          o custo do AdminVipReports (que faz queries pesadas) quando
          o admin tá só na lista. */}
      {mode === 'subscribers' ? <VipTab /> : <AdminVipReports supabase={ctrl.supabase} />}
    </div>
  )
}

export default VipTabUnified
