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
  const hideVipCtas = useMemo(() => isIosNative(), [])
  if (hideVipCtas) return null
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
    let cancelled = false
    ;(async () => {
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
  }, [])

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
      <div className="rounded-2xl border border-yellow-500/20 bg-neutral-900/60 overflow-hidden p-6 text-center space-y-6">
        <Crown size={48} className="text-yellow-500 mx-auto" />
        <div>
          <h2 className="text-2xl font-black text-white">Área VIP Exclusiva</h2>
          <p className="text-neutral-400 mt-2 max-w-md mx-auto">
            Desbloqueie o Coach IA, Nutrição Avançada, Histórico Ilimitado e muito mais.
          </p>
        </div>
        {!hideVipCtas ? (
          <button
            onClick={() => window.location.href = '/marketplace'}
            className="px-8 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 transition-all scale-105"
          >
            Ver Planos e Assinar
          </button>
        ) : (
          <div className="text-xs font-bold text-neutral-400">
            Planos indisponíveis no iOS no momento.
          </div>
        )}
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-yellow-600 flex items-center justify-center text-black shadow-lg shadow-yellow-500/20">
              <Crown size={20} fill="currentColor" />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-yellow-500">{tierLabel}</div>
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
          <button
            type="button"
            onClick={openChat}
            className="min-h-[56px] p-3 rounded-2xl bg-neutral-950/50 border border-neutral-800 hover:bg-neutral-900/50 transition-colors flex flex-col items-start justify-center gap-1 text-left"
          >
            <div className="flex items-center gap-2">
              <MessageSquare size={18} className="text-blue-400" />
              <div className="text-xs font-black text-white uppercase tracking-widest">Coach IA</div>
            </div>
            <div className="text-[11px] text-neutral-400">Pergunte e ajuste hoje</div>
          </button>

          <button
            type="button"
            onClick={() => onOpenWizard?.()}
            className="min-h-[56px] p-3 rounded-2xl bg-neutral-950/50 border border-neutral-800 hover:bg-neutral-900/50 transition-colors flex flex-col items-start justify-center gap-1 text-left"
          >
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-yellow-400" />
              <div className="text-xs font-black text-white uppercase tracking-widest">Wizard</div>
            </div>
            <div className="text-[11px] text-neutral-400">Gere treino rápido</div>
          </button>

          <button
            type="button"
            onClick={() => setInsightsOpen((v) => !v)}
            className="min-h-[56px] p-3 rounded-2xl bg-neutral-950/50 border border-neutral-800 hover:bg-neutral-900/50 transition-colors flex flex-col items-start justify-center gap-1 text-left"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-purple-300" />
              <div className="text-xs font-black text-white uppercase tracking-widest">Insights</div>
            </div>
            <div className="text-[11px] text-neutral-400">Relatórios e PRs</div>
          </button>

          <button
            type="button"
            onClick={() => onOpenHistory?.()}
            className="min-h-[56px] p-3 rounded-2xl bg-neutral-950/50 border border-neutral-800 hover:bg-neutral-900/50 transition-colors flex flex-col items-start justify-center gap-1 text-left"
          >
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-purple-400" />
              <div className="text-xs font-black text-white uppercase tracking-widest">Histórico</div>
            </div>
            <div className="text-[11px] text-neutral-400">{historySubtitle}</div>
          </button>

          <button
            type="button"
            onClick={() => setWeeklyOpen((v) => !v)}
            className="min-h-[56px] p-3 rounded-2xl bg-neutral-950/50 border border-neutral-800 hover:bg-neutral-900/50 transition-colors flex flex-col items-start justify-center gap-1 text-left"
          >
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-green-400" />
              <div className="text-xs font-black text-white uppercase tracking-widest">Resumo</div>
            </div>
            <div className="text-[11px] text-neutral-400">Últimos 7 dias</div>
          </button>

          <button
            type="button"
            onClick={openNutrition}
            className="min-h-[56px] p-3 rounded-2xl bg-neutral-950/50 border border-neutral-800 hover:bg-neutral-900/50 transition-colors flex flex-col items-start justify-center gap-1 text-left"
          >
            <div className="flex items-center gap-2">
              <ChefHat size={18} className="text-green-400" />
              <div className="text-xs font-black text-white uppercase tracking-widest">Nutrição</div>
            </div>
            <div className="text-[11px] text-neutral-400">{nutritionSubtitle}</div>
          </button>

          <button
            type="button"
            onClick={() => setWeeklyOpen(true)}
            className="min-h-[56px] p-3 rounded-2xl bg-neutral-950/50 border border-neutral-800 hover:bg-neutral-900/50 transition-colors flex flex-col items-start justify-center gap-1 text-left"
          >
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-neutral-200" />
              <div className="text-xs font-black text-white uppercase tracking-widest">Relatório</div>
            </div>
            <div className="text-[11px] text-neutral-400">Atalhos e dados</div>
          </button>

          <button
            type="button"
            onClick={() => {
              try {
                const el = document.getElementById('vip-periodization')
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              } catch { }
            }}
            className="min-h-[56px] p-3 rounded-2xl bg-neutral-950/50 border border-neutral-800 hover:bg-neutral-900/50 transition-colors flex flex-col items-start justify-center gap-1 text-left"
          >
            <div className="flex items-center gap-2">
              <CalendarDays size={18} className="text-yellow-400" />
              <div className="text-xs font-black text-white uppercase tracking-widest">Periodização</div>
            </div>
            <div className="text-[11px] text-neutral-400">Programa completo</div>
          </button>
        </div>
      </div>

      {weeklyOpen ? <VipWeeklySummaryCard /> : null}

      {insightsOpen ? <VipInsightsPanel onOpenHistory={() => onOpenHistory?.()} onOpenReport={(s) => onOpenReport?.(s as Record<string, unknown>)} /> : null}

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Recursos VIP</div>
            <div className="text-white font-black text-sm">Ferramentas avançadas</div>
          </div>
          <button type="button" onClick={() => (window.location.href = '/marketplace')} className="inline-flex items-center gap-2 text-xs font-black text-neutral-300 hover:text-white">
            Ver detalhes <ArrowRight size={14} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => (window.location.href = '/dashboard/vip/chef-ia')}
            className="rounded-xl border border-neutral-800 bg-black/30 px-3 py-3 text-left hover:bg-neutral-900/40 transition-colors"
          >
            <div className="text-xs font-black text-white">Chef IA</div>
            <div className="text-[11px] text-neutral-400">Planos e receitas</div>
            <div className="mt-2 inline-flex items-center rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-yellow-300">
              Elite
            </div>
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = '/dashboard/vip/offline')}
            className="rounded-xl border border-neutral-800 bg-black/30 px-3 py-3 text-left hover:bg-neutral-900/40 transition-colors"
          >
            <div className="text-xs font-black text-white">Modo offline</div>
            <div className="text-[11px] text-neutral-400">Sync inteligente</div>
            <div className="mt-2 inline-flex items-center rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-yellow-300">
              Pro+
            </div>
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = '/dashboard/vip/analytics')}
            className="rounded-xl border border-neutral-800 bg-black/30 px-3 py-3 text-left hover:bg-neutral-900/40 transition-colors"
          >
            <div className="text-xs font-black text-white">Analytics avançado</div>
            <div className="text-[11px] text-neutral-400">Dash de performance</div>
            <div className="mt-2 inline-flex items-center rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-yellow-300">
              Elite
            </div>
          </button>
        </div>
      </div>

      <div id="vip-periodization">
        <VipPeriodizationPanel locked={isLocked} onStartSession={(w) => onStartSession?.(w as Workout)} onOpenWorkoutEditor={(w) => onOpenWorkoutEditor?.(w as Workout)} />
      </div>

      <div ref={chatRef} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden flex flex-col h-[600px]">
        <div className="p-4 border-b border-neutral-800 bg-neutral-900/60 backdrop-blur flex justify-between items-center">
          <div className="text-sm font-black text-white flex items-center gap-2">
            <Sparkles size={16} className="text-yellow-500" />
            Coach IA
          </div>
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-xs font-bold text-neutral-500 hover:text-white flex items-center gap-1"
          >
            <Trash2 size={12} />
            Limpar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-10 text-neutral-500">
              <p className="text-sm">Olá, {name.split(' ')[0]}.</p>
              <p className="text-xs mt-1">Como posso ajudar no seu treino hoje?</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.isLimit
                  ? 'bg-red-500/10 border border-red-500/30 text-red-200'
                  : m.role === 'assistant'
                    ? 'bg-neutral-800 text-neutral-200'
                    : 'bg-yellow-500/10 border border-yellow-500/20 text-white'
                  }`}
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

        <div className="p-4 border-t border-neutral-800 bg-neutral-900">
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {presets.map((p) => (
              <button key={p} onClick={() => setDraft(p)} className="whitespace-nowrap px-3 py-1.5 rounded-lg bg-neutral-800 text-xs text-neutral-300 hover:bg-neutral-700">
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
              className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-4 text-sm text-white focus:border-yellow-500 focus:outline-none"
            />
            <button onClick={send} disabled={busy} className="bg-yellow-500 text-black font-bold px-4 rounded-xl hover:bg-yellow-400 disabled:opacity-50">
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
