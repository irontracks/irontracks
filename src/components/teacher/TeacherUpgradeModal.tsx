'use client'
/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
/**
 * TeacherUpgradeModal
 * Full-screen modal for upgrading the teacher's plan.
 * Step 1 — Plan selection
 * Step 2 — PIX checkout (QR code + copy-paste payload)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X, Check, Loader2, Copy, CheckCheck, Zap, Users, Crown } from 'lucide-react'
import { apiTeacherBilling } from '@/lib/api/teacher-billing'
import type { TeacherPlanRow, TeacherCheckoutResult } from '@/lib/api/teacher-billing'
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

type Step = 'plans' | 'checkout' | 'pix'

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

  // load plans on open
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
  }, [open])

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
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-widest font-medium">Professor</p>
            <h2 className="text-white font-bold text-lg leading-tight">
              {step === 'plans' && 'Escolha seu plano'}
              {step === 'checkout' && `Assinar ${selectedPlan?.name}`}
              {step === 'pix' && 'Pague com PIX'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">

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
                          {!isFree && <p className="text-[10px] text-neutral-500">/mês</p>}
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

              <button
                onClick={() => void handleCheckout()}
                disabled={checkoutLoading || !cpf || !phone}
                className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 active:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {checkoutLoading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                {checkoutLoading ? 'Gerando PIX…' : 'Gerar PIX'}
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
                  <p className="text-xs text-neutral-500 mt-1">
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
                  <p className="text-[10px] text-neutral-500 mb-1.5 uppercase tracking-wide">Código PIX Copia e Cola</p>
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

        </div>
      </div>
    </div>
  )
}
