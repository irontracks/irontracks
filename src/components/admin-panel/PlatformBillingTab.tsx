'use client'
/**
 * PlatformBillingTab — admin-only tab "PLATAFORMA" (Painel de Controle).
 *
 * Concentra TUDO relacionado à cobrança que o IronTracks faz dos professores
 * (≠ TeacherBillingTab, que é o professor cobrando os alunos dele).
 *
 * Hoje: hospeda o BillingDiagnosticPanel (health checks + simulador).
 * Futuro: pode receber métricas de receita, lista de inadimplentes, ações
 * em massa (forçar suspensão, conceder cortesias), etc.
 */
import React from 'react'
import { CreditCard } from 'lucide-react'
import { useAdminPanel } from './AdminPanelContext'
import { BillingDiagnosticPanel } from './BillingDiagnosticPanel'

export function PlatformBillingTab() {
  const { isAdmin } = useAdminPanel()

  if (!isAdmin) {
    return (
      <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/40">
        <p className="text-sm text-neutral-400">Apenas administradores têm acesso a esta aba.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-transparent p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center flex-shrink-0">
            <CreditCard size={20} className="text-yellow-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-white font-black text-lg leading-tight">Cobrança da Plataforma</h2>
            <p className="text-xs text-neutral-400 mt-1">
              Tudo que o IronTracks cobra dos professores. Diagnóstico ao vivo + simulador
              para testar sem queimar Mercado Pago, lista de assinantes ativos e ações
              administrativas.
            </p>
          </div>
        </div>
      </div>

      <BillingDiagnosticPanel />
    </div>
  )
}
