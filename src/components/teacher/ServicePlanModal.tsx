'use client'
/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
/**
 * ServicePlanModal — editor completo de planos de serviço do professor.
 * Cria ou edita um student_service_plan.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { X, Save, Loader2, DollarSign, Clock, Calendar, RefreshCw, FileText } from 'lucide-react'
import { apiTeacherServicePlans } from '@/lib/api/student-billing'
import type { ServicePlan, BillingInterval, TrainingDay } from '@/lib/api/student-billing'

// ─── helpers ─────────────────────────────────────────────────────────────────

const INTERVAL_LABELS: Record<BillingInterval, string> = {
  once: 'Avulso (pagamento único)',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
}

const INTERVAL_DAYS: Record<BillingInterval, number> = {
  once: 30, monthly: 30, quarterly: 90, semiannual: 180, yearly: 365,
}

const WEEK_DAYS: { key: TrainingDay; label: string }[] = [
  { key: 'seg', label: 'Seg' }, { key: 'ter', label: 'Ter' },
  { key: 'qua', label: 'Qua' }, { key: 'qui', label: 'Qui' },
  { key: 'sex', label: 'Sex' }, { key: 'sab', label: 'Sáb' },
  { key: 'dom', label: 'Dom' },
]

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ─── default form state ───────────────────────────────────────────────────────

const DEFAULT: Omit<ServicePlan, 'id' | 'teacher_user_id' | 'created_at' | 'updated_at'> = {
  name: '',
  description: '',
  price_cents: 0,
  currency: 'BRL',
  billing_interval: 'monthly',
  duration_days: 30,
  sessions_per_week: null,
  session_duration_minutes: 60,
  training_days: [],
  notes: '',
  is_active: true,
}

// ─── component ───────────────────────────────────────────────────────────────

interface ServicePlanModalProps {
  open: boolean
  plan?: ServicePlan | null       // null = create mode
  onClose: () => void
  onSaved: (plan: ServicePlan) => void
}

export default function ServicePlanModal({ open, plan, onClose, onSaved }: ServicePlanModalProps) {
  const [form, setForm] = useState({ ...DEFAULT })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(plan ? {
        name: plan.name,
        description: plan.description ?? '',
        price_cents: plan.price_cents,
        currency: plan.currency,
        billing_interval: plan.billing_interval,
        duration_days: plan.duration_days,
        sessions_per_week: plan.sessions_per_week ?? null,
        session_duration_minutes: plan.session_duration_minutes ?? 60,
        training_days: plan.training_days ?? [],
        notes: plan.notes ?? '',
        is_active: plan.is_active,
      } : { ...DEFAULT })
      setError(null)
    }
  }, [open, plan])

  const set = useCallback(<K extends keyof typeof form>(key: K, value: typeof form[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }, [])

  const toggleDay = useCallback((day: TrainingDay) => {
    setForm(prev => ({
      ...prev,
      training_days: prev.training_days.includes(day)
        ? prev.training_days.filter(d => d !== day)
        : [...prev.training_days, day],
    }))
  }, [])

  const handleIntervalChange = useCallback((interval: BillingInterval) => {
    setForm(prev => ({
      ...prev,
      billing_interval: interval,
      duration_days: INTERVAL_DAYS[interval],
    }))
  }, [])

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { setError('Informe o nome do plano.'); return }
    if (form.price_cents < 0) { setError('Valor inválido.'); return }
    setSaving(true)
    setError(null)
    try {
      let result: { ok: boolean; plan: ServicePlan }
      if (plan?.id) {
        result = await apiTeacherServicePlans.update(plan.id, form) as { ok: boolean; plan: ServicePlan }
      } else {
        result = await apiTeacherServicePlans.create(form) as { ok: boolean; plan: ServicePlan }
      }
      if (!result.ok) { setError('Erro ao salvar plano.'); return }
      onSaved(result.plan)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setSaving(false)
    }
  }, [form, plan, onSaved])

  if (!open) return null

  const priceReal = form.price_cents / 100

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-t-2xl sm:rounded-2xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-neutral-800 flex-shrink-0">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-widest">Plano de Cobrança</p>
            <h2 className="text-white font-bold text-lg">{plan ? 'Editar Plano' : 'Novo Plano'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">

          {/* Nome */}
          <div>
            <label htmlFor="sp-name" className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wide">Nome do Plano *</label>
            <input
              id="sp-name"
              aria-label="Nome do plano"
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Ex: Mensal Premium, Trimestral Hipertrofia..."
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
            />
          </div>

          {/* Descrição */}
          <div>
            <label htmlFor="sp-desc" className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wide">Descrição</label>
            <textarea
              id="sp-desc"
              aria-label="Descrição do plano"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="O que está incluso neste plano..."
              rows={2}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60 resize-none"
            />
          </div>

          {/* Valor */}
          <div>
            <label htmlFor="sp-price" className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wide flex items-center gap-1">
              <DollarSign size={11} /> Valor (R$)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 text-sm font-bold">R$</span>
              <input
                id="sp-price"
                aria-label="Valor do plano em reais"
                type="number"
                min={0}
                step={0.01}
                value={priceReal || ''}
                onChange={e => set('price_cents', Math.round(parseFloat(e.target.value || '0') * 100))}
                placeholder="0,00"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
              />
            </div>
            {form.price_cents > 0 && (
              <p className="text-xs text-neutral-500 mt-1">{fmtBRL(form.price_cents)}</p>
            )}
          </div>

          {/* Cobrança */}
          <div>
            <p className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wide flex items-center gap-1">
              <RefreshCw size={11} /> Tipo de Cobrança
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(INTERVAL_LABELS) as BillingInterval[]).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleIntervalChange(key)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                    form.billing_interval === key
                      ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-400'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  {INTERVAL_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          {/* Duração */}
          <div>
            <label htmlFor="sp-days" className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wide flex items-center gap-1">
              <Calendar size={11} /> Duração (dias)
            </label>
            <input
              id="sp-days"
              aria-label="Duração do plano em dias"
              type="number"
              min={1}
              max={3650}
              value={form.duration_days}
              onChange={e => set('duration_days', Math.max(1, parseInt(e.target.value || '1', 10)))}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-500/60"
            />
          </div>

          {/* Dias de treino */}
          <div>
            <p className="text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wide">Dias de Treino</p>
            <div className="flex gap-2 flex-wrap">
              {WEEK_DAYS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDay(key)}
                  className={`w-12 h-10 rounded-xl text-xs font-bold border transition-all ${
                    form.training_days.includes(key)
                      ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {form.training_days.length > 0 && (
              <p className="text-xs text-neutral-500 mt-1.5">
                {form.training_days.length}x/semana — {form.training_days.map(d => WEEK_DAYS.find(w => w.key === d)?.label).join(', ')}
              </p>
            )}
          </div>

          {/* Tempo de treino */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sp-duration" className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <Clock size={11} /> Duração/sessão (min)
              </label>
              <input
                id="sp-duration"
                aria-label="Duração de cada sessão em minutos"
                type="number"
                min={15}
                max={300}
                step={5}
                value={form.session_duration_minutes ?? ''}
                onChange={e => set('session_duration_minutes', parseInt(e.target.value || '0', 10) || null)}
                placeholder="60"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
              />
            </div>
            <div>
              <label htmlFor="sp-sessions" className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wide">
                Sessões/semana
              </label>
              <input
                id="sp-sessions"
                aria-label="Número de sessões por semana"
                type="number"
                min={1}
                max={7}
                value={form.sessions_per_week ?? ''}
                onChange={e => set('sessions_per_week', parseInt(e.target.value || '0', 10) || null)}
                placeholder="3"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
              />
            </div>
          </div>

          {/* Observações */}
          <div>
            <label htmlFor="sp-notes" className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wide flex items-center gap-1">
              <FileText size={11} /> Observações para o aluno
            </label>
            <textarea
              id="sp-notes"
              aria-label="Observações para o aluno"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Regras, benefícios, o que esperar do plano..."
              rows={3}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
          )}
        </div>

        {/* footer */}
        <div className="px-5 pb-5 pt-3 border-t border-neutral-800 flex-shrink-0">
          <button
            onClick={() => void handleSave()}
            disabled={saving || !form.name.trim()}
            className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Salvando…' : plan ? 'Salvar Alterações' : 'Criar Plano'}
          </button>
        </div>
      </div>
    </div>
  )
}
