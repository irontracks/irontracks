'use client'
/**
 * BillingDiagnosticPanel
 *
 * Admin-only panel inside SystemTab. Two halves:
 *
 *   ── Diagnóstico ──
 *   Calls /api/admin/billing-diagnostic and renders ✅ / ⚠️ / ❌ for each
 *   moving part of the teacher billing pipeline (teacher_tiers, MP token,
 *   env vars, existing data). Refresh button re-runs every check.
 *
 *   ── Simulação ──
 *   Lets the admin pick a teacher + plan and POSTs to
 *   /api/admin/simulate-teacher-payment. Mirrors the real webhook activation
 *   end-to-end — useful for smoke-testing before the first real customer pays.
 *   The resulting invoice is marked `raw.simulated = true`.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { CreditCard, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Beaker, Loader2 } from 'lucide-react'
import { apiAdmin } from '@/lib/api'
import { useAdminPanel } from './AdminPanelContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiagnosticCheck {
  ok: boolean
  message: string
  data?: Record<string, unknown>
}

interface DiagnosticResponse {
  ok: boolean
  ready_to_charge: boolean
  checks: Record<string, DiagnosticCheck>
  timestamp: string
}

interface SimulationResult {
  ok: boolean
  error?: string
  simulated_payment_id?: string
  teacher?: { id: string; name: string; email: string }
  plan?: { tier_key: string; name: string; price_cents: number }
  plan_valid_until?: string
}

interface TeacherOption {
  user_id: string | null
  id: string
  name: string
  email: string
}

const PLAN_OPTIONS = [
  { value: 'starter',   label: 'Starter — R$ 49/mês (15 alunos)' },
  { value: 'pro',       label: 'Pro — R$ 97/mês (40 alunos)' },
  { value: 'elite',     label: 'Elite — R$ 179/mês (100 alunos)' },
  { value: 'unlimited', label: 'Unlimited — R$ 249/mês (ilimitado)' },
] as const

const CHECK_LABELS: Record<string, string> = {
  teacher_tiers: 'Tabela teacher_tiers',
  mercadopago:   'Mercado Pago (token + identidade)',
  env_vars:      'Variáveis de ambiente',
  data:          'Dados de produção',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CheckRow({ name, check }: { name: string; check: DiagnosticCheck }) {
  const Icon = check.ok ? CheckCircle2 : XCircle
  const colorClass = check.ok ? 'text-emerald-400' : 'text-red-400'
  const borderClass = check.ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'

  return (
    <div className={`rounded-xl border ${borderClass} p-3`}>
      <div className="flex items-start gap-2">
        <Icon size={16} className={`flex-shrink-0 mt-0.5 ${colorClass}`} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white text-sm">{CHECK_LABELS[name] ?? name}</p>
          <p className="text-xs text-neutral-300 mt-0.5 break-words">{check.message}</p>
          {check.data ? (
            <details className="mt-1.5">
              <summary className="text-[10px] text-neutral-500 cursor-pointer hover:text-neutral-300">Ver detalhes</summary>
              <pre className="mt-1 text-[10px] text-neutral-400 bg-neutral-900/60 rounded-lg p-2 overflow-x-auto max-h-48 overflow-y-auto">
                {JSON.stringify(check.data, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BillingDiagnosticPanel() {
  const { getAdminAuthHeaders } = useAdminPanel()
  const [diagnostic, setDiagnostic] = useState<DiagnosticResponse | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagError, setDiagError] = useState('')

  // Simulator state
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [loadingTeachers, setLoadingTeachers] = useState(false)
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<typeof PLAN_OPTIONS[number]['value']>('pro')
  const [simBusy, setSimBusy] = useState(false)
  const [simResult, setSimResult] = useState<SimulationResult | null>(null)
  const [simError, setSimError] = useState('')

  // ── Initial loads ─────────────────────────────────────────────────────
  const runDiagnostic = useCallback(async () => {
    setDiagLoading(true)
    setDiagError('')
    try {
      const headers = await getAdminAuthHeaders()
      const res = await apiAdmin.getBillingDiagnostic(headers)
      setDiagnostic(res as DiagnosticResponse)
    } catch (e) {
      setDiagError(e instanceof Error ? e.message : 'Falha ao carregar diagnóstico.')
    } finally {
      setDiagLoading(false)
    }
  }, [getAdminAuthHeaders])

  const loadTeachers = useCallback(async () => {
    setLoadingTeachers(true)
    try {
      const headers = await getAdminAuthHeaders()
      const res = await apiAdmin.listTeachers(headers)
      const list = Array.isArray((res as { teachers?: unknown[] })?.teachers)
        ? (res as { teachers: unknown[] }).teachers
        : []
      const safe: TeacherOption[] = list
        .map((t) => {
          if (!t || typeof t !== 'object') return null
          const r = t as Record<string, unknown>
          return {
            id: String(r.id ?? ''),
            user_id: r.user_id ? String(r.user_id) : null,
            name: String(r.name ?? ''),
            email: String(r.email ?? ''),
          }
        })
        .filter((t): t is TeacherOption => !!t && !!t.user_id)
      setTeachers(safe)
    } catch {
      setTeachers([])
    } finally {
      setLoadingTeachers(false)
    }
  }, [getAdminAuthHeaders])

  useEffect(() => {
    void runDiagnostic()
    void loadTeachers()
  }, [runDiagnostic, loadTeachers])

  // ── Simulation handler ────────────────────────────────────────────────
  const handleSimulate = useCallback(async () => {
    if (!selectedTeacherId) return
    setSimBusy(true)
    setSimError('')
    setSimResult(null)
    try {
      const headers = await getAdminAuthHeaders()
      const res = await apiAdmin.simulateTeacherPayment(
        { teacherUserId: selectedTeacherId, planId: selectedPlan },
        headers,
      )
      if (!res.ok) {
        setSimError(res.error ?? 'Falha ao simular pagamento.')
      } else {
        setSimResult(res as SimulationResult)
        // Refresh teacher list so the new plan_status is visible
        void loadTeachers()
      }
    } catch (e) {
      setSimError(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setSimBusy(false)
    }
  }, [selectedTeacherId, selectedPlan, getAdminAuthHeaders, loadTeachers])

  const readyBanner = diagnostic ? (
    diagnostic.ready_to_charge ? (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2">
        <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
        <p className="text-sm font-bold text-emerald-200">Sistema pronto pra cobrar.</p>
      </div>
    ) : (
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 flex items-center gap-2">
        <AlertTriangle size={18} className="text-yellow-400 flex-shrink-0" />
        <p className="text-sm font-bold text-yellow-200">Há checagens falhando — confira abaixo antes de cobrar.</p>
      </div>
    )
  ) : null

  return (
    <div className="p-6 rounded-2xl shadow-sm" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-black text-white text-lg flex items-center gap-2">
          <CreditCard size={20} className="text-yellow-500" />
          Diagnóstico de Cobrança
        </h3>
        <button
          onClick={() => void runDiagnostic()}
          disabled={diagLoading}
          className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-bold text-neutral-200 inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw size={13} className={diagLoading ? 'animate-spin' : ''} />
          {diagLoading ? 'Verificando…' : 'Atualizar'}
        </button>
      </div>

      {diagError && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 mb-3">
          {diagError}
        </div>
      )}

      {readyBanner}

      <div className="grid grid-cols-1 gap-2 mt-3">
        {diagLoading && !diagnostic ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-yellow-400" />
          </div>
        ) : (
          diagnostic && Object.entries(diagnostic.checks).map(([name, check]) => (
            <CheckRow key={name} name={name} check={check} />
          ))
        )}
      </div>

      {diagnostic?.timestamp && (
        <p className="text-[10px] text-neutral-500 mt-2 text-right">
          Atualizado em {new Date(diagnostic.timestamp).toLocaleString('pt-BR')}
        </p>
      )}

      {/* ── Simulator ──────────────────────────────────────────────── */}
      <div className="mt-6 pt-5 border-t border-neutral-800">
        <h4 className="font-black text-white text-sm mb-1 flex items-center gap-2">
          <Beaker size={16} className="text-amber-400" />
          Simulador de Pagamento
        </h4>
        <p className="text-xs text-neutral-400 mb-3">
          Ativa um plano para o professor escolhido <strong>sem tocar no Mercado Pago</strong>.
          A fatura criada fica marcada como <code className="text-amber-300">raw.simulated = true</code>.
        </p>

        <div className="space-y-2">
          <div>
            <label htmlFor="sim-teacher" className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-1 block">Professor</label>
            <select
              id="sim-teacher"
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              disabled={loadingTeachers || simBusy}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
            >
              <option value="">{loadingTeachers ? 'Carregando…' : '— escolha um professor —'}</option>
              {teachers.map((t) => (
                <option key={t.id} value={String(t.user_id)}>
                  {t.name || '(sem nome)'} — {t.email || t.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sim-plan" className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-1 block">Plano</label>
            <select
              id="sim-plan"
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value as typeof PLAN_OPTIONS[number]['value'])}
              disabled={simBusy}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60"
            >
              {PLAN_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => void handleSimulate()}
            disabled={!selectedTeacherId || simBusy}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm transition-colors flex items-center justify-center gap-2"
          >
            {simBusy ? <Loader2 size={14} className="animate-spin" /> : <Beaker size={14} />}
            {simBusy ? 'Ativando…' : 'Simular ativação'}
          </button>
        </div>

        {simError && (
          <div className="mt-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2">
            {simError}
          </div>
        )}
        {simResult && simResult.ok && (
          <div className="mt-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs px-3 py-2 space-y-1">
            <p className="font-bold">✅ Plano ativado (simulação)</p>
            {simResult.teacher && (
              <p>Professor: {simResult.teacher.name} ({simResult.teacher.email})</p>
            )}
            {simResult.plan && (
              <p>Plano: {simResult.plan.name} — R$ {(simResult.plan.price_cents / 100).toFixed(2)}</p>
            )}
            {simResult.plan_valid_until && (
              <p>Válido até: {new Date(simResult.plan_valid_until).toLocaleDateString('pt-BR')}</p>
            )}
            {simResult.simulated_payment_id && (
              <p className="text-[10px] text-emerald-300/70">
                ID: <code>{simResult.simulated_payment_id}</code>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
