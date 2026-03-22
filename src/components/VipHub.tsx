'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import NextImage from 'next/image'
import { Crown, Sparkles, MessageSquare, Trash2, Zap, BarChart3, ChefHat, Dumbbell, Check, Plus, Loader2 } from 'lucide-react'
import { isIosNative } from '@/utils/platform'
import dynamic from 'next/dynamic'
import { createWorkout } from '@/actions/workout-crud-actions'
import VipWeeklySummaryCard from '@/components/vip/VipWeeklySummaryCard'

const VipPeriodizationPanel = dynamic(() => import('@/components/vip/VipPeriodizationPanel'), { ssr: false })
const WorkoutHeatMap = dynamic(() => import('@/components/vip/WorkoutHeatMap'), { ssr: false })
import VipInsightsPanel from '@/components/vip/VipInsightsPanel'
import { logError } from '@/lib/logger'
import { useVipCredits } from '@/hooks/useVipCredits'
import { useDialog } from '@/contexts/DialogContext'
import { useRouter } from 'next/navigation'
import type { Workout } from '@/types/app'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { apiVip } from '@/lib/api'

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

interface WorkoutData {
  title: string
  exercises: Array<{
    name: string
    sets?: number
    reps?: string
    rest_time?: number
    method?: string
    notes?: string
  }>
}

interface ChatMessage {
  id: string
  role: string
  text: string
  isLimit?: boolean
  dataUsed?: Record<string, unknown>[]
  followUps?: string[]
  actions?: ChatAction[]
  workoutData?: WorkoutData | null
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
  const [savingWorkout, setSavingWorkout] = useState<string | null>(null)
  const [savedWorkouts, setSavedWorkouts] = useState<Set<string>>(new Set())
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [vipStatus, setVipStatus] = useState<VipStatus | null>(null)
  const { credits } = useVipCredits()
  const { confirm } = useDialog()
  const router = useRouter()
  const chatRef = useRef<HTMLDivElement | null>(null)

  const [insightsOpen, setInsightsOpen] = useState(false)

  // Load VIP Status
  useEffect(() => {
    if (hideVipCtas) return
    let cancelled = false
      ; (async () => {
        try {
          const data = await apiVip.getStatus()
          if (cancelled) return
          if (data?.ok) setVipStatus(data as unknown as VipStatus)
        } catch (e) {
          logError('component:VipHub.loadVipStatus', e)
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
        const tData = await apiVip.getChatThread().catch(() => null)
        const thread = tData?.thread as Record<string, unknown> | undefined
        tid = String(thread?.id || '').trim()
        if (tid) setThreadId(tid)
      }
      if (tid) {
        await apiVip.saveChatMessage({ thread_id: tid, role: 'user', content: text }).catch(() => null)
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
      // Extract workout data from API response
      let workoutData: WorkoutData | null = null
      const wk = json.workout as Record<string, unknown> | null | undefined
      if (wk?.title && Array.isArray(wk?.exercises) && (wk.exercises as unknown[]).length > 0) {
        workoutData = wk as unknown as WorkoutData
      }

      const assistant: ChatMessage = {
        id: `${id}-a`,
        role: 'assistant',
        text: String(json.answer || '').trim(),
        dataUsed,
        followUps,
        actions,
        workoutData,
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

    } catch (e) {
      logError('component:VipHub.sendChat', e)
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
          const tData = await apiVip.getChatThread().catch(() => null)
          const thread = tData?.thread as Record<string, unknown> | undefined
          const tid = String(thread?.id || '').trim()
          if (!tid) return
          if (cancelled) return
          setThreadId(tid)
          const mData = await apiVip.getChatMessages(tid, 80).catch(() => null)
          if (cancelled) return
          const rows = Array.isArray(mData?.messages) ? mData.messages : []
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
        } catch (e) {
          logError('component:VipHub.loadChatHistory', e)
        } finally {
          if (!cancelled) {
            setChatLoading(false)
            setChatLoaded(true)
          }
        }
      })()
    return () => { cancelled = true }
  }, [chatLoaded, chatLoading, isLocked])



  if (isLocked) {
    return (
      <div className="rounded-2xl p-[1px]" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.4) 0%, rgba(255,255,255,0.04) 50%, rgba(234,179,8,0.15) 100%)' }}>
        <div className="rounded-[15px] text-center overflow-hidden" style={{ background: 'rgba(15,15,15,0.98)' }}>

          {/* Crown hero — full width, bleeds edge-to-edge */}
          <div className="relative w-full h-52 overflow-hidden">
            <NextImage
              src="/vip-crown.png"
              alt="VIP"
              fill
              priority
              unoptimized
              className="object-cover object-center scale-110"
            />
            {/* Bottom gradient fade into card */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/20 to-transparent" />
            {/* Top vignette */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#0f0f0f]/50 via-transparent to-transparent" />
            {/* VIP badge overlay */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2">
              <div className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.25em]" style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.4)', color: '#f59e0b' }}>
                Exclusivo VIP
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-8 pb-8 space-y-4">
            <div>
              <h2 className="text-2xl font-black text-white">Área VIP Exclusiva</h2>
              <p className="text-neutral-400 mt-2 max-w-md mx-auto text-sm leading-relaxed">
                Desbloqueie o Coach IA, Nutrição Avançada, Histórico Ilimitado e muito mais.
              </p>
            </div>

            {/* Feature preview pills */}
            <div className="flex flex-wrap justify-center gap-2">
              {['🤖 Coach IA', '📊 Analytics', '🍽️ Nutrição', '📅 Periodização'].map((f) => (
                <span key={f} className="px-3 py-1 rounded-full text-[11px] font-bold text-neutral-400" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {f}
                </span>
              ))}
            </div>

            {!hideVipCtas ? (
              <button
                onClick={() => window.location.href = '/marketplace'}
                className="w-full px-8 py-4 rounded-xl font-black text-black text-sm transition-all active:scale-[0.97]"
                style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)', boxShadow: '0 4px 24px rgba(234,179,8,0.4)' }}
              >
                Ver Planos e Assinar →
              </button>
            ) : (
              <div className="text-xs font-bold text-neutral-400">Planos indisponíveis no iOS no momento.</div>
            )}
          </div>
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

  const macrosEnabled = !!vipStatus?.limits?.nutrition_macros
  const nutritionSubtitle = macrosEnabled ? 'Macros liberado' : 'Macros (Pro+)'

  const openNutrition = () => {
    try {
      window.location.href = '/dashboard/nutrition'
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
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {credits?.chat ? chip('Coach IA', credits.chat.used, credits.chat.limit) : null}
            {credits?.wizard ? chip('Wizard', credits.wizard.used, credits.wizard.limit) : null}
            {credits?.insights ? chip('Insights', credits.insights.used, credits.insights.limit) : null}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            {[
              { onClick: () => onOpenWizard?.(), icon: <Zap size={18} className="text-yellow-400" />, label: 'Wizard', sub: 'Gere treino rápido' },
              { onClick: () => setInsightsOpen((v) => !v), icon: <Sparkles size={18} className="text-purple-300" />, label: 'Insights', sub: 'Relatórios e PRs' },
              { onClick: () => onOpenHistory?.(), icon: <BarChart3 size={18} className="text-purple-400" />, label: 'Histórico', sub: 'Todos os treinos' },
              { onClick: openNutrition, icon: <ChefHat size={18} className="text-green-400" />, label: 'Nutrição', sub: nutritionSubtitle },
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

      <VipWeeklySummaryCard />

      {/* GPS: Workout Heat Map (VIP) */}
      <WorkoutHeatMap userId="" />

      {insightsOpen ? <VipInsightsPanel onOpenHistory={() => onOpenHistory?.()} onOpenReport={(s) => onOpenReport?.(s as Record<string, unknown>)} /> : null}



      <div id="vip-periodization">
        <VipPeriodizationPanel locked={isLocked} onStartSession={(w) => onStartSession?.(w as Workout)} onOpenWorkoutEditor={(w) => onOpenWorkoutEditor?.(w as Workout)} />
      </div>

      {/* ── CHAT PAI — Coach IA Premium ─────────────────────────────────── */}
      <div ref={chatRef} className="rounded-2xl overflow-hidden flex flex-col h-[600px] relative" style={{ border: '1px solid rgba(234,179,8,0.25)', background: 'linear-gradient(180deg, rgba(15,15,14,0.99) 0%, rgba(10,10,9,0.99) 100%)', boxShadow: '0 0 60px rgba(234,179,8,0.06), 0 32px 80px rgba(0,0,0,0.6)' }}>
        {/* Shimmer top line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] z-10" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(234,179,8,0.6) 40%, rgba(251,191,36,1) 50%, rgba(234,179,8,0.6) 60%, transparent 100%)' }} />

        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between relative z-10" style={{ borderBottom: '1px solid rgba(234,179,8,0.12)', background: 'linear-gradient(135deg, rgba(234,179,8,0.06) 0%, rgba(10,10,10,0.95) 60%)' }}>
          <div className="flex items-center gap-3">
            {/* Coach avatar with glow */}
            <div className="relative">
              <div className="absolute inset-0 rounded-xl blur-md" style={{ background: 'rgba(234,179,8,0.4)', opacity: 0.6 }} />
              <div className="relative w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 16px rgba(234,179,8,0.3)' }}>
                <Sparkles size={18} className="text-black" />
              </div>
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.22em] text-yellow-500">Chat Pai</div>
              <div className="text-white font-black text-sm">Iron Coach IA</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {credits?.chat && (
              <div className={`text-[10px] px-2 py-1 rounded-lg font-mono font-black ${credits.chat.limit !== null && credits.chat.used >= credits.chat.limit ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-neutral-900 text-neutral-400 border border-neutral-800'}`}>
                {credits.chat.used}/{credits.chat.limit == null ? '∞' : credits.chat.limit > 1000 ? '∞' : credits.chat.limit}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMessages([])}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-500 hover:text-red-400 transition-all active:scale-95"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              aria-label="Limpar conversa"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Mode selector — segmented control */}
        <div className="px-4 py-2.5 flex items-center gap-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.3)' }}>
          {([
            { key: 'coach', label: '🎯 Coach', desc: 'Treino e dúvidas' },
            { key: 'planner', label: '📋 Planner', desc: 'Monte treinos' },
            { key: 'diagnostic', label: '🔬 Diagnóstico', desc: 'Análise profunda' },
          ] as const).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className="flex-1 min-h-[36px] px-2 py-1.5 rounded-lg text-center transition-all active:scale-[0.97]"
              style={mode === m.key
                ? { background: 'linear-gradient(135deg, rgba(234,179,8,0.15), rgba(234,179,8,0.06))', border: '1px solid rgba(234,179,8,0.3)', boxShadow: '0 2px 8px rgba(234,179,8,0.1)' }
                : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }
              }
            >
              <div className={`text-[11px] font-black ${mode === m.key ? 'text-yellow-400' : 'text-neutral-500'}`}>{m.label}</div>
            </button>
          ))}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 rounded-2xl blur-lg" style={{ background: 'rgba(234,179,8,0.2)' }} />
                <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.12), rgba(234,179,8,0.04))', border: '1px solid rgba(234,179,8,0.25)' }}>
                  <Sparkles size={24} className="text-yellow-500" />
                </div>
              </div>
              <p className="text-sm font-bold text-neutral-300">Olá{name ? `, ${name.split(' ')[0]}` : ''}! 👋</p>
              <p className="text-xs mt-1.5 text-neutral-600 max-w-xs mx-auto">
                Sou seu Iron Coach com acesso completo aos seus treinos, avaliação física e progressão. Como posso ajudar?
              </p>
              {/* Data sources indicator */}
              <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.15)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-yellow-600">Dados conectados</span>
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.isLimit
                  ? 'bg-red-500/10 border border-red-500/30 text-red-200'
                  : m.role === 'assistant'
                    ? 'text-neutral-200'
                    : 'text-white font-medium'
                  }`}
                style={m.isLimit ? {} : m.role === 'assistant'
                  ? { background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.12)', borderRadius: '4px 16px 16px 16px' }
                  : { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px 4px 16px 16px' }
                }
              >
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                {/* Data sources badge on assistant messages */}
                {m.role === 'assistant' && Array.isArray(m.dataUsed) && m.dataUsed.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 pt-2" style={{ borderTop: '1px solid rgba(234,179,8,0.08)' }}>
                    <div className="w-1 h-1 rounded-full bg-yellow-500" />
                    <span className="text-[9px] font-bold text-yellow-700">Analisou: {(m.dataUsed as unknown[]).map((d) => typeof d === 'object' && d !== null ? String((d as Record<string, unknown>).label || '') : String(d)).join(', ')}</span>
                  </div>
                )}
                {/* Save Workout to Dashboard button */}
                {m.workoutData && m.role === 'assistant' && (() => {
                  const isSaving = savingWorkout === m.id
                  const isSaved = savedWorkouts.has(m.id)
                  return (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(234,179,8,0.15)' }}>
                      <div className="flex items-center gap-2 text-[11px] font-bold text-yellow-500/70 uppercase tracking-wider mb-2">
                        <Dumbbell size={12} />
                        {m.workoutData!.title} — {m.workoutData!.exercises.length} exercício{m.workoutData!.exercises.length !== 1 ? 's' : ''}
                      </div>
                      <button
                        type="button"
                        disabled={isSaving || isSaved}
                        onClick={async () => {
                          if (!m.workoutData || isSaving || isSaved) return
                          setSavingWorkout(m.id)
                          try {
                            const res = await createWorkout({
                              title: m.workoutData!.title,
                              exercises: m.workoutData!.exercises.map((ex, i) => ({
                                name: ex.name,
                                sets: ex.sets || 3,
                                reps: ex.reps || '8-12',
                                rest_time: ex.rest_time || 60,
                                method: ex.method || 'Normal',
                                notes: ex.notes || '',
                                order: i,
                              })),
                            })
                            if (res?.ok) {
                              setSavedWorkouts(prev => new Set([...prev, m.id]))
                              // Notify dashboard to refresh workout list
                              window.dispatchEvent(new CustomEvent('irontracks:workouts-changed'))
                            }
                          } catch { /* silent */ } finally {
                            setSavingWorkout(null)
                          }
                        }}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm uppercase tracking-wider transition-all active:scale-[0.97] ${
                          isSaved
                            ? 'bg-green-500/20 border border-green-500/30 text-green-400 cursor-default'
                            : 'bg-yellow-500 text-black hover:bg-yellow-400'
                        }`}
                      >
                        {isSaving ? (
                          <><Loader2 size={14} className="animate-spin" /> Salvando...</>
                        ) : isSaved ? (
                          <><Check size={14} /> Treino adicionado!</>
                        ) : (
                          <><Plus size={14} /> Adicionar à Dashboard</>
                        )}
                      </button>
                    </div>
                  )
                })()}
                {m.isLimit && !hideVipCtas && (
                  <button onClick={() => window.location.href = '/marketplace'} className="block mt-2 text-xs font-black uppercase text-yellow-500 hover:underline">
                    Fazer Upgrade
                  </button>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 flex items-center gap-2" style={{ background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.12)', borderRadius: '4px 16px 16px 16px' }}>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-[10px] text-yellow-600 font-bold">Analisando seus dados...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="p-4 relative z-10" style={{ borderTop: '1px solid rgba(234,179,8,0.1)', background: 'linear-gradient(180deg, rgba(15,15,14,0.98) 0%, rgba(10,10,9,0.99) 100%)' }}>
          {/* Presets */}
          <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 no-scrollbar">
            {presets.map((p) => (
              <button key={p} onClick={() => setDraft(p)} className="whitespace-nowrap px-3 py-1.5 rounded-lg text-[11px] font-bold text-neutral-500 hover:text-yellow-400 transition-all active:scale-[0.97]" style={{ background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.1)' }}>
                {p}
              </button>
            ))}
          </div>
          {/* Input + Send */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Pergunte ao Iron Coach..."
              className="flex-1 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none transition-all input-premium-focus"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(234,179,8,0.12)' }}
            />
            <button
              onClick={send}
              disabled={busy || !draft.trim()}
              className="w-12 h-12 rounded-xl flex items-center justify-center text-black font-black disabled:opacity-40 transition-all active:scale-[0.95]"
              style={{ background: busy || !draft.trim() ? 'rgba(234,179,8,0.2)' : 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: busy || !draft.trim() ? 'none' : '0 4px 16px rgba(234,179,8,0.35)' }}
              aria-label="Enviar mensagem"
            >
              <MessageSquare size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
