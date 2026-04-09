'use client'
/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
/**
 * StudentSubscriptionCard — shows the student's active plan from their teacher,
 * including a PIX payment flow when payment is due.
 */
import React, { useCallback, useState } from 'react'
import { CreditCard, CheckCircle2, Clock, AlertCircle, XCircle, QrCode, Copy, ExternalLink, Loader2, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useStudentSubscription } from '@/hooks/useStudentSubscription'
import { apiStudentBilling } from '@/lib/api/student-billing'
import type { StudentCharge } from '@/lib/api/student-billing'

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return '—' }
}

const onlyDigits = (v: string) => v.replace(/\D/g, '')

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string; cardCls: string }> = {
  active:    { label: 'Ativo',     icon: <CheckCircle2 size={13} />, cls: 'text-green-400',   cardCls: 'border-green-500/20 bg-green-500/5' },
  pending:   { label: 'Pendente',  icon: <Clock size={13} />,        cls: 'text-yellow-400',  cardCls: 'border-yellow-500/20 bg-yellow-500/5' },
  past_due:  { label: 'Em atraso', icon: <AlertCircle size={13} />,  cls: 'text-orange-400',  cardCls: 'border-orange-500/20 bg-orange-500/5' },
  cancelled: { label: 'Cancelado', icon: <XCircle size={13} />,      cls: 'text-neutral-400', cardCls: 'border-neutral-700/40 bg-neutral-800/20' },
  expired:   { label: 'Expirado',  icon: <XCircle size={13} />,      cls: 'text-red-400',     cardCls: 'border-red-500/20 bg-red-500/5' },
}

const INTERVAL_LABELS: Record<string, string> = {
  once: 'Avulso', monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', yearly: 'Anual',
}

// ─── PIX Payment Modal ────────────────────────────────────────────────────────

interface PixPaymentModalProps {
  subscriptionId: string
  planName: string
  priceCents: number
  existingCharge: StudentCharge | null
  onClose: () => void
  onSuccess: () => void
}

function PixPaymentModal({ subscriptionId, planName, priceCents, existingCharge, onClose, onSuccess }: PixPaymentModalProps) {
  const [step, setStep] = useState<'form' | 'pix'>(existingCharge ? 'pix' : 'form')
  const [charge, setCharge] = useState<StudentCharge | null>(existingCharge)
  const [cpf, setCpf] = useState('')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handlePay = useCallback(async () => {
    const cpfDigits = onlyDigits(cpf)
    if (cpfDigits.length !== 11 && cpfDigits.length !== 14) { setError('Informe um CPF válido (11 dígitos).'); return }
    const phoneDigits = onlyDigits(phone)
    if (phoneDigits.length < 10) { setError('Informe um telefone válido com DDD.'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await apiStudentBilling.pay({
        subscription_id: subscriptionId,
        cpfCnpj: cpfDigits,
        mobilePhone: phoneDigits,
        name: name.trim() || undefined,
      })
      if (!res.ok) { setError('Erro ao gerar cobrança. Tente novamente.'); return }
      setCharge(res.charge)
      setStep('pix')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setLoading(false)
    }
  }, [subscriptionId, cpf, phone, name])

  const handleCopy = useCallback(async () => {
    if (!charge?.pix_payload) return
    try {
      await navigator.clipboard.writeText(charge.pix_payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // silently ignore
    }
  }, [charge])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-t-2xl sm:rounded-2xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-neutral-800 flex-shrink-0">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-widest">Pagamento via PIX</p>
            <h2 className="text-white font-bold text-base">{planName}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === 'form' && (
            <>
              <div className="rounded-2xl bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-yellow-300 font-semibold">{planName}</span>
                <span className="text-yellow-400 font-black text-lg">{fmtBRL(priceCents)}</span>
              </div>

              <div>
                <label htmlFor="pix-name" className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wide">Nome completo</label>
                <input
                  id="pix-name"
                  aria-label="Nome completo do pagador"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
                />
              </div>

              <div>
                <label htmlFor="pix-cpf" className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wide">CPF *</label>
                <input
                  id="pix-cpf"
                  aria-label="CPF do pagador"
                  type="text"
                  inputMode="numeric"
                  value={cpf}
                  onChange={e => setCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  maxLength={18}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
                />
              </div>

              <div>
                <label htmlFor="pix-phone" className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wide">Celular com DDD *</label>
                <input
                  id="pix-phone"
                  aria-label="Celular com DDD do pagador"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  maxLength={20}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
              )}
            </>
          )}

          {step === 'pix' && charge && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-2xl bg-green-500/10 border border-green-500/20 px-4 py-3 w-full text-center">
                <p className="text-xs text-green-400 uppercase tracking-widest mb-1 font-bold">PIX gerado com sucesso</p>
                <p className="text-sm text-neutral-300">Escaneie o QR code ou copie o código</p>
              </div>

              {charge.pix_qr_code && (
                <div className="bg-white rounded-2xl p-4 w-fit mx-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/png;base64,${charge.pix_qr_code}`}
                    alt="QR Code PIX"
                    width={220}
                    height={220}
                    className="w-[220px] h-[220px] object-contain"
                  />
                </div>
              )}

              {charge.pix_payload && (
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-sm transition-colors"
                >
                  {copied ? <CheckCircle2 size={16} className="text-green-400" /> : <Copy size={16} />}
                  {copied ? 'Copiado!' : 'Copiar código PIX'}
                </button>
              )}

              {charge.invoice_url && (
                <a
                  href={charge.invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-semibold text-sm transition-colors"
                >
                  <ExternalLink size={16} /> Ver fatura completa
                </a>
              )}

              {charge.due_date && (
                <p className="text-xs text-neutral-500 text-center">Vencimento: {fmtDate(charge.due_date)}</p>
              )}

              <button
                type="button"
                onClick={onSuccess}
                className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm transition-colors"
              >
                Já paguei — fechar
              </button>
            </div>
          )}
        </div>

        {step === 'form' && (
          <div className="px-5 pb-5 pt-3 border-t border-neutral-800 flex-shrink-0">
            <button
              type="button"
              onClick={() => void handlePay()}
              disabled={loading || !onlyDigits(cpf).length || !onlyDigits(phone).length}
              className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
              {loading ? 'Gerando PIX…' : 'Gerar PIX'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── main card ────────────────────────────────────────────────────────────────

export default function StudentSubscriptionCard() {
  const { loading, subscription, teacher, charge, refetch } = useStudentSubscription()
  const [payOpen, setPayOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin flex-shrink-0" />
        <span className="text-sm text-neutral-500">Carregando plano...</span>
      </div>
    )
  }

  if (!subscription) return null

  const status = subscription.status
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['pending']
  const plan = subscription.student_service_plans
  const teacherName = String(teacher?.full_name || teacher?.name || 'Seu professor')
  const canPay = ['pending', 'past_due'].includes(status)

  return (
    <>
      <div className={`rounded-2xl border p-4 ${cfg.cardCls}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.cls} bg-neutral-800/60`}>
              <CreditCard size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-bold text-sm truncate">{plan?.name ?? 'Plano'}</span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${cfg.cls}`}>
                  {cfg.icon} {cfg.label}
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5 truncate">
                {teacherName}
                {plan?.price_cents != null && ` · ${fmtBRL(plan.price_cents)}`}
                {plan?.billing_interval && ` ${INTERVAL_LABELS[plan.billing_interval] ?? plan.billing_interval}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {canPay && (
              <button
                type="button"
                onClick={() => setPayOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs transition-colors"
              >
                <QrCode size={12} /> Pagar
              </button>
            )}
            <button
              type="button"
              onClick={() => setDetailsOpen(v => !v)}
              className="p-2 rounded-xl bg-neutral-800/60 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
              aria-label={detailsOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
            >
              {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {detailsOpen && (
          <div className="mt-4 pt-3 border-t border-white/[0.06] space-y-1.5">
            {subscription.started_at && (
              <div className="flex justify-between text-xs">
                <span className="text-neutral-500">Início</span>
                <span className="text-neutral-300">{fmtDate(subscription.started_at)}</span>
              </div>
            )}
            {subscription.expires_at && (
              <div className="flex justify-between text-xs">
                <span className="text-neutral-500">Vencimento</span>
                <span className="text-neutral-300">{fmtDate(subscription.expires_at)}</span>
              </div>
            )}
            {subscription.next_due_date && (
              <div className="flex justify-between text-xs">
                <span className="text-neutral-500">Próx. cobrança</span>
                <span className="text-neutral-300">{fmtDate(subscription.next_due_date)}</span>
              </div>
            )}
            {plan?.session_duration_minutes && (
              <div className="flex justify-between text-xs">
                <span className="text-neutral-500">Duração/sessão</span>
                <span className="text-neutral-300">{plan.session_duration_minutes} min</span>
              </div>
            )}
            {plan?.sessions_per_week && (
              <div className="flex justify-between text-xs">
                <span className="text-neutral-500">Sessões/semana</span>
                <span className="text-neutral-300">{plan.sessions_per_week}×</span>
              </div>
            )}
            {plan?.training_days && plan.training_days.length > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-neutral-500">Dias de treino</span>
                <span className="text-neutral-300 uppercase">{plan.training_days.join(' · ')}</span>
              </div>
            )}
            {plan?.notes && (
              <div className="pt-2 text-xs text-neutral-500 border-t border-white/[0.04]">{plan.notes}</div>
            )}
          </div>
        )}
      </div>

      {payOpen && subscription && (
        <PixPaymentModal
          subscriptionId={subscription.id}
          planName={plan?.name ?? 'Plano'}
          priceCents={plan?.price_cents ?? 0}
          existingCharge={charge}
          onClose={() => setPayOpen(false)}
          onSuccess={() => { setPayOpen(false); refetch() }}
        />
      )}
    </>
  )
}
