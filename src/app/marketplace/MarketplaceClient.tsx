'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { ArrowLeft, Check, Copy, CreditCard, ExternalLink, QrCode, X, Zap, Crown, Star, AlertTriangle, ChevronRight, Sparkles, Calendar } from 'lucide-react'

type AppPlan = {
  id: string
  name: string
  description: string | null
  interval: 'month' | 'year'
  price_cents: number
  currency: string
  status: 'active' | 'inactive'
  sort_order?: number | null
}

type CheckoutResponse = {
  ok: boolean
  error?: string
  resumed?: boolean
  subscription?: { id: string; status: string; asaas_subscription_id: string }
  payment?: {
    id: string
    status: string
    due_date: string | null
    asaas_payment_id: string
    invoice_url: string | null
    pix_qr_code: string | null
    pix_payload: string | null
  } | null
}

const formatMoney = (cents: number) => {
  const v = Number.isFinite(cents) ? cents : 0
  const value = (v / 100).toFixed(2)
  const [intPart, decPart] = value.split('.')
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `R$ ${withThousands},${decPart || '00'}`
}

const minButtonClass = 'min-h-[44px]'
const PIX_QR_SIZE = 224

const normalizePixImageSrc = (encodedImage: string) => {
  const s = (encodedImage || '').trim()
  if (!s) return ''
  if (s.startsWith('data:image/')) return s
  return `data:image/png;base64,${s}`
}

const toCheckoutUserMessage = (raw: string) => {
  const s = String(raw || '').trim()
  if (!s) return 'Erro ao criar cobrança.'
  if (s === 'db_migration_required') return 'O banco de dados ainda não foi atualizado (migrations pendentes).'
  if (s === 'already_has_active_subscription') return 'Você já tem uma assinatura ativa ou pendente nesta conta.'
  if (s === 'already_subscribed') return 'Você já iniciou uma assinatura deste plano nesta conta.'
  if (s === 'pending_subscription_exists') return 'Você tem uma tentativa de assinatura pendente. Finalize ou cancele para tentar novamente.'
  if (s === 'asaas_api_key_missing') return 'Pagamento PIX indisponível (Asaas não configurado no servidor).'
  if (s === 'mercadopago_access_token_missing') return 'Pagamento no cartão indisponível (Mercado Pago não configurado no servidor).'
  if (s === 'unauthorized') return 'Você precisa estar logado para assinar.'
  return s
}

// Tier Definitions for UI
const TIERS = {
    start: {
        label: 'VIP Start',
        color: 'text-yellow-500',
        bg: 'bg-yellow-500',
        border: 'border-yellow-500',
        icon: Star,
        tagline: 'Para quem está começando',
        features: [
            'Coach IA: 10 msg/dia',
            'Insights: 3/semana',
            'Wizard: 1/semana',
            'Histórico: 60 dias'
        ]
    },
    pro: {
        label: 'VIP Pro',
        color: 'text-green-400',
        bg: 'bg-green-500',
        border: 'border-green-500',
        icon: Zap,
        tagline: 'Evolução constante e consistente',
        features: [
            'Coach IA: 40 msg/dia',
            'Insights: 7/semana',
            'Wizard: 3/semana',
            'Histórico Ilimitado',
            'Nutrição: Macros',
            'Modo Offline'
        ]
    },
    elite: {
        label: 'VIP Elite',
        color: 'text-purple-400',
        bg: 'bg-purple-500',
        border: 'border-purple-500',
        icon: Crown,
        tagline: 'Alta performance sem limites',
        features: [
            'Coach IA: Ilimitado',
            'Insights: Ilimitado',
            'Wizard: Ilimitado',
            'Chef IA',
            'Analytics Avançado'
        ]
    }
}

export default function MarketplaceClient() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [userId, setUserId] = useState<string>('')
  const [plans, setPlans] = useState<AppPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  
  const [selectedTier, setSelectedTier] = useState<'start' | 'pro' | 'elite' | null>(null)
  const [billingCycle, setBillingCycle] = useState<'month' | 'year'>('month')

  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<AppPlan | null>(null)
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [mobilePhone, setMobilePhone] = useState('')
  const [payerName, setPayerName] = useState('')
  const [checkingOut, setCheckingOut] = useState(false)
  const [cardRedirecting, setCardRedirecting] = useState(false)
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResponse | null>(null)

  const goBack = useCallback(() => {
    if (selectedTier) {
        setSelectedTier(null)
        return
    }
    try {
      router.back()
    } catch {
      router.push('/dashboard')
    }
  }, [router, selectedTier])

  const closeCheckout = useCallback(() => {
    setCheckoutOpen(false)
    setSelectedPlan(null)
    setCheckoutResult(null)
    setCheckingOut(false)
  }, [])

  const loadMe = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id) setUserId(user.id)
  }, [supabase])

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true)
    try {
      const res = await fetch('/api/app/plans', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      const rows = Array.isArray(json?.plans) ? (json.plans as AppPlan[]) : []
      setPlans(rows)
    } catch {
      setPlans([])
    } finally {
      setLoadingPlans(false)
    }
  }, [])

  useEffect(() => {
    loadMe()
    loadPlans()
  }, [loadMe, loadPlans])

  const openCheckout = useCallback((tierKey: string, cycle: 'month' | 'year') => {
    const searchKey = cycle === 'year' ? `${tierKey}_annual` : tierKey
    // Fallback search logic: if ID contains key
    const plan = plans.find(p => {
        if (cycle === 'year') {
            return p.id.includes(tierKey) && p.interval === 'year'
        }
        return p.id.includes(tierKey) && p.interval === 'month'
    })

    if (!plan) {
        alert('Plano não encontrado.')
        return
    }

    setSelectedPlan(plan)
    setCheckoutOpen(true)
    setCheckoutResult(null)
    setCpfCnpj('')
    setMobilePhone('')
    setPayerName('')
  }, [plans])

  const startCheckout = useCallback(async () => {
    if (!selectedPlan) return
    if (checkingOut) return
    setCheckingOut(true)
    setCheckoutResult(null)
    try {
      const res = await fetch('/api/app/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlan.id,
          billingType: 'PIX',
          cpfCnpj,
          mobilePhone,
          name: payerName,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as CheckoutResponse
      setCheckoutResult(json)
    } catch (e: any) {
      setCheckoutResult({ ok: false, error: e?.message || String(e) })
    } finally {
      setCheckingOut(false)
    }
  }, [checkingOut, cpfCnpj, mobilePhone, payerName, selectedPlan])

  const startCardCheckout = useCallback(async () => {
    if (!selectedPlan) return
    if (cardRedirecting) return
    setCardRedirecting(true)
    setCheckoutResult(null)
    try {
      const res = await fetch('/api/billing/mercadopago/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan.id }),
      })
      const json = await res.json().catch(() => ({}))
      const redirectUrl = String(json?.redirect_url || '').trim()
      if (!json?.ok) {
        setCheckoutResult({ ok: false, error: String(json?.error || 'Falha ao iniciar checkout com cartão.') })
        return
      }
      if (!redirectUrl) {
        setCheckoutResult({ ok: false, error: 'Checkout do cartão sem URL de redirecionamento.' })
        return
      }
      window.location.href = redirectUrl
    } catch (e: any) {
      setCheckoutResult({ ok: false, error: e?.message || String(e) })
    } finally {
      setCardRedirecting(false)
    }
  }, [cardRedirecting, selectedPlan])

  const cancelPendingAttempt = useCallback(async () => {
    if (!selectedPlan) return
    try {
      const res = await fetch('/api/app/subscriptions/cancel-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!json?.ok) {
        setCheckoutResult({ ok: false, error: String(json?.error || 'Falha ao cancelar tentativa.') })
        return
      }
      setCheckoutResult(null)
      window.alert('Tentativa cancelada. Você pode tentar novamente.')
    } catch (e: any) {
      setCheckoutResult({ ok: false, error: e?.message || String(e) })
    }
  }, [selectedPlan])

  const canCancelPending = Boolean(
    (checkoutResult && checkoutResult.ok && checkoutResult.resumed) ||
      (checkoutResult && !checkoutResult.ok && ['already_subscribed', 'pending_subscription_exists'].includes(String(checkoutResult.error || ''))),
  )

  const copyToClipboard = useCallback(async (text: string) => {
    const v = (text || '').trim()
    if (!v) return
    try {
      await navigator.clipboard.writeText(v)
      window.alert('Copiado!')
    } catch {
      window.prompt('Copie o código PIX:', v)
    }
  }, [])

  const getPlanPrice = (tierKey: string, cycle: 'month' | 'year') => {
    const plan = plans.find(p => {
        if (cycle === 'year') return p.id.includes(tierKey) && p.interval === 'year'
        return p.id.includes(tierKey) && p.interval === 'month'
    })
    return plan?.price_cents || 0
  }

  // --- Render Views ---

  const renderSelectionView = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-2 pt-4">
            <h1 className="text-3xl font-black text-white">Escolha seu Nível</h1>
            <p className="text-neutral-400">Desbloqueie o poder da IA no seu treino.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 mt-8">
            {(Object.keys(TIERS) as Array<keyof typeof TIERS>).map((key) => {
                const tier = TIERS[key]
                const Icon = tier.icon
                return (
                    <button
                        key={key}
                        onClick={() => setSelectedTier(key)}
                        className={`relative group overflow-hidden rounded-3xl p-6 border bg-neutral-900/50 hover:bg-neutral-900 transition-all duration-300 text-left ${key === 'pro' ? 'border-yellow-500/30 shadow-lg shadow-yellow-500/10' : 'border-neutral-800 hover:border-neutral-700'}`}
                    >
                        {key === 'pro' && (
                            <div className="absolute top-0 right-0 bg-yellow-500 text-black text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                                Recomendado
                            </div>
                        )}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${key === 'elite' ? 'bg-purple-500/20 text-purple-400' : key === 'pro' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-neutral-800 text-white'}`}>
                                    <Icon size={24} fill={key === 'start' ? "currentColor" : "none"} />
                                </div>
                                <div>
                                    <h3 className={`text-xl font-black ${tier.color}`}>{tier.label}</h3>
                                    <p className="text-xs text-neutral-400 font-medium mt-0.5">{tier.tagline}</p>
                                </div>
                            </div>
                            <ChevronRight className="text-neutral-600 group-hover:text-white transition-colors" />
                        </div>
                    </button>
                )
            })}
        </div>
    </div>
  )

  const renderDetailView = () => {
    if (!selectedTier) return null
    const tier = TIERS[selectedTier]
    const monthlyPrice = getPlanPrice(selectedTier === 'start' ? 'vip_start' : selectedTier === 'pro' ? 'vip_pro' : 'vip_elite', 'month')
    const yearlyPrice = getPlanPrice(selectedTier === 'start' ? 'vip_start' : selectedTier === 'pro' ? 'vip_pro' : 'vip_elite', 'year')
    const yearlyMonthlyEquivalent = Math.round(yearlyPrice / 12)

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-300">
            {/* Mobile Back Button (Inline) */}
            <button 
                onClick={() => setSelectedTier(null)}
                className="md:hidden flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white transition-colors mb-4"
            >
                <ArrowLeft size={16} />
                Voltar para planos
            </button>

            <div className="text-center space-y-2 pt-2">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-3xl mb-4 ${selectedTier === 'elite' ? 'bg-purple-500/20 text-purple-400' : selectedTier === 'pro' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-neutral-800 text-white'}`}>
                    <tier.icon size={32} fill={selectedTier === 'start' ? "currentColor" : "none"} />
                </div>
                <h1 className={`text-3xl font-black ${tier.color}`}>{tier.label}</h1>
                <p className="text-neutral-400">{tier.tagline}</p>
            </div>

            {/* Billing Selection */}
            <div className="grid grid-cols-2 gap-3 mt-8">
                <button
                    onClick={() => setBillingCycle('month')}
                    className={`relative p-4 rounded-2xl border text-left transition-all ${billingCycle === 'month' ? `bg-neutral-900 ${tier.border} shadow-lg` : 'bg-neutral-900/30 border-neutral-800 hover:bg-neutral-900'}`}
                >
                    <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Mensal</div>
                    <div className="text-xl font-black text-white">{formatMoney(monthlyPrice)}</div>
                    <div className="text-[10px] text-neutral-500 mt-1">Cobrado todo mês</div>
                </button>

                <button
                    onClick={() => setBillingCycle('year')}
                    className={`relative p-4 rounded-2xl border text-left transition-all ${billingCycle === 'year' ? `bg-neutral-900 ${tier.border} shadow-lg` : 'bg-neutral-900/30 border-neutral-800 hover:bg-neutral-900'}`}
                >
                    <div className="absolute -top-3 right-4 bg-green-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full">
                        ECONOMIZE 17%
                    </div>
                    <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Anual</div>
                    <div className="text-xl font-black text-white">{formatMoney(yearlyMonthlyEquivalent)}</div>
                    <div className="text-[10px] text-neutral-500 mt-1">Cobrado {formatMoney(yearlyPrice)}/ano</div>
                </button>
            </div>

            {/* Action Button */}
            <button
                onClick={() => openCheckout(selectedTier === 'start' ? 'vip_start' : selectedTier === 'pro' ? 'vip_pro' : 'vip_elite', billingCycle)}
                className={`w-full py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all ${selectedTier === 'elite' ? 'bg-purple-600 text-white shadow-purple-900/20' : selectedTier === 'pro' ? 'bg-yellow-500 text-black shadow-yellow-900/20' : 'bg-white text-black'}`}
            >
                Assinar {tier.label}
            </button>

            {/* Feature List */}
            <div className="bg-neutral-900/30 rounded-2xl p-6 border border-neutral-800 mt-6">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                    <Sparkles size={16} className={tier.color} />
                    O que está incluído:
                </h3>
                <ul className="space-y-3">
                    {tier.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-3 text-sm text-neutral-300">
                            <Check size={16} className={`mt-0.5 ${tier.color}`} />
                            <span dangerouslySetInnerHTML={{ __html: feat.replace(/:/g, ':<strong class="text-white ml-1">').replace(/Ilimitado/g, '<strong class="text-white">Ilimitado</strong>') }} />
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-safe-extra">
      {/* Header */}
      <div className="bg-neutral-950 sticky top-0 z-10 px-4 py-4 flex items-center border-b border-neutral-900/50 backdrop-blur-md bg-neutral-950/80">
        <button onClick={goBack} className="w-10 h-10 flex items-center justify-center hover:bg-neutral-900 rounded-xl transition-colors text-white">
            <ArrowLeft size={24} />
        </button>
        <div className="flex-1 text-center font-black text-lg pr-10 tracking-tight">
            {selectedTier ? 'Detalhes do Plano' : 'Planos VIP'}
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 pb-20">
        {!selectedTier ? renderSelectionView() : renderDetailView()}
      </div>

      {/* Checkout Modal */}
      {checkoutOpen && selectedPlan && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-neutral-900 rounded-3xl border border-neutral-800 overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div className="font-black text-lg">Checkout Seguro</div>
              <button onClick={closeCheckout} className={`${minButtonClass} p-2 hover:bg-neutral-800 rounded-xl`}>
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">{selectedPlan.name}</div>
                    <div className="text-2xl font-black text-white">{formatMoney(selectedPlan.price_cents)}</div>
                </div>
                <div className="text-right text-xs text-neutral-500 bg-neutral-900 px-3 py-1 rounded-lg border border-neutral-800">
                    {selectedPlan.interval === 'year' ? 'Anual' : 'Mensal'}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <input
                  className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-4 py-3 text-white font-medium focus:outline-none focus:border-yellow-500 transition-colors"
                  placeholder="Nome completo"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                />
                <input
                  className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-4 py-3 text-white font-medium focus:outline-none focus:border-yellow-500 transition-colors"
                  placeholder="Celular (DDD + número)"
                  value={mobilePhone}
                  onChange={(e) => setMobilePhone(e.target.value)}
                />
                <input
                  className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-4 py-3 text-white font-medium focus:outline-none focus:border-yellow-500 transition-colors"
                  placeholder="CPF ou CNPJ"
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                />
              </div>

              <div className="space-y-3 pt-2">
                <button
                    onClick={startCheckout}
                    disabled={checkingOut}
                    className={`${minButtonClass} w-full px-4 py-3.5 rounded-xl bg-green-500 hover:bg-green-400 text-black font-black disabled:opacity-60 flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-500/20`}
                >
                    <QrCode size={20} />
                    {checkingOut ? 'Gerando PIX...' : 'Pagar com PIX'}
                </button>

                <button
                    onClick={startCardCheckout}
                    disabled={cardRedirecting}
                    className={`${minButtonClass} w-full px-4 py-3.5 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-white font-bold disabled:opacity-60 flex items-center justify-center gap-2 transition-all`}
                >
                    <CreditCard size={20} />
                    {cardRedirecting ? 'Redirecionando...' : 'Pagar com Cartão'}
                </button>
              </div>

              {checkoutResult && !checkoutResult.ok ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  {toCheckoutUserMessage(String(checkoutResult.error || ''))}
                </div>
              ) : null}

              {canCancelPending ? (
                <button
                  type="button"
                  onClick={cancelPendingAttempt}
                  className="w-full text-center text-xs font-bold text-neutral-500 hover:text-white underline py-2"
                >
                  Cancelar tentativa pendente
                </button>
              ) : null}

              {checkoutResult && checkoutResult.ok && checkoutResult.payment ? (
                <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 mt-2 animate-in slide-in-from-bottom-4 duration-300">
                  <div className="font-bold text-green-400 flex items-center gap-2 mb-4">
                    <Check size={18} />
                    PIX Gerado com Sucesso
                  </div>

                  {checkoutResult.payment.pix_qr_code ? (
                    <div className="flex justify-center mb-4 bg-white p-2 rounded-xl w-fit mx-auto">
                      <Image
                        src={normalizePixImageSrc(checkoutResult.payment.pix_qr_code)}
                        width={PIX_QR_SIZE}
                        height={PIX_QR_SIZE}
                        alt="QR Code PIX"
                        className="rounded-lg"
                      />
                    </div>
                  ) : null}

                  {checkoutResult.payment.pix_payload ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(checkoutResult.payment?.pix_payload || '')}
                        className={`${minButtonClass} w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-white font-bold flex items-center justify-center gap-2`}
                      >
                        <Copy size={18} />
                        Copiar Código PIX
                      </button>
                      {checkoutResult.payment.invoice_url ? (
                        <a
                          href={checkoutResult.payment.invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className={`${minButtonClass} w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-white font-bold flex items-center justify-center gap-2`}
                        >
                          <ExternalLink size={18} />
                          Abrir Fatura
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
