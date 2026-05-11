'use client'

/**
 * FinanceTabUnified — agrupa tudo que envolve dinheiro:
 *   - Cobranças: planos de serviço do professor cobrando alunos
 *   - Plataforma: cobrança do IronTracks SaaS contra o professor
 *
 * Antes: 2 tabs separadas no menu, confuso saber qual tinha o quê.
 * Agora: 1 tab "Financeiro" com toggle interno.
 *
 * Visibilidade:
 *   - Aba "Cobranças" aparece pra qualquer admin/teacher
 *   - Aba "Plataforma" só aparece pra admin (já tem guard interno)
 */

import { useState } from 'react'
import { CreditCard, Building2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useAdminPanel } from './AdminPanelContext'

const TeacherBillingTab = dynamic(() => import('./TeacherBillingTab'), { ssr: false })
const PlatformBillingTab = dynamic(
  () => import('./PlatformBillingTab').then(m => ({ default: m.PlatformBillingTab })),
  { ssr: false },
)

type FinanceMode = 'student_billing' | 'platform_billing'

export function FinanceTabUnified() {
  const { isAdmin } = useAdminPanel()
  // Default mode: 'student_billing' (cobranças) pra todos. Admin pode
  // alternar pra ver a cobrança da plataforma.
  const [mode, setMode] = useState<FinanceMode>('student_billing')

  // Teacher (não admin) só vê cobranças dos alunos — sem toggle.
  if (!isAdmin) {
    return <TeacherBillingTab />
  }

  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          type="button"
          onClick={() => setMode('student_billing')}
          className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all duration-200 active:scale-[0.98] ${
            mode === 'student_billing'
              ? 'bg-yellow-500 text-black shadow-md shadow-yellow-500/20'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <CreditCard size={14} strokeWidth={2.4} />
          Cobranças
        </button>
        <button
          type="button"
          onClick={() => setMode('platform_billing')}
          className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all duration-200 active:scale-[0.98] ${
            mode === 'platform_billing'
              ? 'bg-yellow-500 text-black shadow-md shadow-yellow-500/20'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Building2 size={14} strokeWidth={2.4} />
          Plataforma
        </button>
      </div>

      {mode === 'student_billing' ? <TeacherBillingTab /> : <PlatformBillingTab />}
    </div>
  )
}

export default FinanceTabUnified
