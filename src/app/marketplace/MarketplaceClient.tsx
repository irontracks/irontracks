'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { ArrowLeft, Copy, CreditCard, ExternalLink, QrCode, RefreshCw, X, MessageSquare } from 'lucide-react'

type AppPlan = {
  id: string
  name: string
  description: string | null
  interval: 'month' | 'year'
  price_cents: number
  currency: string
  status: 'active' | 'inactive'
  sort_order?: number | null
  features?: any
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

export default function MarketplaceClient() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [userId, setUserId] = useState<string>('')
  const [marketplaceEnabled, setMarketplaceEnabled] = useState(true)
  const [marketplaceGateChecked, setMarketplaceGateChecked] = useState(false)

  const [plans, setPlans] = useState<AppPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)

  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<AppPlan | null>(null)
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [mobilePhone, setMobilePhone] = useState('')
  const [payerName, setPayerName] = useState('')
  const [checkingOut, setCheckingOut] = useState(false)
  const [cardRedirecting, setCardRedirecting] = useState(false)
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResponse | null>(null)

  const goBack = useCallback(() => {
    try {
      router.back()
      window.setTimeout(() => {
        try {
          if (typeof window !== 'undefined' && window.location && window.location.pathname === '/marketplace') {
            router.push('/dashboard')
          }
        } catch {}
      }, 200)
    } catch {
      try {
        router.push('/dashboard')
      } catch {}
    }
  }, [router])

  const closeCheckout = useCallback(() => {
    setCheckoutOpen(false)
    setSelectedPlan(null)
    setCheckoutResult(null)
    setCheckingOut(false)
  }, [])

  const loadMe = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      setMarketplaceEnabled(true)
      setMarketplaceGateChecked(true)
      return
    }
    setUserId(user.id)
    try {
      const { data: prefRow } = await supabase
        .from('user_settings')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle()
      const prefs = prefRow?.preferences && typeof prefRow.preferences === 'object' ? prefRow.preferences : null
      const enabled = prefs ? (prefs as any).moduleMarketplace !== false : true
      setMarketplaceEnabled(Boolean(enabled))
    } catch {
      setMarketplaceEnabled(true)
    } finally {
      setMarketplaceGateChecked(true)
    }
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

  const openCheckout = useCallback((plan: AppPlan) => {
    setSelectedPlan(plan)
    setCheckoutOpen(true)
    setCheckoutResult(null)
    setCpfCnpj('')
    setMobilePhone('')
    setPayerName('')
  }, [])

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

  useEffect(() => {
    loadMe().catch(() => {})
  }, [loadMe])

  useEffect(() => {
    if (!marketplaceGateChecked) return
    if (!marketplaceEnabled) return
    loadPlans().catch(() => {})
  }, [loadPlans, marketplaceEnabled, marketplaceGateChecked])

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-neutral-800 rounded-2xl border border-neutral-700 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold">Marketplace</h1>
              <p className="text-sm text-neutral-300">Planos VIP (Pix ou Cartão)</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={goBack}
                className={`${minButtonClass} px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-bold flex items-center gap-2`}
              >
                <ArrowLeft size={18} />
                Voltar
              </button>
              <button
                onClick={loadPlans}
                className={`${minButtonClass} px-4 py-3 rounded-xl bg-yellow-500 text-black font-bold flex items-center gap-2`}
                disabled={!marketplaceGateChecked || !marketplaceEnabled || loadingPlans}
              >
                <RefreshCw size={18} />
                {loadingPlans ? '...' : 'Atualizar'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {!marketplaceGateChecked ? <div className="text-center py-8 text-neutral-400">Carregando...</div> : null}
          {marketplaceGateChecked && !marketplaceEnabled ? (
            <div className="text-center py-10 text-neutral-300 bg-neutral-800/40 border border-neutral-800 rounded-2xl">
              <div className="text-sm font-black uppercase tracking-widest text-yellow-500">Marketplace</div>
              <div className="text-lg font-black text-white mt-2">Módulo desativado</div>
              <div className="text-sm text-neutral-400 mt-2">Ative nas preferências para ver os planos.</div>
              <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  type="button"
                  onClick={goBack}
                  className={`${minButtonClass} px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black inline-flex items-center justify-center gap-2`}
                >
                  <ArrowLeft size={18} />
                  Voltar
                </button>
              </div>
            </div>
          ) : null}
          {marketplaceGateChecked && marketplaceEnabled && loadingPlans ? (
            <div className="text-center py-8 text-neutral-400">Carregando...</div>
          ) : null}

          {marketplaceGateChecked && marketplaceEnabled && !loadingPlans && (plans ?? []).length === 0 && (
            <div className="text-center py-10 text-neutral-300 bg-neutral-800/40 border border-neutral-800 rounded-2xl">
              <div className="text-sm font-black uppercase tracking-widest text-yellow-500">Marketplace</div>
              <div className="text-lg font-black text-white mt-2">Nenhum plano encontrado</div>
              <div className="text-sm text-neutral-400 mt-2">Tente recarregar ou volte para o app.</div>
              <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  type="button"
                  onClick={goBack}
                  className={`${minButtonClass} px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black inline-flex items-center justify-center gap-2`}
                >
                  <ArrowLeft size={18} />
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={loadPlans}
                  className={`${minButtonClass} px-4 py-3 rounded-xl bg-yellow-500 text-black font-black inline-flex items-center justify-center gap-2`}
                >
                  <RefreshCw size={18} />
                  Recarregar
                </button>
              </div>
            </div>
          )}

          {marketplaceGateChecked && marketplaceEnabled ? (plans ?? []).map((plan) => (
            <div key={plan.id} className="bg-neutral-800 rounded-2xl border border-neutral-700 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white font-black text-lg">{plan.name}</div>
                  {plan.description ? <div className="text-sm text-neutral-300 mt-1">{plan.description}</div> : null}
                  
                  {plan.features?.limits?.messagesPerDay ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-neutral-300 bg-neutral-900/50 p-2 rounded-lg border border-neutral-800">
                      <MessageSquare size={14} className="text-yellow-500" />
                      <span>Coach IA: <strong className="text-white">{plan.features.limits.messagesPerDay} msgs/dia</strong></span>
                    </div>
                  ) : null}

                  <div className="text-sm text-neutral-400 mt-3">
                    <span className="font-black text-white">{formatMoney(plan.price_cents)}</span> / {plan.interval === 'year' ? 'ano' : 'mês'}
                  </div>
                </div>
                <button
                  onClick={() => openCheckout(plan)}
                  className={`${minButtonClass} px-4 py-3 rounded-xl bg-yellow-500 text-black font-black flex items-center gap-2`}
                  disabled={!userId}
                  title={!userId ? 'Faça login para assinar' : undefined}
                >
                  <CreditCard size={18} />
                  Assinar
                </button>
              </div>
            </div>
          )) : null}
        </div>
      </div>

      {checkoutOpen && selectedPlan && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-neutral-900 rounded-2xl border border-neutral-700 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div className="font-black">Assinar {selectedPlan.name}</div>
              <button onClick={closeCheckout} className={`${minButtonClass} p-2 hover:bg-neutral-800 rounded-xl`}>
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-sm text-neutral-300">
                {formatMoney(selectedPlan.price_cents)} / {selectedPlan.interval === 'year' ? 'ano' : 'mês'} • Pix ou Cartão
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold focus:outline-none focus:border-yellow-500"
                  placeholder="Nome"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                />
                <input
                  className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold focus:outline-none focus:border-yellow-500"
                  placeholder="Celular (DDD + número)"
                  value={mobilePhone}
                  onChange={(e) => setMobilePhone(e.target.value)}
                />
                <input
                  className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold focus:outline-none focus:border-yellow-500 sm:col-span-2"
                  placeholder="CPF/CNPJ"
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                />
              </div>

              <button
                onClick={startCheckout}
                disabled={checkingOut}
                className={`${minButtonClass} w-full px-4 py-3 rounded-xl bg-yellow-500 text-black font-black disabled:opacity-60 flex items-center justify-center gap-2`}
              >
                <QrCode size={18} />
                {checkingOut ? 'Gerando PIX...' : 'Gerar PIX'}
              </button>

              <button
                onClick={startCardCheckout}
                disabled={cardRedirecting}
                className={`${minButtonClass} w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-white font-black disabled:opacity-60 flex items-center justify-center gap-2`}
              >
                <CreditCard size={18} />
                {cardRedirecting ? 'Redirecionando...' : 'Assinar com Cartão'}
              </button>

              {checkoutResult && !checkoutResult.ok ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {toCheckoutUserMessage(String(checkoutResult.error || ''))}
                </div>
              ) : null}

              {canCancelPending ? (
                <button
                  type="button"
                  onClick={cancelPendingAttempt}
                  className={`${minButtonClass} w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-white font-black flex items-center justify-center gap-2`}
                >
                  Cancelar tentativa
                </button>
              ) : null}

              {checkoutResult && checkoutResult.ok && checkoutResult.payment ? (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="font-black text-white">PIX pronto</div>
                  <div className="text-sm text-neutral-400 mt-1">Escaneie o QR Code ou copie o código.</div>

                  {checkoutResult.payment.pix_qr_code ? (
                    <div className="mt-4 flex justify-center">
                      <Image
                        src={normalizePixImageSrc(checkoutResult.payment.pix_qr_code)}
                        width={PIX_QR_SIZE}
                        height={PIX_QR_SIZE}
                        alt="QR Code PIX"
                        className="rounded-xl border border-neutral-800 bg-neutral-950"
                      />
                    </div>
                  ) : null}

                  {checkoutResult.payment.pix_payload ? (
                    <div className="mt-4 space-y-2">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(checkoutResult.payment?.pix_payload || '')}
                        className={`${minButtonClass} w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-white font-black flex items-center justify-center gap-2`}
                      >
                        <Copy size={18} />
                        Copiar código PIX
                      </button>
                      {checkoutResult.payment.invoice_url ? (
                        <a
                          href={checkoutResult.payment.invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className={`${minButtonClass} w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-white font-black flex items-center justify-center gap-2`}
                        >
                          <ExternalLink size={18} />
                          Abrir fatura
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
