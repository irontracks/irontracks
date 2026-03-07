'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Crown, Sparkles, ArrowRight, Lock, MessageSquare, CalendarDays, TrendingUp, Trash2, Zap, BarChart3, ChefHat, FileText } from 'lucide-react'
import { isIosNative } from '@/utils/platform'
import VipPeriodizationPanel from '@/components/vip/VipPeriodizationPanel'
import VipWeeklySummaryCard from '@/components/vip/VipWeeklySummaryCard'
import VipInsightsPanel from '@/components/vip/VipInsightsPanel'
import { useVipCredits } from '@/hooks/useVipCredits'
import { useDialog } from '@/contexts/DialogContext'
import { useRouter } from 'next/navigation'
import type { Workout } from '@/types/app'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

interface VipHubProps {
  user: {
    displayName?: string | null
    name?: string | null
  } | null
  locked?: boolean
  onOpenWorkoutEditor?: (workout?: Workout) => void
  onOpenVipTab?: () => void
  onStartSession?: (workout: Workout) => void
  onOpenWizard?: () => void
  onOpenHistory?: () => void
  onOpenReport?: (s?: Record<string, unknown>) => void
}

interface ChatAction {
  label: string
  action: string
  [key: string]: unknown
}

interface ChatMessage {
  id: string
  role: string
  text: string
  isLimit?: boolean
  dataUsed?: Record<string, unknown>[]
  followUps?: string[]
  actions?: ChatAction[]
}

interface VipStatus {
  tier?: string
  limits?: {
    history_days?: number
    nutrition_macros?: boolean
    chat_daily?: number
  }
  usage?: {
    chat_daily?: number
  }
}

export default function VipHub({ user, locked, onOpenWorkoutEditor, onOpenVipTab, onStartSession, onOpenWizard, onOpenHistory, onOpenReport }: VipHubProps) {
  const isLocked = !!locked
  const hideVipCtas = isIosNative()
  const name = useMemo(() => String(user?.displayName || user?.name || '').trim(), [user?.displayName, user?.name])
  const [mode, setMode] = useState('coach')
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [vipStatus, setVipStatus] = useState<VipStatus | null>(null)
  const { credits } = useVipCredits()
  const { confirm } = useDialog()
  const router = useRouter()
  const chatRef = useRef<HTMLDivElement | null>(null)
  const [weeklyOpen, setWeeklyOpen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)

  // Load VIP Status
  useEffect(() => {
    if (hideVipCtas) return
    let cancelled = false
      ; (async () => {
        try {
          const res = await fetch('/api/vip/status', { credentials: 'include', cache: 'no-store' })
          const data = await res.json().catch(() => null) as Record<string, unknown> | null
          if (cancelled) return
          if (data && typeof data === 'object' && data.ok) setVipStatus(data as VipStatus)
        } catch {
        }
      })()
    return () => {
      cancelled = true
    }
  }, [hideVipCtas])

  const [threadId, setThreadId] = useState('')
  const [chatLoaded, setChatLoaded] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const presets = useMemo(() => {
    if (mode === 'planner') {
      return [
        'Crie um bloco de 4 semanas para hipertrofia (4x/semana).',
        'Monte uma periodização de 6 semanas para subir supino.',
        'Tenho 35 minutos. Monte um treino eficiente hoje.',
      ]
    }
    if (mode === 'diagnostic') {
      return [
        'Por que meu progresso travou nas últimas 4 semanas?',
        'Estou com fadiga alta. Ajuste meu volume semanal.',
        'Me diga meus pontos fracos com base nos treinos.',
      ]
    }
    return [
      'Sugira meu treino de hoje com base no último.',
      'Quais ajustes fazer hoje para evoluir com menos fadiga?',
      'Crie um aquecimento completo para supino.',
    ]
  }, [mode])

  const send = async () => {
    const text = String(draft || '').trim()
    if (!text || busy) return
    const chatCredits = credits?.chat
    if (chatCredits && chatCredits.limit !== null && chatCredits.used >= chatCredits.limit) {
      const ok = await confirm(
        'Seus créditos do Coach IA acabaram. Assine o VIP para liberar mais mensagens.',
        'Créditos esgotados',
        { confirmText: 'Assinar VIP', cancelText: 'Agora não' }
      )
      if (ok) {
        if (typeof onOpenVipTab === 'function') {
          onOpenVipTab()
        } else {
          try {
            sessionStorage.setItem('irontracks_open_vip', '1')
          } catch { }
          router.push('/dashboard')
        }
      }
      return
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id, role: 'user', text }].slice(-60))
    setDraft('')
    try {
      if (inputRef.current) inputRef.current.focus()
    } catch { }

    setBusy(true)
    try {
      let tid = String(threadId || '').trim()
      if (!tid) {
        const tRes = await fetch('/api/vip/chat/thread', { method: 'GET', credentials: 'include', cache: 'no-store' })
        const tJson = await tRes.json().catch(() => null) as Record<string, unknown> | null
        const thread = tJson && typeof tJson === 'object' ? (tJson.thread as Record<string, unknown> | undefined) : undefined
        tid = String(thread?.id || '').trim()
        if (tid) setThreadId(tid)
      }
      if (tid) {
        await fetch('/api/vip/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ thread_id: tid, role: 'user', content: text }),
        }).catch(() => null)
      }
      const res = await fetch('/api/ai/vip-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, mode }),
      })
      const json = await res.json().catch(() => null) as Record<string, unknown> | null

      // Handle Limit Reached
      if (res.status === 403 && json?.upgradeRequired) {
        const msg: ChatMessage = {
          id: `${id}-limit`,
          role: 'assistant',
          text: String(json.message || 'Limite atingido. Faça upgrade para continuar.'),
          isLimit: true
        }
        setMessages((prev) => [...(Array.isArray(prev) ? prev : []), msg].slice(-60))
        return
      }

      if (!json || json.ok !== true) {
        const err = String(json?.error || 'Falha ao consultar a IA.').trim()
        const msg: ChatMessage = { id: `${id}-a`, role: 'assistant', text: err, actions: [] }
        setMessages((prev) => [...(Array.isArray(prev) ? prev : []), msg].slice(-60))
        return
      }
      const dataUsed = Array.isArray(json.dataUsed)
        ? (json.dataUsed as unknown[]).filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')
        : []
      const followUps = Array.isArray(json.followUps)
        ? (json.followUps as unknown[]).map((f) => String(f || '').trim()).filter(Boolean)
        : []
      const actions = Array.isArray(json.actions)
        ? (json.actions as unknown[])
          .map((a) => {
            if (!a || typeof a !== 'object') return null
            const obj = a as Record<string, unknown>
            const label = String(obj.label ?? obj.text ?? '').trim()
            const action = String(obj.action ?? '').trim()
            if (!label || !action) return null
            return { ...(obj as ChatAction), label, action }
          })
          .filter((a): a is ChatAction => Boolean(a))
        : []
      const assistant: ChatMessage = {
        id: `${id}-a`,
        role: 'assistant',
        text: String(json.answer || '').trim(),
        dataUsed,
        followUps,
        actions,
      }
      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), assistant].slice(-60))

      // Update usage locally
      if (vipStatus) {
        setVipStatus(prev => {
          if (!prev) return null
          return {
            ...prev,
            usage: {
              ...prev.usage,
              chat_daily: (prev.usage?.chat_daily || 0) + 1
            }
          }
        })
      }

    } catch {
      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id: `${id}-a`, role: 'assistant', text: 'Falha ao consultar a IA.' }].slice(-60))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (isLocked) return
    if (chatLoaded) return
    if (chatLoading) return
    let cancelled = false
    setChatLoading(true)
      ; (async () => {
        try {
          const tRes = await fetch('/api/vip/chat/thread', { method: 'GET', credentials: 'include', cache: 'no-store' })
          const tJson = await tRes.json().catch(() => null) as Record<string, unknown> | null
          const thread = tJson && typeof tJson === 'object' ? (tJson.thread as Record<string, unknown> | undefined) : undefined
          const tid = String(thread?.id || '').trim()
          if (!tid) return
          if (cancelled) return
          setThreadId(tid)
          const mRes = await fetch(`/api/vip/chat/messages?thread_id=${encodeURIComponent(tid)}&limit=80`, { method: 'GET', credentials: 'include', cache: 'no-store' })
          const mJson = await mRes.json().catch(() => null) as Record<string, unknown> | null
          if (cancelled) return
          const rows = Array.isArray(mJson?.messages) ? mJson.messages : []
          const parsed = rows.map((r: unknown) => {
            const obj = r && typeof r === 'object' ? (r as Record<string, unknown>) : {}
            const role = String(obj.role || '').trim()
            const raw = String(obj.content || '')
            // Simple parsing
            if (role === 'assistant' && raw.trim().startsWith('{')) {
              const p = parseJsonWithSchema(raw, z.record(z.unknown()))
              if (p) {
                return {
                  id: String((obj.id ?? '') || String(Date.now())),
                  role,
                  text: String(p.text || p.answer || raw),
                  dataUsed: Array.isArray(p.dataUsed)
                    ? (p.dataUsed as unknown[]).filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')
                    : undefined,
                  followUps: Array.isArray(p.followUps)
                    ? (p.followUps as unknown[]).map((f) => String(f || '').trim()).filter(Boolean)
                    : undefined,
                  actions: Array.isArray(p.actions)
                    ? (p.actions as unknown[])
                      .map((a) => {
                        if (!a || typeof a !== 'object') return null
                        const ao = a as Record<string, unknown>
                        const label = String(ao.label ?? ao.text ?? '').trim()
                        const action = String(ao.action ?? '').trim()
                        if (!label || !action) return null
                        return { ...(ao as ChatAction), label, action }
                      })
                      .filter((a): a is ChatAction => Boolean(a))
                    : undefined,
                } as ChatMessage
              }
            }
            return {
              id: String((obj.id ?? '') || String(Date.now())),
              role,
              text: raw,
            } as ChatMessage
          })
          setMessages(parsed.slice(-60))
        } catch {
        } finally {
          if (!cancelled) {
            setChatLoading(false)
            setChatLoaded(true)
          }
        }
      })()
    return () => { cancelled = true }
  }, [chatLoaded, chatLoading, isLocked])

  const renderLimitBar = () => {
    if (!vipStatus) return null
    const { limits, usage } = vipStatus
    const limit = limits?.chat_daily
    const current = usage?.chat_daily || 0

    if (!limit || limit > 9000) return (
      <div className="flex items-center gap-2 text-xs font-bold text-purple-400 bg-purple-500/10 px-3 py-1.5 rounded-full border border-purple-500/20">
        <Sparkles size={12} />
        <span>Acesso Ilimitado</span>
      </div>
    )

    const pct = Math.min(100, (current / limit) * 100)
    const isClose = pct > 80

    return (
      <div className="flex items-center gap-3 bg-neutral-900/50 px-3 py-1.5 rounded-full border border-neutral-800">
        <div className="text-xs font-bold text-neutral-400">
          IA Diária: <span className={isClose ? 'text-red-400' : 'text-white'}>{current}/{limit}</span>
        </div>
        <div className="w-16 h-1.5">
          <svg className="w-full h-1.5" viewBox="0 0 100 6" preserveAspectRatio="none">
            <rect x="0" y="0" width="100" height="6" rx="3" fill="#27272a" />
            <rect
              x="0"
              y="0"
              width={pct}
              height="6"
              rx="3"
              fill={isClose ? '#ef4444' : '#22c55e'}
            />
          </svg>
        </div>
        {isClose && !hideVipCtas && (
          <button
            onClick={() => window.location.href = '/marketplace'}
            className="text-[10px] font-black uppercase text-yellow-500 hover:text-yellow-400"
          >
            Upgrade
          </button>
        )}
      </div>
    )
  }

  if (isLocked) {
    return (
      <div className="rounded-2xl p-[1px]" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.4) 0%, rgba(255,255,255,0.04) 50%, rgba(234,179,8,0.15) 100%)' }}>
        <div className="rounded-[15px] p-8 text-center space-y-6" style={{ background: 'rgba(15,15,15,0.98)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 8px 32px rgba(234,179,8,0.3)' }}>
            <Crown size={32} fill="currentColor" className="text-black" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">Área VIP Exclusiva</h2>
            <p className="text-neutral-400 mt-2 max-w-md mx-auto text-sm">
              Desbloqueie o Coach IA, Nutrição Avançada, Histórico Ilimitado e muito mais.
            </p>
          </div>
          {!hideVipCtas ? (
            <button
              onClick={() => window.location.href = '/marketplace'}
              className="px-8 py-3.5 rounded-xl font-black text-black text-sm transition-all active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)', boxShadow: '0 4px 20px rgba(234,179,8,0.35)' }}
            >
              Ver Planos e Assinar
            </button>
          ) : (
            <div className="text-xs font-bold text-neutral-400">Planos indisponíveis no iOS no momento.</div>
          )}
        </div>
      </div>
    )
  }

  const tierLabel =
    vipStatus?.tier?.includes('elite') || vipStatus?.tier === 'admin'
      ? 'Membro Elite'
      : vipStatus?.tier?.includes('pro')
        ? 'Membro Pro'
        : 'Membro Start'

  const historyDays = vipStatus?.limits?.history_days
  const historySubtitle = historyDays == null ? 'Histórico ilimitado' : `Histórico: ${Number(historyDays) || 0} dias`
  const macrosEnabled = !!vipStatus?.limits?.nutrition_macros
  const nutritionSubtitle = macrosEnabled ? 'Macros liberado' : 'Macros (Pro+)'

  const openNutrition = () => {
    try {
      window.location.href = '/dashboard/nutrition'
    } catch { }
  }

  const openChat = () => {
    try {
      if (chatRef.current) chatRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch { }
  }

  const chip = (label: string, used: number | null | undefined, limit: number | null | undefined) => {
    const u = Number(used || 0)
    const l = limit == null ? null : Number(limit)
    const unlimited = l == null || l > 1000
    const txt = unlimited ? `${label}: ∞` : l != null && Number.isFinite(l) ? `${label}: ${u}/${l}` : `${label}: ${u}`
    const danger = !unlimited && l != null && Number.isFinite(l) && l > 0 && u >= l
    const cls = danger ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-neutral-800 bg-neutral-900/40 text-neutral-200'
    return <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-xl border ${cls}`}>{txt}</div>
  }

  if (hideVipCtas) return null

  return (
    <div className="space-y-4">
      {/* Header VIP Card */}
      <div className="rounded-2xl p-[1px]" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.4) 0%, rgba(255,255,255,0.04) 50%, rgba(234,179,8,0.15) 100%)' }}>
        <div className="rounded-[15px] p-4" style={{ background: 'rgba(12,12,12,0.99)' }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-black" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 16px rgba(234,179,8,0.3)' }}>
                <Crown size={20} fill="currentColor" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: '#f59e0b' }}>{tierLabel}</div>
                <div className="text-white font-bold text-sm">Dashboard VIP</div>
              </div>
            </div>
            {renderLimitBar()}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {credits?.chat ? chip('Chat', credits.chat.used, credits.chat.limit) : null}
            {credits?.wizard ? chip('Wizard', credits.wizard.used, credits.wizard.limit) : null}
            {credits?.insights ? chip('Insights', credits.insights.used, credits.insights.limit) : null}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            {[
              { onClick: openChat, icon: <MessageSquare size={18} className="text-blue-400" />, label: 'Coach IA', sub: 'Pergunte e ajuste hoje' },
              { onClick: () => onOpenWizard?.(), icon: <Zap size={18} className="text-yellow-400" />, label: 'Wizard', sub: 'Gere treino rápido' },
              { onClick: () => setInsightsOpen((v) => !v), icon: <Sparkles size={18} className="text-purple-300" />, label: 'Insights', sub: 'Relatórios e PRs' },
              { onClick: () => onOpenHistory?.(), icon: <BarChart3 size={18} className="text-purple-400" />, label: 'Histórico', sub: historySubtitle },
              { onClick: () => setWeeklyOpen((v) => !v), icon: <TrendingUp size={18} className="text-green-400" />, label: 'Resumo', sub: 'Últimos 7 dias' },
              { onClick: openNutrition, icon: <ChefHat size={18} className="text-green-400" />, label: 'Nutrição', sub: nutritionSubtitle },
              { onClick: () => setWeeklyOpen(true), icon: <FileText size={18} className="text-neutral-200" />, label: 'Relatório', sub: 'Atalhos e dados' },
              { onClick: () => { try { const el = document.getElementById('vip-periodization'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }) } catch { } }, icon: <CalendarDays size={18} className="text-yellow-400" />, label: 'Periodização', sub: 'Programa completo' },
            ].map(({ onClick, icon, label, sub }, i) => (
              <button
                key={i}
                type="button"
                onClick={onClick}
                className="min-h-[56px] p-3 rounded-xl flex flex-col items-start justify-center gap-1 text-left transition-all hover:bg-white/5 active:scale-[0.97]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center gap-2">
                  {icon}
                  <div className="text-xs font-black text-white uppercase tracking-wider">{label}</div>
                </div>
                <div className="text-[11px] text-neutral-500">{sub}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {weeklyOpen ? <VipWeeklySummaryCard /> : null}

      {insightsOpen ? <VipInsightsPanel onOpenHistory={() => onOpenHistory?.()} onOpenReport={(s) => onOpenReport?.(s as Record<string, unknown>)} /> : null}

      {/* VIP Features Card */}
      <div className="rounded-2xl p-[1px]" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.2) 0%, rgba(255,255,255,0.03) 50%, rgba(234,179,8,0.08) 100%)' }}>
        <div className="rounded-[15px] p-4" style={{ background: 'rgba(12,12,12,0.99)' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: '#f59e0b' }}>Recursos VIP</div>
              <div className="text-white font-black text-sm">Ferramentas avançadas</div>
            </div>
            <button type="button" onClick={() => (window.location.href = '/marketplace')} className="inline-flex items-center gap-2 text-xs font-black text-neutral-400 hover:text-yellow-400 transition-colors">
              Ver detalhes <ArrowRight size={14} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { href: '/dashboard/vip/chef-ia', title: 'Chef IA', sub: 'Planos e receitas', badge: 'Elite' },
              { href: '/dashboard/vip/offline', title: 'Modo offline', sub: 'Sync inteligente', badge: 'Pro+' },
              { href: '/dashboard/vip/analytics', title: 'Analytics avançado', sub: 'Dash de performance', badge: 'Elite' },
            ].map(({ href, title, sub, badge }) => (
              <button
                key={href}
                type="button"
                onClick={() => (window.location.href = href)}
                className="rounded-xl px-3 py-3 text-left transition-all hover:bg-white/5 active:scale-[0.97]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="text-xs font-black text-white">{title}</div>
                <div className="text-[11px] text-neutral-500">{sub}</div>
                <div className="mt-2 inline-flex items-center rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest" style={{ background: 'rgba(234,179,8,0.1)', color: '#f59e0b', border: '1px solid rgba(234,179,8,0.2)' }}>
                  {badge}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div id="vip-periodization">
        <VipPeriodizationPanel locked={isLocked} onStartSession={(w) => onStartSession?.(w as Workout)} onOpenWorkoutEditor={(w) => onOpenWorkoutEditor?.(w as Workout)} />
      </div>

      {/* Coach IA Chat */}
      <div ref={chatRef} className="rounded-2xl overflow-hidden flex flex-col h-[600px]" style={{ border: '1px solid rgba(234,179,8,0.18)', background: 'rgba(10,10,10,0.99)' }}>
        <div className="px-4 py-3.5 flex justify-between items-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="text-sm font-black text-white flex items-center gap-2">
            <Sparkles size={16} className="text-yellow-500" />
            Coach IA
          </div>
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-xs font-bold text-neutral-500 hover:text-red-400 flex items-center gap-1 transition-colors"
          >
            <Trash2 size={12} />
            Limpar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.2)' }}>
                <Sparkles size={22} className="text-yellow-500" />
              </div>
              <p className="text-sm text-neutral-400">Olá, {name.split(' ')[0]}.</p>
              <p className="text-xs mt-1 text-neutral-600">Como posso ajudar no seu treino hoje?</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.isLimit
                  ? 'bg-red-500/10 border border-red-500/30 text-red-200'
                  : m.role === 'assistant'
                    ? 'text-neutral-200'
                    : 'text-white'
                  }`}
                style={m.isLimit ? {} : m.role === 'assistant'
                  ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }
                  : { background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.2)' }
                }
              >
                {m.text}
                {m.isLimit && !hideVipCtas && (
                  <button onClick={() => window.location.href = '/marketplace'} className="block mt-2 text-xs font-black uppercase text-yellow-500 hover:underline">
                    Fazer Upgrade
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {presets.map((p) => (
              <button key={p} onClick={() => setDraft(p)} className="whitespace-nowrap px-3 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white transition-colors" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {p}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Digite sua mensagem..."
              className="flex-1 rounded-xl px-4 text-sm text-white focus:outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <button
              onClick={send}
              disabled={busy}
              className="font-bold px-4 rounded-xl text-black font-black disabled:opacity-50 transition-all active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: busy ? 'none' : '0 4px 12px rgba(234,179,8,0.3)' }}
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
