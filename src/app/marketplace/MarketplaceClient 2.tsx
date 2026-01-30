'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/client'
import { Plus, X, CreditCard, QrCode, ExternalLink, Copy, Settings, ShieldCheck, AlertTriangle } from 'lucide-react'

type Role = 'admin' | 'teacher' | 'student' | 'user'

type TeacherPlan = {
  id: string
  teacher_user_id: string
  name: string
  description: string | null
  price_cents: number
  currency: string
  interval: 'month' | 'year'
  status: 'active' | 'inactive'
}

type CheckoutResponse = {
  ok: boolean
  error?: string
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

type MarketplaceHealth = {
  ok: boolean
  asaas_api_key_configured?: boolean
  asaas_webhook_secret_configured?: boolean
  supabase_service_role_configured?: boolean
  platform_fee_percent?: number
  platform_fee_source?: 'env' | 'default'
  asaas_base_url?: string
  asaas_user_agent_configured?: boolean
  asaas_base_environment?: 'sandbox' | 'production'
  asaas_key_environment?: 'sandbox' | 'production' | 'unknown'
  asaas_environment_mismatch?: boolean
  error?: string
}

type AdminTeacherRow = {
  id: string
  name: string | null
  email: string | null
  status: string | null
  user_id: string | null
  asaas_wallet_id?: string | null
}

const formatMoney = (cents: number) => {
  const v = Number.isFinite(cents) ? cents : 0
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v / 100)
}

const minButtonClass = 'min-h-[44px]'

const PIX_QR_SIZE = 224

const normalizePixImageSrc = (encodedImage: string) => {
  const s = (encodedImage || '').trim()
  if (!s) return ''
  if (s.startsWith('data:image/')) return s
  return `data:image/png;base64,${s}`
}

export default function MarketplacePage() {
  const supabase = useMemo(() => createClient(), [])
  const [role, setRole] = useState<Role>('user')
  const [userId, setUserId] = useState<string>('')
<<<<<<< HEAD
  const [marketplaceEnabled, setMarketplaceEnabled] = useState(true)
  const [marketplaceGateChecked, setMarketplaceGateChecked] = useState(false)
=======
>>>>>>> 84601ec (minha alteração)

  const [plans, setPlans] = useState<TeacherPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [planName, setPlanName] = useState('')
  const [planDescription, setPlanDescription] = useState('')
  const [planPrice, setPlanPrice] = useState('89,90')
  const [planInterval, setPlanInterval] = useState<'month' | 'year'>('month')

  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<TeacherPlan | null>(null)
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [mobilePhone, setMobilePhone] = useState('')
  const [payerName, setPayerName] = useState('')
  const [checkingOut, setCheckingOut] = useState(false)
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResponse | null>(null)

  const [adminOpen, setAdminOpen] = useState(false)
  const [health, setHealth] = useState<MarketplaceHealth | null>(null)
  const [loadingHealth, setLoadingHealth] = useState(false)
  const [teachers, setTeachers] = useState<AdminTeacherRow[]>([])
  const [loadingTeachers, setLoadingTeachers] = useState(false)
  const [teacherEmail, setTeacherEmail] = useState('')
  const [teacherUserId, setTeacherUserId] = useState('')
  const [teacherWalletId, setTeacherWalletId] = useState('')
  const [savingTeacher, setSavingTeacher] = useState(false)

  const [createWalletOpen, setCreateWalletOpen] = useState(false)
  const [creatingWallet, setCreatingWallet] = useState(false)
  const [subName, setSubName] = useState('')
  const [subCpfCnpj, setSubCpfCnpj] = useState('')
  const [subBirthDate, setSubBirthDate] = useState('')
  const [subCompanyType, setSubCompanyType] = useState('')
  const [subPhone, setSubPhone] = useState('')
  const [subMobilePhone, setSubMobilePhone] = useState('')
  const [subPostalCode, setSubPostalCode] = useState('')
  const [subAddress, setSubAddress] = useState('')
  const [subAddressNumber, setSubAddressNumber] = useState('')
  const [subComplement, setSubComplement] = useState('')
  const [subProvince, setSubProvince] = useState('')
  const [subIncomeValue, setSubIncomeValue] = useState('')

  const closeCreate = useCallback(() => {
    setCreateOpen(false)
    setCreating(false)
  }, [])

  const closeCheckout = useCallback(() => {
    setCheckoutOpen(false)
    setSelectedPlan(null)
    setCheckoutResult(null)
    setCheckingOut(false)
  }, [])

  const closeAdmin = useCallback(() => {
    setAdminOpen(false)
    setSavingTeacher(false)
    setTeacherEmail('')
    setTeacherUserId('')
    setTeacherWalletId('')
    setCreateWalletOpen(false)
    setCreatingWallet(false)
  }, [])

  const loadMe = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
<<<<<<< HEAD
    if (!user?.id) {
      setMarketplaceEnabled(true)
      setMarketplaceGateChecked(true)
      return
    }
=======
    if (!user?.id) return
>>>>>>> 84601ec (minha alteração)
    setUserId(user.id)

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const r = (profile?.role || 'user') as Role
    setRole(r)
<<<<<<< HEAD

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
=======
>>>>>>> 84601ec (minha alteração)
  }, [supabase])

  const loadHealth = useCallback(async () => {
    setLoadingHealth(true)
    try {
      const res = await fetch('/api/marketplace/health', { cache: 'no-store' })
      const json = (await res.json().catch(() => ({}))) as MarketplaceHealth
      setHealth(json)
    } catch (e: any) {
      setHealth({ ok: false, error: e?.message || String(e) })
    } finally {
      setLoadingHealth(false)
    }
  }, [])

  const loadTeachers = useCallback(async () => {
    setLoadingTeachers(true)
    try {
      const res = await fetch('/api/admin/teachers/list', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!json?.ok) {
        setTeachers([])
        return
      }
      const rows = Array.isArray(json?.teachers) ? (json.teachers as AdminTeacherRow[]) : []
      setTeachers(rows)
    } catch {
      setTeachers([])
    } finally {
      setLoadingTeachers(false)
    }
  }, [])

  const onSaveTeacherWallet = useCallback(async () => {
    if (savingTeacher) return
    const email = (teacherEmail || '').trim().toLowerCase()
    const walletId = (teacherWalletId || '').trim()
    if (!email || !walletId) {
      window.alert('Preencha email e walletId.')
      return
    }
    setSavingTeacher(true)
    try {
      const res = await fetch('/api/admin/teachers/asaas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, user_id: teacherUserId || undefined, asaas_wallet_id: walletId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!json?.ok) {
        window.alert(json?.error || 'Falha ao salvar walletId.')
        return
      }
      setTeacherEmail('')
      setTeacherUserId('')
      setTeacherWalletId('')
      await loadTeachers()
      window.alert('WalletId salvo.')
    } catch (e: any) {
      window.alert(e?.message || String(e))
    } finally {
      setSavingTeacher(false)
    }
  }, [savingTeacher, teacherEmail, teacherUserId, teacherWalletId, loadTeachers])

  const openCreateWallet = useCallback(() => {
    const email = (teacherEmail || '').trim().toLowerCase()
    if (!email) {
      window.alert('Preencha o email do professor.')
      return
    }
    const found = (teachers ?? []).find((t) => (t?.email || '').toLowerCase().trim() === email)
    setSubName((found?.name || '').trim())
    setSubCpfCnpj('')
    setSubBirthDate('')
    setSubCompanyType('')
    setSubPhone('')
    setSubMobilePhone('')
    setSubPostalCode('')
    setSubAddress('')
    setSubAddressNumber('')
    setSubComplement('')
    setSubProvince('')
    setSubIncomeValue('')
    setCreateWalletOpen(true)
  }, [teacherEmail, teachers])

  const closeCreateWallet = useCallback(() => {
    setCreateWalletOpen(false)
    setCreatingWallet(false)
  }, [])

  const onCreateTeacherWalletViaApi = useCallback(async () => {
    if (creatingWallet) return
    const email = (teacherEmail || '').trim().toLowerCase()
    if (!email) {
      window.alert('Preencha o email do professor.')
      return
    }
    setCreatingWallet(true)
    try {
      const res = await fetch('/api/admin/teachers/asaas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_subaccount',
          email,
          user_id: teacherUserId || undefined,
          name: subName,
          cpfCnpj: subCpfCnpj,
          birthDate: subBirthDate,
          companyType: subCompanyType,
          phone: subPhone,
          mobilePhone: subMobilePhone,
          postalCode: subPostalCode,
          address: subAddress,
          addressNumber: subAddressNumber,
          complement: subComplement,
          province: subProvince,
          incomeValue: subIncomeValue,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!json?.ok) {
        window.alert(json?.error || 'Falha ao criar subconta no Asaas.')
        return
      }
      closeCreateWallet()
      setTeacherWalletId(String(json?.teacher?.asaas_wallet_id || ''))
      await loadTeachers()
      window.alert('WalletId criado e salvo.')
    } catch (e: any) {
      window.alert(e?.message || String(e))
    } finally {
      setCreatingWallet(false)
    }
  }, [creatingWallet, teacherEmail, teacherUserId, subName, subCpfCnpj, subBirthDate, subCompanyType, subPhone, subMobilePhone, subPostalCode, subAddress, subAddressNumber, subComplement, subProvince, subIncomeValue, closeCreateWallet, loadTeachers])

  const loadPlans = useCallback(async (teacherUserId?: string) => {
    setLoadingPlans(true)
    try {
      const qs = teacherUserId ? `?teacherUserId=${encodeURIComponent(teacherUserId)}` : ''
      const res = await fetch(`/api/marketplace/plans${qs}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!json?.ok) {
        const msg = json?.error || 'Falha ao carregar planos.'
        window.alert(msg)
        setPlans([])
        return
      }
      const rows = Array.isArray(json?.plans) ? (json.plans as TeacherPlan[]) : []
      setPlans(rows)
    } catch (e: any) {
      window.alert(e?.message || String(e))
      setPlans([])
    } finally {
      setLoadingPlans(false)
    }
  }, [])

  useEffect(() => {
    loadMe().catch(() => {})
  }, [loadMe])

  useEffect(() => {
    if (!userId) return
    if (role === 'teacher' || role === 'admin') {
      loadPlans(userId).catch(() => {})
    } else {
      loadPlans().catch(() => {})
    }
  }, [role, userId, loadPlans])

  const toPriceCents = (value: string) => {
    const raw = (value || '').trim().replace(/\./g, '').replace(',', '.')
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.round(n * 100)
  }

  const onCreatePlan = useCallback(async () => {
    if (creating) return
    const priceCents = toPriceCents(planPrice)
    if (!planName.trim() || priceCents <= 0) {
      window.alert('Preencha nome e preço válidos.')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/marketplace/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: planName.trim(),
          description: planDescription.trim(),
          priceCents,
          interval: planInterval,
          status: 'active',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!json?.ok) {
        window.alert(json?.error || 'Falha ao criar plano.')
        return
      }
      closeCreate()
      setPlanName('')
      setPlanDescription('')
      setPlanPrice('89,90')
      setPlanInterval('month')
      await loadPlans(userId)
    } catch (e: any) {
      window.alert(e?.message || String(e))
    } finally {
      setCreating(false)
    }
  }, [creating, planName, planDescription, planPrice, planInterval, closeCreate, loadPlans, userId])

  const openCheckout = useCallback((plan: TeacherPlan) => {
    setSelectedPlan(plan)
    setCpfCnpj('')
    setMobilePhone('')
    setPayerName('')
    setCheckoutResult(null)
    setCheckoutOpen(true)
  }, [])

  const onCheckout = useCallback(async () => {
    if (checkingOut || !selectedPlan?.id) return
    setCheckingOut(true)
    setCheckoutResult(null)
    try {
      const res = await fetch('/api/marketplace/checkout', {
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
      if (!json?.ok) {
        window.alert(json?.error || 'Falha no checkout.')
      }
    } catch (e: any) {
      const msg = e?.message || String(e)
      setCheckoutResult({ ok: false, error: msg })
      window.alert(msg)
    } finally {
      setCheckingOut(false)
    }
  }, [checkingOut, selectedPlan, cpfCnpj, mobilePhone, payerName])

  const copy = useCallback(async (text: string) => {
    const value = (text || '').trim()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {}
  }, [])

  const isTeacher = role === 'teacher' || role === 'admin'
  const isAdmin = role === 'admin'

  useEffect(() => {
    if (!adminOpen || !isAdmin) return
    loadHealth().catch(() => {})
    loadTeachers().catch(() => {})
  }, [adminOpen, isAdmin, loadHealth, loadTeachers])

<<<<<<< HEAD
  if (marketplaceGateChecked && userId && !marketplaceEnabled) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="bg-neutral-800 rounded-2xl border border-neutral-700 p-4">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Marketplace</div>
            <div className="text-lg font-black text-white mt-1">Módulo desativado</div>
            <div className="text-sm text-neutral-300 mt-2">Ative em Configurações → Módulos opcionais.</div>
            <a
              href="/dashboard"
              className={`${minButtonClass} mt-4 inline-flex items-center justify-center px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400`}
            >
              Voltar ao Dashboard
            </a>
          </div>
        </div>
      </div>
    )
  }

=======
>>>>>>> 84601ec (minha alteração)
  return (
    <div className="min-h-screen bg-neutral-900 text-white p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-neutral-800 rounded-2xl border border-neutral-700 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold">Marketplace</h1>
              <p className="text-sm text-neutral-300">Planos e assinatura via Pix</p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => setAdminOpen(true)}
                  className={`${minButtonClass} px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-yellow-500 font-bold flex items-center gap-2`}
                >
                  <Settings size={18} />
                  Config
                </button>
              )}
              {isTeacher && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className={`${minButtonClass} px-4 py-3 rounded-xl bg-yellow-500 text-black font-bold flex items-center gap-2`}
                >
                  <Plus size={18} />
                  Novo plano
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {loadingPlans && (
            <div className="text-center py-8 text-neutral-400">Carregando...</div>
          )}

          {!loadingPlans && (plans ?? []).length === 0 && (
            <div className="text-center py-8 text-neutral-400">Nenhum plano encontrado.</div>
          )}

          {(plans ?? []).map((p) => (
            <button
              key={p.id}
              onClick={() => openCheckout(p)}
              className="w-full text-left bg-neutral-800 rounded-2xl border border-neutral-700 p-4 hover:border-neutral-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-white">{p.name}</div>
                  {p.description ? (
                    <div className="text-sm text-neutral-300 mt-1">{p.description}</div>
                  ) : null}
                  <div className="text-sm text-neutral-400 mt-2">
                    {formatMoney(p.price_cents)} / {p.interval === 'year' ? 'ano' : 'mês'}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-yellow-500">
                  <QrCode size={18} />
                  <span className="text-sm font-bold">Assinar</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-800/50 rounded-t-2xl">
              <h3 className="font-bold text-white flex items-center gap-2">
                <CreditCard className="text-yellow-500" size={20} />
                Novo plano
              </h3>
              <button onClick={closeCreate} className={`${minButtonClass} p-2 hover:bg-neutral-700 rounded-full transition-colors`}>
                <X size={20} className="text-neutral-300" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <input
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="Nome do plano"
                className="w-full bg-neutral-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500"
              />

              <textarea
                value={planDescription}
                onChange={(e) => setPlanDescription(e.target.value)}
                placeholder="Descrição (opcional)"
                className="w-full bg-neutral-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 min-h-[90px]"
              />

              <div className="grid grid-cols-2 gap-3">
                <input
                  value={planPrice}
                  onChange={(e) => setPlanPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="Preço (ex: 89,90)"
                  className="w-full bg-neutral-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500"
                />
                <select
                  value={planInterval}
                  onChange={(e) => setPlanInterval((e.target.value as any) === 'year' ? 'year' : 'month')}
                  className="w-full bg-neutral-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50"
                >
                  <option value="month">Mensal</option>
                  <option value="year">Anual</option>
                </select>
              </div>

              <button
                onClick={onCreatePlan}
                disabled={creating}
                className={`${minButtonClass} w-full px-4 py-3 rounded-xl bg-yellow-500 text-black font-bold disabled:opacity-60`}
              >
                {creating ? 'Criando...' : 'Criar plano'}
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutOpen && selectedPlan && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-800/50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-white">Assinar</h3>
                <div className="text-sm text-neutral-300">{selectedPlan.name}</div>
              </div>
              <button onClick={closeCheckout} className={`${minButtonClass} p-2 hover:bg-neutral-700 rounded-full transition-colors`}>
                <X size={20} className="text-neutral-300" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-3">
                <div className="text-sm text-neutral-300">Valor</div>
                <div className="text-lg font-bold">{formatMoney(selectedPlan.price_cents)} / {selectedPlan.interval === 'year' ? 'ano' : 'mês'}</div>
              </div>

              <input
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                placeholder="Seu nome"
                className="w-full bg-neutral-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500"
              />
              <input
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(e.target.value)}
                inputMode="numeric"
                placeholder="CPF/CNPJ"
                className="w-full bg-neutral-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500"
              />
              <input
                value={mobilePhone}
                onChange={(e) => setMobilePhone(e.target.value)}
                inputMode="tel"
                placeholder="Celular (DDD + número)"
                className="w-full bg-neutral-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500"
              />

              <button
                onClick={onCheckout}
                disabled={checkingOut}
                className={`${minButtonClass} w-full px-4 py-3 rounded-xl bg-yellow-500 text-black font-bold disabled:opacity-60 flex items-center justify-center gap-2`}
              >
                <QrCode size={18} />
                {checkingOut ? 'Gerando Pix...' : 'Gerar Pix'}
              </button>

              {checkoutResult?.ok && checkoutResult.payment && (
                <div className="bg-neutral-800 rounded-2xl border border-neutral-700 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-white">Pix</div>
                    {checkoutResult.payment.invoice_url ? (
                      <a
                        href={checkoutResult.payment.invoice_url}
                        target="_blank"
                        rel="noreferrer"
                        className={`${minButtonClass} px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-yellow-500 font-bold flex items-center gap-2`}
                      >
                        <ExternalLink size={16} />
                        Link
                      </a>
                    ) : null}
                  </div>

                  {checkoutResult.payment.pix_qr_code ? (
                    <div className="flex items-center justify-center">
                      <Image
                        src={normalizePixImageSrc(checkoutResult.payment.pix_qr_code)}
                        alt="QR Code Pix"
                        width={PIX_QR_SIZE}
                        height={PIX_QR_SIZE}
                        className="w-56 h-56 bg-white rounded-xl"
                        unoptimized
                      />
                    </div>
                  ) : null}

                  {checkoutResult.payment.pix_payload ? (
                    <div className="space-y-2">
                      <div className="text-sm text-neutral-300">Pix copia e cola</div>
                      <div className="flex gap-2">
                        <input
                          value={checkoutResult.payment.pix_payload}
                          readOnly
                          className="w-full bg-neutral-900 text-white px-3 py-3 rounded-xl outline-none border border-neutral-700 text-xs"
                        />
                        <button
                          onClick={() => copy(checkoutResult.payment?.pix_payload || '')}
                          className={`${minButtonClass} px-3 py-3 rounded-xl bg-yellow-500 text-black font-bold`}
                        >
                          <Copy size={18} />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {adminOpen && isAdmin && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-800/50 rounded-t-2xl">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Settings className="text-yellow-500" size={20} />
                Config Marketplace
              </h3>
              <button onClick={closeAdmin} className={`${minButtonClass} p-2 hover:bg-neutral-700 rounded-full transition-colors`}>
                <X size={20} className="text-neutral-300" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-neutral-800 rounded-2xl border border-neutral-700 p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-white flex items-center gap-2">
                    <ShieldCheck size={18} className="text-yellow-500" />
                    Saúde
                  </div>
                  <button
                    onClick={loadHealth}
                    disabled={loadingHealth}
                    className={`${minButtonClass} px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white font-bold disabled:opacity-60`}
                  >
                    {loadingHealth ? '...' : 'Atualizar'}
                  </button>
                </div>

                <div className="text-sm text-neutral-300">
                  API Key Asaas: {(health?.asaas_api_key_configured ? 'OK' : 'FALTANDO')}
                </div>
                <div className="text-sm text-neutral-300">
                  Webhook Secret: {(health?.asaas_webhook_secret_configured ? 'OK' : 'FALTANDO')}
                </div>
                <div className="text-sm text-neutral-300">
                  Base URL: {health?.asaas_base_url || '-'}
                </div>
                <div className="text-sm text-neutral-300">
                  User-Agent: {(health?.asaas_user_agent_configured ? 'OK' : 'FALTANDO')}
                </div>
                <div className="text-sm text-neutral-300">
                  Ambiente: {(health?.asaas_base_environment || '-')}
                </div>
                <div className="text-sm text-neutral-300">
                  Service Role: {(health?.supabase_service_role_configured ? 'OK' : 'FALTANDO')}
                </div>
                <div className="text-sm text-neutral-300">
                  Taxa plataforma: {(health?.platform_fee_percent ?? 15)}% ({health?.platform_fee_source || 'default'})
                </div>

                {health?.asaas_environment_mismatch ? (
                  <div className="text-sm text-yellow-400 flex items-start gap-2">
                    <AlertTriangle size={18} className="mt-0.5" />
                    <span>
                      Ambiente Asaas inconsistente (key: {health?.asaas_key_environment || 'unknown'} vs base: {health?.asaas_base_environment || '-'})
                    </span>
                  </div>
                ) : null}

                {health && health.ok === false && health.error ? (
                  <div className="text-sm text-red-400 flex items-start gap-2">
                    <AlertTriangle size={18} className="mt-0.5" />
                    <span>{health.error}</span>
                  </div>
                ) : null}
              </div>

              <div className="bg-neutral-800 rounded-2xl border border-neutral-700 p-4 space-y-3">
                <div className="font-bold text-white">Onboarding professor (walletId)</div>
                <input
                  value={teacherEmail}
                  onChange={(e) => setTeacherEmail(e.target.value)}
                  placeholder="Email do professor"
                  inputMode="email"
                  className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
                />
                <input
                  value={teacherWalletId}
                  onChange={(e) => setTeacherWalletId(e.target.value)}
                  placeholder="Asaas walletId"
                  className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
                />
                <button
                  onClick={onSaveTeacherWallet}
                  disabled={savingTeacher}
                  className={`${minButtonClass} w-full px-4 py-3 rounded-xl bg-yellow-500 text-black font-bold disabled:opacity-60`}
                >
                  {savingTeacher ? 'Salvando...' : 'Salvar walletId'}
                </button>
                <button
                  onClick={openCreateWallet}
                  disabled={creatingWallet}
                  className={`${minButtonClass} w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-white font-bold disabled:opacity-60`}
                >
                  {creatingWallet ? 'Criando...' : 'Criar walletId via Asaas (API)'}
                </button>
              </div>

              <div className="bg-neutral-800 rounded-2xl border border-neutral-700 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-white">Professores sem walletId</div>
                  <button
                    onClick={loadTeachers}
                    disabled={loadingTeachers}
                    className={`${minButtonClass} px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white font-bold disabled:opacity-60`}
                  >
                    {loadingTeachers ? '...' : 'Recarregar'}
                  </button>
                </div>

                {((teachers ?? []).filter((t) => !String(t?.asaas_wallet_id || '').trim()).length === 0) ? (
                  <div className="text-sm text-neutral-400">Tudo certo.</div>
                ) : (
                  <div className="space-y-2">
                    {(teachers ?? [])
                      .filter((t) => !String(t?.asaas_wallet_id || '').trim())
                      .slice(0, 10)
                      .map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setTeacherEmail((t.email || '').toLowerCase())
                            setTeacherUserId((t.user_id || '') as string)
                          }}
                          className="w-full text-left bg-neutral-900 border border-neutral-700 rounded-xl p-3 hover:border-neutral-600 transition-colors"
                        >
                          <div className="font-bold text-white truncate">{t.name || t.email || 'Professor'}</div>
                          <div className="text-xs text-neutral-400 truncate">{(t.email || '').toLowerCase()}</div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {createWalletOpen && adminOpen && isAdmin && (
        <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-800/50 rounded-t-2xl">
              <h3 className="font-bold text-white">Criar subconta Asaas</h3>
              <button onClick={closeCreateWallet} className={`${minButtonClass} p-2 hover:bg-neutral-700 rounded-full transition-colors`}>
                <X size={20} className="text-neutral-300" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-xs text-neutral-400">Professor</div>
              <div className="bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white">
                {(teacherEmail || '').trim().toLowerCase() || '-'}
              </div>

              <input
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="Nome completo"
                className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
              />
              <input
                value={subCpfCnpj}
                onChange={(e) => setSubCpfCnpj(e.target.value)}
                placeholder="CPF/CNPJ"
                inputMode="numeric"
                className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
              />
              <input
                value={subBirthDate}
                onChange={(e) => setSubBirthDate(e.target.value)}
                placeholder="Nascimento (YYYY-MM-DD)"
                className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
              />
              <input
                value={subCompanyType}
                onChange={(e) => setSubCompanyType(e.target.value)}
                placeholder="Tipo (ex: MEI, LTDA)"
                className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={subMobilePhone}
                  onChange={(e) => setSubMobilePhone(e.target.value)}
                  placeholder="Celular"
                  inputMode="tel"
                  className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
                />
                <input
                  value={subPhone}
                  onChange={(e) => setSubPhone(e.target.value)}
                  placeholder="Telefone (opcional)"
                  inputMode="tel"
                  className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={subPostalCode}
                  onChange={(e) => setSubPostalCode(e.target.value)}
                  placeholder="CEP"
                  inputMode="numeric"
                  className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
                />
                <input
                  value={subProvince}
                  onChange={(e) => setSubProvince(e.target.value)}
                  placeholder="Bairro"
                  className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={subAddress}
                  onChange={(e) => setSubAddress(e.target.value)}
                  placeholder="Endereço"
                  className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
                />
                <input
                  value={subAddressNumber}
                  onChange={(e) => setSubAddressNumber(e.target.value)}
                  placeholder="Número"
                  className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
                />
              </div>
              <input
                value={subComplement}
                onChange={(e) => setSubComplement(e.target.value)}
                placeholder="Complemento (opcional)"
                className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
              />
              <input
                value={subIncomeValue}
                onChange={(e) => setSubIncomeValue(e.target.value)}
                placeholder="Renda/Faturamento mensal (ex: 5000)"
                inputMode="decimal"
                className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 placeholder:text-neutral-500 border border-neutral-700"
              />

              <button
                onClick={onCreateTeacherWalletViaApi}
                disabled={creatingWallet}
                className={`${minButtonClass} w-full px-4 py-3 rounded-xl bg-yellow-500 text-black font-bold disabled:opacity-60`}
              >
                {creatingWallet ? 'Criando...' : 'Criar e salvar walletId'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
