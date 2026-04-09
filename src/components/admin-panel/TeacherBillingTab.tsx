'use client'
/**
 * TeacherBillingTab — gestão de planos de serviço e assinaturas dos alunos.
 * Visível apenas para professores na aba "COBRANÇAS" do AdminPanelV2.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Plus, Edit2, PowerOff, Power, RefreshCw, Users, CreditCard, CheckCircle2, Clock, AlertCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import dynamic from 'next/dynamic'
import { apiTeacherServicePlans } from '@/lib/api/student-billing'
import type { ServicePlan, StudentSubscription } from '@/lib/api/student-billing'
import { useAdminPanel } from './AdminPanelContext'

const ServicePlanModal = dynamic(() => import('@/components/teacher/ServicePlanModal'), { ssr: false })

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const INTERVAL_LABELS: Record<string, string> = {
  once: 'Avulso',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  active:   { label: 'Ativo',     icon: <CheckCircle2 size={12} />, cls: 'text-green-400 bg-green-500/10 border-green-500/20' },
  pending:  { label: 'Pendente',  icon: <Clock size={12} />,        cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  past_due: { label: 'Em atraso', icon: <AlertCircle size={12} />,  cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  cancelled:{ label: 'Cancelado', icon: <XCircle size={12} />,      cls: 'text-neutral-400 bg-neutral-700/30 border-neutral-600/20' },
  expired:  { label: 'Expirado',  icon: <XCircle size={12} />,      cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
}

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch { return '—' }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, icon: null, cls: 'text-neutral-400 bg-neutral-700/30 border-neutral-600/20' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  )
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  subscriberCount,
  onEdit,
  onToggle,
  toggling,
}: {
  plan: ServicePlan
  subscriberCount: number
  onEdit: () => void
  onToggle: () => void
  toggling: boolean
}) {
  return (
    <div className={`rounded-2xl border p-4 transition-all ${plan.is_active ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-900/30 border-neutral-800/40 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-white text-sm truncate">{plan.name}</p>
            {!plan.is_active && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-700/40 text-neutral-500 border border-neutral-700/40 uppercase tracking-wide">Inativo</span>
            )}
          </div>
          {plan.description && (
            <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{plan.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-yellow-400 font-black text-base">{fmtBRL(plan.price_cents)}</span>
            <span className="text-neutral-500 text-xs">{INTERVAL_LABELS[plan.billing_interval] ?? plan.billing_interval}</span>
            <span className="text-neutral-600 text-xs">·</span>
            <span className="text-neutral-500 text-xs">{plan.duration_days}d</span>
            {plan.sessions_per_week != null && (
              <>
                <span className="text-neutral-600 text-xs">·</span>
                <span className="text-neutral-500 text-xs">{plan.sessions_per_week}×/sem</span>
              </>
            )}
            {subscriberCount > 0 && (
              <>
                <span className="text-neutral-600 text-xs">·</span>
                <span className="text-neutral-500 text-xs flex items-center gap-1"><Users size={10} />{subscriberCount} aluno{subscriberCount !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>
          {plan.training_days && plan.training_days.length > 0 && (
            <p className="text-[11px] text-neutral-600 mt-1 uppercase tracking-wide">
              {plan.training_days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(' · ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
            aria-label="Editar plano"
          >
            <Edit2 size={14} />
          </button>
          <button
            type="button"
            onClick={onToggle}
            disabled={toggling}
            className={`p-2 rounded-xl transition-colors ${plan.is_active ? 'bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400' : 'bg-neutral-800 hover:bg-green-500/20 text-neutral-400 hover:text-green-400'}`}
            aria-label={plan.is_active ? 'Desativar plano' : 'Ativar plano'}
          >
            {plan.is_active ? <PowerOff size={14} /> : <Power size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Subscription row ─────────────────────────────────────────────────────────

function SubscriptionRow({
  sub,
  plans,
  onAssign,
  assigning,
}: {
  sub: { studentUserId: string; studentName: string; subscription: StudentSubscription | null }
  plans: ServicePlan[]
  onAssign: (studentUserId: string, planId: string) => void
  assigning: boolean
}) {
  const [open, setOpen] = useState(false)
  const activePlans = plans.filter(p => p.is_active)

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{sub.studentName}</p>
          {sub.subscription ? (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={sub.subscription.status} />
              {sub.subscription.student_service_plans?.name && (
                <span className="text-xs text-neutral-400">{sub.subscription.student_service_plans.name}</span>
              )}
              {sub.subscription.expires_at && (
                <span className="text-[11px] text-neutral-600">até {fmtDate(sub.subscription.expires_at)}</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-neutral-600 mt-0.5">Sem plano</p>
          )}
        </div>
        {activePlans.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold transition-colors"
          >
            <CreditCard size={12} />
            {sub.subscription ? 'Trocar' : 'Atribuir'}
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {open && activePlans.length > 0 && (
        <div className="mt-3 pt-3 border-t border-neutral-800/60 space-y-2">
          <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold mb-2">Selecione um plano:</p>
          {activePlans.map(plan => (
            <button
              key={plan.id}
              type="button"
              disabled={assigning}
              onClick={() => { onAssign(sub.studentUserId, plan.id); setOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-semibold text-white">{plan.name}</p>
                <p className="text-xs text-neutral-400">{fmtBRL(plan.price_cents)} · {INTERVAL_LABELS[plan.billing_interval] ?? plan.billing_interval}</p>
              </div>
              <Plus size={14} className="text-yellow-400 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function TeacherBillingTab() {
  const { usersList } = useAdminPanel()

  // Plans state
  const [plans, setPlans] = useState<ServicePlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)

  // Subscriptions state
  const [subscriptions, setSubscriptions] = useState<StudentSubscription[]>([])
  const [subsLoading, setSubsLoading] = useState(true)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<ServicePlan | null>(null)

  // Toggle state (deactivate/activate)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Assign state
  const [assigningId, setAssigningId] = useState<string | null>(null)

  // ── Fetch plans ──────────────────────────────────────────────
  const fetchPlans = useCallback(async () => {
    setPlansLoading(true)
    setPlansError(null)
    try {
      const res = await apiTeacherServicePlans.list()
      setPlans(Array.isArray(res.plans) ? res.plans : [])
    } catch (e: unknown) {
      setPlansError(e instanceof Error ? e.message : 'Erro ao carregar planos.')
    } finally {
      setPlansLoading(false)
    }
  }, [])

  const fetchSubscriptions = useCallback(async () => {
    setSubsLoading(true)
    try {
      const res = await apiTeacherServicePlans.listSubscriptions()
      setSubscriptions(Array.isArray(res.subscriptions) ? res.subscriptions : [])
    } catch {
      setSubscriptions([])
    } finally {
      setSubsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchPlans()
    void fetchSubscriptions()
  }, [fetchPlans, fetchSubscriptions])

  // ── Toggle plan active/inactive ──────────────────────────────
  const handleToggle = useCallback(async (plan: ServicePlan) => {
    setTogglingId(plan.id)
    try {
      await apiTeacherServicePlans.update(plan.id, { is_active: !plan.is_active })
      await fetchPlans()
    } catch {
      // silently ignore
    } finally {
      setTogglingId(null)
    }
  }, [fetchPlans])

  // ── Assign plan to student ────────────────────────────────────
  const handleAssign = useCallback(async (studentUserId: string, planId: string) => {
    setAssigningId(studentUserId)
    try {
      await apiTeacherServicePlans.assignPlan(studentUserId, planId)
      await fetchSubscriptions()
    } catch {
      // silently ignore
    } finally {
      setAssigningId(null)
    }
  }, [fetchSubscriptions])

  // ── Build student rows ────────────────────────────────────────
  // usersList may contain teacher's students; subscriptions contain subscription records
  const studentRows = React.useMemo(() => {
    const myStudents = Array.isArray(usersList) ? usersList : []
    return myStudents.map(student => {
      const studentUserId = String(student?.user_id || student?.id || '')
      const sub = subscriptions.find(s => s.student_user_id === studentUserId) ?? null
      return {
        studentUserId,
        studentName: String(student?.name || student?.email || studentUserId || 'Aluno'),
        subscription: sub,
      }
    }).filter(row => row.studentUserId)
  }, [usersList, subscriptions])

  // Count subscribers per plan
  const subscriberCounts = React.useMemo(() => {
    const map: Record<string, number> = {}
    subscriptions.forEach(sub => {
      if (sub.plan_id && ['active', 'pending', 'past_due'].includes(sub.status)) {
        map[sub.plan_id] = (map[sub.plan_id] || 0) + 1
      }
    })
    return map
  }, [subscriptions])

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── Plans Section ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-black text-base uppercase tracking-widest">Planos de Serviço</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Crie e gerencie os planos que oferece aos alunos</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchPlans()}
              className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
              aria-label="Recarregar planos"
            >
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              onClick={() => { setEditingPlan(null); setModalOpen(true) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs transition-colors"
            >
              <Plus size={14} /> Novo Plano
            </button>
          </div>
        </div>

        {plansLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
          </div>
        ) : plansError ? (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{plansError}</div>
        ) : plans.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-8 text-center">
            <CreditCard size={32} className="text-neutral-600 mx-auto mb-3" />
            <p className="text-neutral-400 font-semibold text-sm">Nenhum plano criado</p>
            <p className="text-neutral-600 text-xs mt-1">Clique em &ldquo;Novo Plano&rdquo; para começar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                subscriberCount={subscriberCounts[plan.id] ?? 0}
                onEdit={() => { setEditingPlan(plan); setModalOpen(true) }}
                onToggle={() => void handleToggle(plan)}
                toggling={togglingId === plan.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Subscriptions Section ─────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-black text-base uppercase tracking-widest">Assinaturas dos Alunos</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Atribua planos e acompanhe o status de cada aluno</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchSubscriptions()}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
            aria-label="Recarregar assinaturas"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {subsLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
          </div>
        ) : studentRows.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-8 text-center">
            <Users size={32} className="text-neutral-600 mx-auto mb-3" />
            <p className="text-neutral-400 font-semibold text-sm">Nenhum aluno vinculado</p>
            <p className="text-neutral-600 text-xs mt-1">Adicione alunos na aba de Alunos primeiro.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {studentRows.map(row => (
              <SubscriptionRow
                key={row.studentUserId}
                sub={row}
                plans={plans}
                onAssign={handleAssign}
                assigning={assigningId === row.studentUserId}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Service Plan Modal ────────────────────────────────── */}
      <ServicePlanModal
        open={modalOpen}
        plan={editingPlan}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false)
          void fetchPlans()
        }}
      />
    </div>
  )
}
