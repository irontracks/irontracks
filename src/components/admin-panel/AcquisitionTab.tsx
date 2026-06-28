'use client'

/**
 * AcquisitionTab — tab que linka pra página completa de análise de
 * aquisição em `/admin/acquisition`.
 *
 * Optei por linkar em vez de embedar porque a página atual é SSR com
 * queries pesadas — extraí-la em componente client seria refactor grande
 * sem ganho UX. Tab serve só pra dar visibilidade no menu.
 */

import { TrendingUp, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function AcquisitionTab() {
  const router = useRouter()

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div
        className="rounded-2xl border p-5"
        style={{ background: 'rgba(245,158,11,0.04)', borderColor: 'rgba(245,158,11,0.18)' }}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <TrendingUp size={20} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-black text-white mb-1">Análise de Aquisição</h2>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Funil de novos usuários: de onde vieram, qual campanha trouxe quem, taxa de conversão para VIP por origem.
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => router.push('/admin/acquisition')}
        className="w-full flex items-center justify-between gap-3 p-5 rounded-2xl border transition-all active:scale-[0.99] hover:bg-yellow-500/5"
        style={{ background: 'rgba(234,179,8,0.06)', borderColor: 'rgba(234,179,8,0.30)' }}
      >
        <div className="text-left">
          <p className="text-sm font-black text-white">Abrir análise completa</p>
          <p className="text-xs text-neutral-400 mt-0.5">UTM, campanhas, dispositivo, conversões</p>
        </div>
        <ExternalLink size={20} className="text-yellow-400 shrink-0" />
      </button>
    </div>
  )
}

export default AcquisitionTab
