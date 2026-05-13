'use client'
/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
/**
 * TeacherUpgradeModal
 * Full-screen modal for upgrading the teacher's plan.
 * Step 1 — Plan selection
 * Step 2 — PIX checkout (QR code + copy-paste payload)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X, Check, Loader2, Copy, CheckCheck, Zap, Users, Crown, Receipt, ArrowLeft, Repeat, ExternalLink } from 'lucide-react'
import { apiTeacherBilling } from '@/lib/api/teacher-billing'
import type {
  TeacherPlanRow,
  TeacherCheckoutResult,
  TeacherInvoiceRow,
  TeacherActiveSubscription,
} from '@/lib/api/teacher-billing'
import type { TeacherPlanState } from '@/hooks/useTeacherPlan'

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const maskCpf = (v: string) => v.replace(/\D/g, '').slice(0, 11)
const maskPhone = (v: string) => v.replace(/\D/g, '').slice(0, 11)
const maskName = (v: string) => v.slice(0, 80)

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free: <Users size={16} />,
  starter: <Zap size={16} />,
  pro: <Zap size={16} className="text-yellow-400" />,
  elite: <Crown size={16} className="text-yellow-400" />,
  unlimited: <Crown size={16} className="text-amber-300" />,
}

// ─── types ────────────────────────────────────────────────────────────────────

interface TeacherUpgradeModalProps {
  open: boolean
  onClose: () => void
  planState: TeacherPlanState
}

type Step = 'plans' | 'checkout' | 'pix' | 'invoices'

// ─── invoice helpers ─────────────────────────────────────────────────────────

const fmtDateBR = (iso: string | null) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return '—' }
}

const STATUS_LABELS: Record<string, { label: string; tone: 'pending' | 'ok' | 'bad' | 'neutral' }> = {
  pending:    { label: 'Aguardando',  tone: 'pending' },
  approved:   { label: 'Pago',        tone: 'ok' },
  refunded:   { label: 'Estornado',   tone: 'bad' },
  cancelled:  { label: 'Cancelado',   tone: 'bad' },
  charged_back: { label: 'Chargeback', tone: 'bad' },
}

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = STATUS_LABELS[status] ?? { label: status, tone: 'neutral' as const }
  const cls = cfg.tone === 'ok'
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : cfg.tone === 'pending'
      ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
      : cfg.tone === 'bad'
        ? 'bg-red-500/15 text-red-400 border-red-500/30'
        : 'bg-neutral-500/15 text-neutral-400 border-neutral-500/30'
  return (
    <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${cls}`}>
      {cfg.label}
    </span>
  )
}

// ─── component ───────────────────────────────────────────────────────────────

export default function TeacherUpgradeModal({ open, onClose, planState }: TeacherUpgradeModalProps) {
  const [step, setStep] = useState<Step>('plans')
  const [plans, setPlans] = useState<TeacherPlanRow[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<TeacherPlanRow | null>(null)

  // checkout form
  const [cpf, setCpf] = useState('')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // pix result
  const [pixResult, setPixResult] = useState<TeacherCheckoutResult | null>(null)
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // invoices tab
  const [invoices, setInvoices] = useState<TeacherInvoiceRow[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [activeInvoice, setActiveInvoice] = useState<TeacherInvoiceRow | null>(null)
  const [copiedInvoiceId, setCopiedInvoiceId] = useState<string | null>(null)

  // recurring subscription state
  const [activeSubscription, setActiveSubscription] = useState<TeacherActiveSubscription | null>(null)
  const [recurringLoading, setRecurringLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)

  const loadInvoices = useCallback(async () => {
    setLoadingInvoices(true)
    try {
      const res = await apiTeacherBilling.getInvoices()
      setInvoices(Array.isArray(res?.invoices) ? res.invoices : [])
    } catch {
      setInvoices([])
    } finally {
      setLoadingInvoices(false)
    }
  }, [])

  const loadActiveSubscription = useCallback(async () => {
    try {
      const res = await apiTeacherBilling.getActiveSubscription()
      setActiveSubscription(res?.subscription ?? null)
    } catch {
      setActiveSubscription(null)
    }
  }, [])

  /** Start a recurring subscription via MercadoPago Preapproval. The init_point
   *  URL opens MP's hosted checkout (in a new tab on web, in the system browser
   *  on Capacitor) where the user picks card/PIX and authorises. */
  const handleStartRecurring = useCallback(async () => {
    if (!selectedPlan) return
    setRecurringLoading(true)
    setCheckoutError(null)
    try {
      const result = await apiTeacherBilling.checkoutRecurring({ planId: selectedPlan.tier_key })
      if (!result.ok || !result.init_point) {
        setCheckoutError(result.error ?? 'Erro ao iniciar assinatura.')
        return
      }
      // Open MP hosted checkout. Outside Capacitor: new tab. Inside: system browser.
      try {
        window.open(result.init_point, '_blank', 'noopener,noreferrer')
      } catch {
        // Fall back to same-window navigation
        window.location.href = result.init_point
      }
      // Reload subscription state shortly after — by the time the user comes
      // back, the webhook should have updated it.
      setTimeout(() => { void loadActiveSubscription() }, 4000)
    } catch (e: unknown) {
      setCheckoutError(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setRecurringLoading(false)
    }
  }, [selectedPlan, loadActiveSubscription])

  const handleCancelRecurring = useCallback(async () => {
    setCancelLoading(true)
    try {
      await apiTeacherBilling.cancelRecurring()
      await loadActiveSubscription()
    } catch {
      // swallow — user can retry
    } finally {
      setCancelLoading(false)
    }
  }, [loadActiveSubscription])

  // load plans + active subscription on open
  useEffect(() => {
    if (!open) return
    setStep('plans')
    setSelectedPlan(null)
    setCheckoutError(null)
    setPixResult(null)
    setLoadingPlans(true)
    apiTeacherBilling.getPlans()
      .then((r) => { setPlans((r.plans ?? []) as TeacherPlanRow[]) })
      .catch(() => {})
      .finally(() => setLoadingPlans(false))
    void loadActiveSubscription()
  }, [open, loadActiveSubscription])

  const handleSelectPlan = useCallback((plan: TeacherPlanRow) => {
    if (plan.price_cents === 0) return // free — nothing to pay
    setSelectedPlan(plan)
    setCheckoutError(null)
    setStep('checkout')
  }, [])

  const handleCheckout = useCallback(async () => {
    if (!selectedPlan) return
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const result = await apiTeacherBilling.checkout({
        planId: selectedPlan.tier_key,
        cpfCnpj: cpf.replace(/\D/g, ''),
        mobilePhone: phone.replace(/\D/g, ''),
        name: name.trim(),
      })
      if (!result.ok) {
        setCheckoutError(result.error ?? 'Erro ao gerar cobrança.')
        return
      }
      setPixResult(result)
      setStep('pix')
    } catch (e: unknown) {
      setCheckoutError(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setCheckoutLoading(false)
    }
  }, [selectedPlan, cpf, phone, name])

  const handleCopyPix = useCallback(() => {
    const payload = pixResult?.pix_payload
    if (!payload) return
    navigator.clipboard.writeText(String(payload)).then(() => {
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 3000)
    }).catch(() => {})
  }, [pixResult])

  if (!open) return null

  const currentPlanId = planState.plan?.tier_key ?? 'free'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-neutral-800 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {(step === 'invoices' && activeInvoice) && (
              <button
                onClick={() => setActiveInvoice(null)}
                className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors flex-shrink-0"
                aria-label="Voltar"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-xs text-neutral-400 uppercase tracking-widest font-medium">
                {step === 'invoices' ? 'Histórico' : 'Professor'}
              </p>
              <h2 className="text-white font-bold text-lg leading-tight truncate">
                {step === 'plans' && 'Escolha seu plano'}
                {step === 'checkout' && `Assinar ${selectedPlan?.name}`}
                {step === 'pix' && 'Pague com PIX'}
                {step === 'invoices' && (activeInvoice ? `Fatura ${activeInvoice.plan_name ?? ''}` : 'Minhas Faturas')}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {step === 'plans' && (
              <button
                onClick={() => { setStep('invoices'); void loadInvoices() }}
                className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                aria-label="Ver faturas"
                title="Ver faturas"
              >
                <Receipt size={18} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">

          {/* ── Active recurring subscription banner ──────────────────── */}
          {step === 'plans' && activeSubscription && activeSubscription.status === 'active' && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 mb-2">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Assinatura ativa</p>
                  <p className="text-sm font-bold text-white truncate">
                    Plano {activeSubscription.plan_name ?? activeSubscription.tier_key ?? '—'} — recorrente mensal
                  </p>
                  {activeSubscription.current_period_end && (
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Próxima cobrança em {fmtDateBR(activeSubscription.current_period_end)}
                    </p>
                  )}
                </div>
                <Repeat size={16} className="text-emerald-400 flex-shrink-0 mt-1" />
              </div>
              {!activeSubscription.cancel_at_period_end ? (
                <button
                  onClick={handleCancelRecurring}
                  disabled={cancelLoading}
                  className="w-full py-2 text-xs font-bold rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 hover:border-red-500/50 transition-colors disabled:opacity-50"
                >
                  {cancelLoading ? 'Cancelando…' : 'Cancelar assinatura (mantém acesso até o fim do período)'}
                </button>
              ) : (
                <p className="text-[11px] text-yellow-400 font-bold">
                  ⚠️ Cancelamento agendado — acesso ativo até{' '}
                  {fmtDateBR(activeSubscription.current_period_end)}
                </p>
              )}
            </div>
          )}

          {step === 'plans' && activeSubscription && activeSubscription.status === 'pending' && activeSubscription.init_point && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 mb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-yellow-400 mb-1">Assinatura pendente</p>
              <p className="text-sm text-white mb-2">
                Você iniciou uma assinatura recorrente mas ainda não autorizou o pagamento.
              </p>
              <a
                href={activeSubscription.init_point}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black transition-colors"
              >
                Continuar autorização <ExternalLink size={11} />
              </a>
            </div>
          )}

          {/* ── STEP: plans ────────────────────────────────────────────── */}
          {step === 'plans' && (
            <>
              {loadingPlans ? (
                <div className="flex justify-center py-10">
                  <Loader2 size={24} className="animate-spin text-yellow-400" />
                </div>
              ) : (
                plans.map((plan) => {
                  const isCurrent = plan.tier_key === currentPlanId
                  const isFree = plan.price_cents === 0
                  const isUnlimited = plan.max_students === 0

                  return (
                    <button
                      key={plan.tier_key}
                      onClick={() => handleSelectPlan(plan)}
                      disabled={isCurrent}
                      className={`w-full text-left rounded-xl border p-4 transition-all ${
                        isCurrent
                          ? 'border-yellow-500/50 bg-yellow-500/5 opacity-60 cursor-default'
                          : 'border-neutral-700 hover:border-yellow-500/60 hover:bg-neutral-900 active:scale-[0.99]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-400">{PLAN_ICONS[plan.tier_key] ?? <Zap size={16} />}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{plan.name}</span>
                              {isCurrent && (
                                <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full font-semibold">
                                  Atual
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-neutral-400 mt-0.5">{plan.description}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-white font-bold text-sm">
                            {isFree ? 'Grátis' : fmtBRL(plan.price_cents)}
                          </p>
                          {!isFree && <p className="text-[10px] text-neutral-400">/mês</p>}
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-1 text-xs text-neutral-400">
                        <Check size={11} className="text-emerald-400 flex-shrink-0" />
                        <span>
                          {isUnlimited
                            ? 'Alunos ilimitados'
                            : `Até ${plan.max_students} aluno${plan.max_students !== 1 ? 's' : ''}`}
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </>
          )}

          {/* ── STEP: checkout ─────────────────────────────────────────── */}
          {step === 'checkout' && selectedPlan && (
            <div className="space-y-4">
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 text-sm text-neutral-300 space-y-1">
                <div className="flex justify-between">
                  <span>Plano</span>
                  <span className="font-semibold text-white">{selectedPlan.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cobrança</span>
                  <span className="font-semibold text-white">{fmtBRL(selectedPlan.price_cents)}/mês</span>
                </div>
                <div className="flex justify-between">
                  <span>Alunos</span>
                  <span className="font-semibold text-white">
                    {selectedPlan.max_students === 0 ? 'Ilimitados' : `Até ${selectedPlan.max_students}`}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor="tup-name" className="text-xs text-neutral-400 mb-1 block">Seu nome</label>
                  <input
                    id="tup-name"
                    aria-label="Seu nome"
                    type="text"
                    value={name}
                    onChange={(e) => setName(maskName(e.target.value))}
                    placeholder="Nome completo"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
                  />
                </div>
                <div>
                  <label htmlFor="tup-cpf" className="text-xs text-neutral-400 mb-1 block">CPF ou CNPJ</label>
                  <input
                    id="tup-cpf"
                    aria-label="CPF ou CNPJ"
                    type="text"
                    inputMode="numeric"
                    value={cpf}
                    onChange={(e) => setCpf(maskCpf(e.target.value))}
                    placeholder="Somente números"
                    maxLength={14}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
                  />
                </div>
                <div>
                  <label htmlFor="tup-phone" className="text-xs text-neutral-400 mb-1 block">Celular (WhatsApp)</label>
                  <input
                    id="tup-phone"
                    aria-label="Celular"
                    type="text"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    placeholder="DDD + número"
                    maxLength={11}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
                  />
                </div>
              </div>

              {checkoutError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {checkoutError}
                </p>
              )}

              {/* Recurring (recommended) */}
              <button
                onClick={() => void handleStartRecurring()}
                disabled={recurringLoading}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black text-sm transition-colors flex items-center justify-center gap-2"
              >
                {recurringLoading ? <Loader2 size={16} className="animate-spin" /> : <Repeat size={16} />}
                {recurringLoading ? 'Abrindo Mercado Pago…' : 'Assinar Mensalmente (cartão / PIX automático)'}
              </button>
              <p className="text-[11px] text-emerald-300/80 text-center -mt-2">
                Cobrança automática todo mês — você pode cancelar a qualquer momento
              </p>

              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-neutral-800" />
                <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-black">ou</span>
                <div className="flex-1 h-px bg-neutral-800" />
              </div>

              {/* Single-shot PIX */}
              <button
                onClick={() => void handleCheckout()}
                disabled={checkoutLoading || !cpf || !phone}
                className="w-full py-3 rounded-xl bg-yellow-500/15 hover:bg-yellow-500/25 active:bg-yellow-500/35 border border-yellow-500/40 disabled:opacity-50 disabled:cursor-not-allowed text-yellow-300 font-bold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {checkoutLoading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                {checkoutLoading ? 'Gerando PIX…' : 'Pagar com PIX (1 mês de uma vez)'}
              </button>

              <button
                onClick={() => setStep('plans')}
                className="w-full py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              >
                ← Voltar aos planos
              </button>
            </div>
          )}

          {/* ── STEP: pix ──────────────────────────────────────────────── */}
          {step === 'pix' && pixResult && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-neutral-300">
                  Escaneie o QR code ou copie o código PIX abaixo para concluir o pagamento.
                </p>
                {pixResult.due_date && (
                  <p className="text-xs text-neutral-400 mt-1">
                    Válido até {new Date(pixResult.due_date).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>

              {pixResult.pix_qr_code && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/png;base64,${pixResult.pix_qr_code}`}
                    alt="QR Code PIX"
                    className="w-48 h-48 rounded-xl border border-neutral-700"
                  />
                </div>
              )}

              {pixResult.pix_payload && (
                <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-3">
                  <p className="text-[10px] text-neutral-400 mb-1.5 uppercase tracking-wide">Código PIX Copia e Cola</p>
                  <p className="text-xs text-neutral-300 break-all font-mono leading-relaxed line-clamp-4">
                    {String(pixResult.pix_payload)}
                  </p>
                  <button
                    onClick={handleCopyPix}
                    className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-yellow-400 hover:text-yellow-300 transition-colors"
                  >
                    {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
                    {copied ? 'Copiado!' : 'Copiar código'}
                  </button>
                </div>
              )}

              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-3 text-xs text-neutral-400 space-y-1">
                <p>✅ Após o pagamento confirmado, seu plano será ativado automaticamente.</p>
                <p>📱 Você receberá uma notificação quando a ativação ocorrer.</p>
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl border border-neutral-700 text-sm text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
              >
                Fechar — já paguei
              </button>
            </div>
          )}

          {/* ── STEP: invoices (list) ──────────────────────────────────── */}
          {step === 'invoices' && !activeInvoice && (
            <div className="space-y-2">
              {loadingInvoices ? (
                <div className="flex justify-center py-10">
                  <Loader2 size={24} className="animate-spin text-yellow-400" />
                </div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <Receipt size={32} className="text-neutral-400 mx-auto mb-3" />
                  <p className="text-sm text-neutral-300 font-bold">Sem faturas ainda</p>
                  <p className="text-xs text-neutral-400 mt-1">
                    Suas cobranças aparecerão aqui depois que você assinar um plano pago.
                  </p>
                  <button
                    onClick={() => setStep('plans')}
                    className="mt-4 px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-black transition-colors"
                  >
                    Ver Planos
                  </button>
                </div>
              ) : (
                invoices.map((inv) => (
                  <button
                    key={inv.id}
                    onClick={() => setActiveInvoice(inv)}
                    aria-label={`Abrir fatura ${inv.plan_name ?? 'sem plano'} de ${fmtBRL(inv.amount_cents)} (${inv.status})`}
                    className="w-full text-left rounded-xl border border-neutral-700 hover:border-yellow-500/40 bg-neutral-900 hover:bg-neutral-900/80 p-3 transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-white text-sm truncate">
                            {inv.plan_name ?? 'Plano'}
                          </span>
                          <StatusBadge status={inv.status} />
                        </div>
                        <p className="text-[11px] text-neutral-400">
                          {fmtDateBR(inv.created_at)}
                          {inv.due_date && inv.status === 'pending' && ` · vence em ${fmtDateBR(inv.due_date)}`}
                          {inv.paid_at && ` · pago em ${fmtDateBR(inv.paid_at)}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-white text-sm">{fmtBRL(inv.amount_cents)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
              <button
                onClick={() => setStep('plans')}
                className="w-full py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              >
                ← Voltar aos planos
              </button>
            </div>
          )}

          {/* ── STEP: invoices (detail) ────────────────────────────────── */}
          {step === 'invoices' && activeInvoice && (
            <div className="space-y-4">
              <div className="rounded-xl bg-neutral-900 border border-neutral-700 p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-400">Status</span>
                  <StatusBadge status={activeInvoice.status} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Plano</span>
                  <span className="font-bold text-white">{activeInvoice.plan_name ?? '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Valor</span>
                  <span className="font-bold text-white">{fmtBRL(activeInvoice.amount_cents)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Criada em</span>
                  <span className="text-neutral-200">{fmtDateBR(activeInvoice.created_at)}</span>
                </div>
                {activeInvoice.due_date && activeInvoice.status === 'pending' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Vencimento</span>
                    <span className="text-neutral-200">{fmtDateBR(activeInvoice.due_date)}</span>
                  </div>
                )}
                {activeInvoice.paid_at && (
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Pago em</span>
                    <span className="text-emerald-400 font-bold">{fmtDateBR(activeInvoice.paid_at)}</span>
                  </div>
                )}
              </div>

              {/* Pending: PIX QR Code + copia/cola */}
              {activeInvoice.status === 'pending' && activeInvoice.pix_qr_code && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/png;base64,${activeInvoice.pix_qr_code}`}
                    alt="QR Code PIX"
                    className="w-48 h-48 rounded-xl border border-neutral-700"
                  />
                </div>
              )}
              {activeInvoice.status === 'pending' && activeInvoice.pix_payload && (
                <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-3">
                  <p className="text-[10px] text-neutral-400 mb-1.5 uppercase tracking-wide">PIX Copia e Cola</p>
                  <p className="text-xs text-neutral-300 break-all font-mono leading-relaxed line-clamp-4">
                    {activeInvoice.pix_payload}
                  </p>
                  <button
                    onClick={() => {
                      const payload = activeInvoice.pix_payload
                      if (!payload) return
                      navigator.clipboard.writeText(payload).then(() => {
                        setCopiedInvoiceId(activeInvoice.id)
                        setTimeout(() => setCopiedInvoiceId(null), 3000)
                      }).catch(() => {})
                    }}
                    className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-yellow-400 hover:text-yellow-300 transition-colors"
                  >
                    {copiedInvoiceId === activeInvoice.id ? <CheckCheck size={13} /> : <Copy size={13} />}
                    {copiedInvoiceId === activeInvoice.id ? 'Copiado!' : 'Copiar código'}
                  </button>
                </div>
              )}

              {activeInvoice.invoice_url && (
                <a
                  href={activeInvoice.invoice_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full py-2 text-center rounded-xl border border-neutral-700 text-sm text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
                >
                  Abrir comprovante no Mercado Pago
                </a>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
