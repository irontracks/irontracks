'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Crown, Sparkles, ArrowRight, Lock, MessageSquare, CalendarDays, TrendingUp, Trash2 } from 'lucide-react'
import { generateWorkoutFromWizard } from '@/utils/workoutAutoGenerator'
import { createWorkout } from '@/actions/workout-actions'
import { vipPlaybooks } from '@/content/vipPlaybooks'

export default function VipHub({ user, locked, onOpenWorkoutEditor, onOpenVipTab }) {
  const isLocked = !!locked
  const name = useMemo(() => String(user?.displayName || user?.name || '').trim(), [user?.displayName, user?.name])
  const [mode, setMode] = useState('coach')
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [weekly, setWeekly] = useState(null)
  const [weeklyLoading, setWeeklyLoading] = useState(false)
  const [profile, setProfile] = useState(null)
  const [profileDraft, setProfileDraft] = useState({ goal: 'hypertrophy', equipment: 'gym', constraints: '', preferences: { level: 'intermediate', split: 'full_body', focus: 'balanced', daysPerWeek: 4, timeMinutes: 60 } })
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSavedAt, setProfileSavedAt] = useState(0)
  const [profileAuto, setProfileAuto] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [threadId, setThreadId] = useState('')
  const [chatLoaded, setChatLoaded] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const inputRef = useRef(null)
  const profileInitAttemptedRef = useRef(false)

  const presets = useMemo(() => {
    if (mode === 'planner') {
      return [
        'Crie um bloco de 4 semanas para hipertrofia (4x/semana).',
        'Monte uma periodização de 6 semanas para subir supino, mantendo agacho.',
        'Tenho 35 minutos. Monte um treino eficiente hoje sem atrapalhar o bloco.',
      ]
    }
    if (mode === 'diagnostic') {
      return [
        'Por que meu progresso travou nas últimas 4 semanas? Dê 3 hipóteses e ações.',
        'Estou com fadiga alta. Ajuste meu volume semanal sem perder performance.',
        'Me diga meus pontos fracos (músculos e padrões) com base nos treinos recentes.',
      ]
    }
    return [
      'Sugira meu treino de hoje com base no que fiz por último.',
      'Quais ajustes devo fazer no treino de hoje para evoluir com menos fadiga?',
      'Crie um aquecimento completo para supino e puxada.',
    ]
  }, [mode])

  const send = async () => {
    const text = String(draft || '').trim()
    if (!text || busy) return
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id, role: 'user', text }].slice(-60))
    setDraft('')
    try {
      if (inputRef.current) inputRef.current.focus()
    } catch {}

    setBusy(true)
    try {
      let tid = String(threadId || '').trim()
      if (!tid) {
        const tRes = await fetch('/api/vip/chat/thread', { method: 'GET', credentials: 'include', cache: 'no-store' })
        const tJson = await tRes.json().catch(() => null)
        tid = String(tJson?.thread?.id || '').trim()
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
      const json = await res.json().catch(() => null)
      if (!json || !json.ok) {
        const err = String(json?.error || 'Falha ao consultar a IA.').trim()
        const msg = { id: `${id}-a`, role: 'assistant', text: err, actions: [] }
        setMessages((prev) => [...(Array.isArray(prev) ? prev : []), msg].slice(-60))
        if (tid) {
          await fetch('/api/vip/chat/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ thread_id: tid, role: 'assistant', content: JSON.stringify({ text: err, dataUsed: [], followUps: [], actions: [] }) }),
          }).catch(() => null)
        }
        return
      }
      const assistant = {
        id: `${id}-a`,
        role: 'assistant',
        text: String(json?.answer || '').trim(),
        dataUsed: Array.isArray(json?.dataUsed) ? json.dataUsed : [],
        followUps: Array.isArray(json?.followUps) ? json.followUps : [],
        actions: Array.isArray(json?.actions) ? json.actions : [],
      }
      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), assistant].slice(-60))
      if (tid) {
        await fetch('/api/vip/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ thread_id: tid, role: 'assistant', content: JSON.stringify(assistant) }),
        }).catch(() => null)
      }
    } catch {
      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id: `${id}-a`, role: 'assistant', text: 'Falha ao consultar a IA.' }].slice(-60))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (isLocked) return
    if (profileLoaded) return
    let cancelled = false
    setProfileLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/vip/profile', { method: 'GET', credentials: 'include', cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (!json || !json.ok) {
          setProfile(null)
          return
        }
        const p = json?.profile && typeof json.profile === 'object' ? json.profile : null
        if (!p && !profileInitAttemptedRef.current) {
          profileInitAttemptedRef.current = true
          const payload = {
            goal: 'hypertrophy',
            equipment: 'gym',
            constraints: '',
            preferences: { level: 'intermediate', split: 'full_body', focus: 'balanced', daysPerWeek: 4, timeMinutes: 60 },
          }
          try {
            const putRes = await fetch('/api/vip/profile', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload),
            })
            const putJson = await putRes.json().catch(() => null)
            if (!cancelled && putJson && putJson.ok) {
              const created = putJson?.profile && typeof putJson.profile === 'object' ? putJson.profile : null
              setProfile(created)
              setProfileAuto(true)
              const cprefs = created?.preferences && typeof created.preferences === 'object' && !Array.isArray(created.preferences) ? created.preferences : payload.preferences
              setProfileDraft({
                goal: String(created?.goal || payload.goal) || payload.goal,
                equipment: String(created?.equipment || payload.equipment) || payload.equipment,
                constraints: String(created?.constraints || payload.constraints),
                preferences: {
                  level: String(cprefs?.level || payload.preferences.level) || payload.preferences.level,
                  split: String(cprefs?.split || payload.preferences.split) || payload.preferences.split,
                  focus: String(cprefs?.focus || payload.preferences.focus) || payload.preferences.focus,
                  daysPerWeek: Number(cprefs?.daysPerWeek || payload.preferences.daysPerWeek) || payload.preferences.daysPerWeek,
                  timeMinutes: Number(cprefs?.timeMinutes || payload.preferences.timeMinutes) || payload.preferences.timeMinutes,
                },
              })
              return
            }
          } catch {}
        }

        setProfile(p)
        const prefs = p?.preferences && typeof p.preferences === 'object' && !Array.isArray(p.preferences) ? p.preferences : {}
        setProfileDraft({
          goal: String(p?.goal || 'hypertrophy') || 'hypertrophy',
          equipment: String(p?.equipment || 'gym') || 'gym',
          constraints: String(p?.constraints || ''),
          preferences: {
            level: String(prefs?.level || 'intermediate') || 'intermediate',
            split: String(prefs?.split || 'full_body') || 'full_body',
            focus: String(prefs?.focus || 'balanced') || 'balanced',
            daysPerWeek: Number(prefs?.daysPerWeek || 4) || 4,
            timeMinutes: Number(prefs?.timeMinutes || 60) || 60,
          },
        })
      } catch {
        if (!cancelled) setProfile(null)
      } finally {
        if (!cancelled) {
          setProfileLoading(false)
          setProfileLoaded(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isLocked, profileLoaded])

  useEffect(() => {
    if (isLocked) return
    if (chatLoaded) return
    if (chatLoading) return
    let cancelled = false
    setChatLoading(true)
    ;(async () => {
      try {
        const tRes = await fetch('/api/vip/chat/thread', { method: 'GET', credentials: 'include', cache: 'no-store' })
        const tJson = await tRes.json().catch(() => null)
        const tid = String(tJson?.thread?.id || '').trim()
        if (!tid) return
        if (cancelled) return
        setThreadId(tid)
        const mRes = await fetch(`/api/vip/chat/messages?thread_id=${encodeURIComponent(tid)}&limit=80`, { method: 'GET', credentials: 'include', cache: 'no-store' })
        const mJson = await mRes.json().catch(() => null)
        if (cancelled) return
        const rows = Array.isArray(mJson?.messages) ? mJson.messages : []
        const parsed = rows
          .map((r) => {
            const role = String(r?.role || '').trim()
            const raw = String(r?.content || '')
            if (role === 'assistant') {
              const payload = (() => {
                try {
                  if (raw.trim().startsWith('{')) return JSON.parse(raw)
                } catch {}
                return null
              })()
              if (payload && typeof payload === 'object') {
                return {
                  id: String(r?.id || `${Date.now()}-a`),
                  role: 'assistant',
                  text: String(payload?.text || payload?.answer || '').trim() || raw,
                  dataUsed: Array.isArray(payload?.dataUsed) ? payload.dataUsed : [],
                  followUps: Array.isArray(payload?.followUps) ? payload.followUps : [],
                  actions: Array.isArray(payload?.actions) ? payload.actions : [],
                }
              }
            }
            return { id: String(r?.id || `${Date.now()}-m`), role: role || 'user', text: raw }
          })
          .filter(Boolean)
        setMessages(parsed.slice(-60))
      } catch {
      } finally {
        if (!cancelled) {
          setChatLoading(false)
          setChatLoaded(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [chatLoaded, chatLoading, isLocked])

  const defaultAnswers = useMemo(() => {
    const d = profileDraft && typeof profileDraft === 'object' ? profileDraft : null
    const prefs = d?.preferences && typeof d.preferences === 'object' ? d.preferences : {}
    const daysPerWeek = Math.max(1, Math.min(7, Number(prefs?.daysPerWeek || 4) || 4))
    const timeMinutes = Math.max(20, Math.min(120, Number(prefs?.timeMinutes || 60) || 60))
    const goal = String(d?.goal || 'hypertrophy') || 'hypertrophy'
    const equipment = String(d?.equipment || 'gym') || 'gym'
    const level = String(prefs?.level || 'intermediate') || 'intermediate'
    const split = String(prefs?.split || 'full_body') || 'full_body'
    const focus = String(prefs?.focus || 'balanced') || 'balanced'
    const constraints = String(d?.constraints || '')
    return { goal, split, focus, equipment, level, daysPerWeek, timeMinutes, constraints }
  }, [profileDraft])

  const saveProfile = async () => {
    if (profileSaving) return
    setProfileSaving(true)
    try {
      const payload = {
        goal: String(profileDraft?.goal || '').trim(),
        equipment: String(profileDraft?.equipment || '').trim(),
        constraints: String(profileDraft?.constraints || ''),
        preferences: profileDraft?.preferences && typeof profileDraft.preferences === 'object' ? profileDraft.preferences : {},
      }
      const res = await fetch('/api/vip/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (json && json.ok) {
        setProfile(json.profile || null)
        setProfileSavedAt(Date.now())
        setProfileAuto(false)
        setProfileOpen(false)
        setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id: `${Date.now()}-p`, role: 'assistant', text: 'Perfil VIP atualizado. Vou usar isso nas próximas respostas.' }].slice(-60))
      } else {
        const err = String(json?.error || 'Falha ao salvar perfil.').trim()
        setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id: `${Date.now()}-p-err`, role: 'assistant', text: err }].slice(-60))
      }
    } catch {
      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id: `${Date.now()}-p-err`, role: 'assistant', text: 'Falha ao salvar perfil.' }].slice(-60))
    } finally {
      setProfileSaving(false)
    }
  }

  const createTemplate = async (workoutDraft, label) => {
    const key = String(label || '').trim() || 'action'
    if (actionBusy) return
    setActionBusy(key)
    try {
      const created = await createWorkout(workoutDraft)
      if (!created?.ok || !created?.id) {
        const msg = String(created?.error || 'Falha ao criar treino').trim()
        setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id: `${Date.now()}-err`, role: 'assistant', text: msg }].slice(-60))
        return
      }
      try {
        onOpenVipTab?.()
      } catch {}
      try {
        onOpenWorkoutEditor?.({ id: String(created.id) })
      } catch {}
      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id: `${Date.now()}-ok`, role: 'assistant', text: 'Treino criado e aberto no editor.' }].slice(-60))
    } catch {
      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id: `${Date.now()}-err`, role: 'assistant', text: 'Falha ao criar treino.' }].slice(-60))
    } finally {
      setActionBusy('')
    }
  }

  const handleAction = async (a) => {
    const type = String(a?.type || '').trim()
    if (!type) return
    if (type === 'generate_today_workout') {
      const seed = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
      const w = generateWorkoutFromWizard(defaultAnswers, seed)
      return await createTemplate(w, 'generate_today_workout')
    }
    if (type === 'generate_4w_block') {
      if (actionBusy) return
      setActionBusy('generate_4w_block')
      try {
        const seeds = [1, 2, 3, 4].map((n) => Math.floor(Date.now() / (24 * 60 * 60 * 1000)) + n)
        const blockAnswers = { ...defaultAnswers, split: 'upper_lower' }
        const drafts = [
          generateWorkoutFromWizard({ ...blockAnswers, focus: 'upper' }, seeds[0]),
          generateWorkoutFromWizard({ ...blockAnswers, focus: 'lower' }, seeds[1]),
          generateWorkoutFromWizard({ ...blockAnswers, focus: 'upper' }, seeds[2]),
          generateWorkoutFromWizard({ ...blockAnswers, focus: 'lower' }, seeds[3]),
        ]
        const createdIds = []
        for (const d of drafts) {
          const created = await createWorkout(d)
          if (created?.ok && created?.id) createdIds.push(String(created.id))
        }
        if (!createdIds.length) {
          setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id: `${Date.now()}-err`, role: 'assistant', text: 'Não consegui criar o bloco.' }].slice(-60))
          return
        }
        try {
          onOpenVipTab?.()
        } catch {}
        try {
          onOpenWorkoutEditor?.({ id: createdIds[0] })
        } catch {}
        setMessages((prev) => [
          ...(Array.isArray(prev) ? prev : []),
          { id: `${Date.now()}-ok`, role: 'assistant', text: `Bloco criado (${createdIds.length} treinos) e primeiro aberto no editor.` },
        ].slice(-60))
      } catch {
        setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id: `${Date.now()}-err`, role: 'assistant', text: 'Falha ao criar bloco.' }].slice(-60))
      } finally {
        setActionBusy('')
      }
      return
    }
    if (type === 'weekly_summary') {
      await loadWeeklySummary(true)
      return
    }
  }

  const loadWeeklySummary = async (asMessage) => {
    if (weeklyLoading) return
    setWeeklyLoading(true)
    try {
      const res = await fetch('/api/vip/weekly-summary', { method: 'GET', credentials: 'include', cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (!json || !json.ok) {
        const msg = String(json?.error || 'Falha ao carregar resumo semanal.').trim()
        if (asMessage) {
          setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id: `${Date.now()}-err`, role: 'assistant', text: msg }].slice(-60))
        }
        return
      }
      setWeekly(json)
      if (asMessage) {
        const t = String(json?.summaryText || '').trim() || 'Resumo semanal pronto.'
        setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id: `${Date.now()}-sum`, role: 'assistant', text: t, dataUsed: Array.isArray(json?.dataUsed) ? json.dataUsed : [] }].slice(-60))
      }
    } catch {
      if (asMessage) {
        setMessages((prev) => [...(Array.isArray(prev) ? prev : []), { id: `${Date.now()}-err`, role: 'assistant', text: 'Falha ao carregar resumo semanal.' }].slice(-60))
      }
    } finally {
      setWeeklyLoading(false)
    }
  }

  const modeBadge = useMemo(() => {
    return (m) => {
      const id = String(m || '').trim()
      if (id === 'planner') return { label: 'PLANO', cls: 'bg-sky-500/10 border border-sky-500/30 text-sky-300' }
      if (id === 'diagnostic') return { label: 'DIAGNÓSTICO', cls: 'bg-purple-500/10 border border-purple-500/30 text-purple-300' }
      return { label: 'COACH', cls: 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-300' }
    }
  }, [])

  const quickConstraintTags = useMemo(() => {
    return ['evitar overhead', 'priorizar máquinas', 'sem barra', 'joelho sensível', 'ombro sensível', '35 min']
  }, [])

  const constraintChips = useMemo(() => {
    const raw = String(profileDraft?.constraints || '').trim()
    if (!raw) return []
    const parts = raw
      .split(/[,\n;•]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10)
    return Array.from(new Set(parts))
  }, [profileDraft?.constraints])

  const weeklyRecommendation = useMemo(() => {
    const w = weekly && typeof weekly === 'object' ? weekly : null
    if (!w) return null
    const trainedDays = Number(w?.trainedDays || 0) || 0
    const soreness = w?.checkins?.soreness != null ? Number(w.checkins.soreness) : null
    const sleep = w?.checkins?.sleep != null ? Number(w.checkins.sleep) : null
    const energy = w?.checkins?.energy != null ? Number(w.checkins.energy) : null
    if (soreness != null && soreness >= 7) return 'Fadiga alta: hoje vale reduzir volume (−20% a −40%) e evitar falha.'
    if (sleep != null && sleep > 0 && sleep < 6) return 'Sono baixo: priorize técnica e RPE menor (6–7) no treino de hoje.'
    if (trainedDays >= 5 && (energy != null && energy <= 5)) return 'Semana puxada: considere um treino leve ou descanso ativo.'
    return 'Boa semana: mantenha progressão simples (1–2 reps ou +2,5kg quando possível).'
  }, [weekly])

  if (isLocked) {
    return (
      <div className="rounded-2xl border border-yellow-500/20 bg-neutral-900/60 overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-yellow-500">
                <Crown size={16} />
                VIP
              </div>
              <div className="mt-2 text-2xl font-black text-white leading-tight">
                Coach IA com seus dados
              </div>
              <div className="mt-2 text-sm text-neutral-300">
                Conversa avançada usando histórico, avaliações, PRs e consistência para montar treinos e estratégias personalizadas.
              </div>
            </div>
            <div className="shrink-0 w-12 h-12 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <Lock size={18} className="text-yellow-500" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="flex items-center gap-2 text-yellow-500">
                <MessageSquare size={16} />
                <div className="text-xs font-black uppercase tracking-widest">Chat VIP</div>
              </div>
              <div className="mt-2 text-sm text-neutral-300">
                Pergunte sobre qualquer treino e receba respostas com contexto e links internos.
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="flex items-center gap-2 text-yellow-500">
                <CalendarDays size={16} />
                <div className="text-xs font-black uppercase tracking-widest">Blocos</div>
              </div>
              <div className="mt-2 text-sm text-neutral-300">
                Planejamento 4–8 semanas, ajustado conforme o que você realmente executa.
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="flex items-center gap-2 text-yellow-500">
                <TrendingUp size={16} />
                <div className="text-xs font-black uppercase tracking-widest">PRs</div>
              </div>
              <div className="mt-2 text-sm text-neutral-300">
                Metas por data, estratégia de progressão e diagnóstico de platôs.
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => {
                try {
                  if (typeof window !== 'undefined') window.location.href = '/marketplace'
                } catch {}
              }}
              className="min-h-[44px] flex-1 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 transition-colors inline-flex items-center justify-center gap-2"
            >
              Ver planos VIP
              <ArrowRight size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  if (typeof window !== 'undefined') window.location.href = '/marketplace'
                } catch {}
              }}
              className="min-h-[44px] rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-900 transition-colors px-4"
            >
              Saber mais
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
      <div className="p-5 border-b border-neutral-800 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-yellow-500">
            <Crown size={16} />
            VIP
          </div>
          <div className="mt-2 text-xl font-black text-white">
            {name ? `Coach IA • ${name}` : 'Coach IA'}
          </div>
          <div className="text-xs text-neutral-400">Seu coach com memória, dados e ações aplicáveis.</div>
        </div>
        <div className="shrink-0 w-12 h-12 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
          <Sparkles size={18} className="text-yellow-500" />
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[420px,1fr] gap-4">
          <div className="space-y-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Playbooks VIP</div>
                  <div className="mt-1 text-sm text-neutral-300">Protocolos prontos para executar agora.</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Array.isArray(vipPlaybooks) ? vipPlaybooks : []).slice(0, 6).map((p) => {
                  const b = modeBadge(p?.mode)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setMode(String(p.mode))
                        setDraft(String(p.prompt || ''))
                        try {
                          if (inputRef.current) inputRef.current.focus()
                        } catch {}
                      }}
                      className="text-left rounded-2xl border border-neutral-800 bg-neutral-950/40 hover:bg-neutral-900/60 transition-colors p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-white font-black truncate">{String(p.title || '')}</div>
                          <div className="mt-1 text-xs text-neutral-400 line-clamp-2">{String(p.description || '')}</div>
                        </div>
                        <div className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${b.cls}`}>
                          {b.label}
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] font-black uppercase tracking-widest text-neutral-300">Usar agora</div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Memória VIP</div>
                  <div className="mt-1 text-sm text-neutral-300">Preferências e restrições que sempre entram no prompt.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setProfileOpen((v) => !v)}
                  className="h-10 px-3 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-900"
                >
                  {profileOpen ? 'Fechar' : 'Editar'}
                </button>
              </div>

              {!profileOpen ? (
                <div className="mt-3 space-y-2">
                  <div className="text-sm text-neutral-300">
                    {profileLoading ? 'Carregando…' : String(!profile?.updated_at ? 'Ainda não configurado' : profileAuto ? 'Padrão aplicado' : 'Configurado')}
                    {profileSavedAt ? <span className="text-neutral-500"> • Salvo agora</span> : null}
                  </div>
                  {constraintChips.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {constraintChips.slice(0, 8).map((c) => (
                        <span key={c} className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-300">
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Objetivo</div>
                    <select
                      value={String(profileDraft?.goal || 'hypertrophy')}
                      onChange={(e) => setProfileDraft((prev) => ({ ...(prev || {}), goal: e.target.value }))}
                      className="mt-2 w-full min-h-[44px] rounded-xl bg-neutral-950 border border-neutral-800 text-white px-3 font-bold focus:outline-none focus:border-yellow-500"
                    >
                      <option value="hypertrophy">Hipertrofia</option>
                      <option value="strength">Força</option>
                      <option value="conditioning">Condicionamento</option>
                      <option value="maintenance">Manutenção</option>
                    </select>
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Equipamento</div>
                    <select
                      value={String(profileDraft?.equipment || 'gym')}
                      onChange={(e) => setProfileDraft((prev) => ({ ...(prev || {}), equipment: e.target.value }))}
                      className="mt-2 w-full min-h-[44px] rounded-xl bg-neutral-950 border border-neutral-800 text-white px-3 font-bold focus:outline-none focus:border-yellow-500"
                    >
                      <option value="gym">Academia</option>
                      <option value="home">Casa</option>
                      <option value="minimal">Minimalista</option>
                    </select>
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3 md:col-span-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Restrições e preferências</div>
                    <textarea
                      value={String(profileDraft?.constraints || '')}
                      onChange={(e) => setProfileDraft((prev) => ({ ...(prev || {}), constraints: e.target.value }))}
                      rows={3}
                      className="mt-2 w-full rounded-xl bg-neutral-950 border border-neutral-800 text-white px-3 py-2 font-bold focus:outline-none focus:border-yellow-500"
                      placeholder="Ex.: ombro sensível, evitar overhead, priorizar máquinas, sem barra..."
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quickConstraintTags.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            const cur = String(profileDraft?.constraints || '')
                            const normCur = cur.toLowerCase()
                            if (normCur.includes(t.toLowerCase())) return
                            const next = cur.trim() ? `${cur.trim()}, ${t}` : t
                            setProfileDraft((prev) => ({ ...(prev || {}), constraints: next }))
                          }}
                          className="h-9 px-3 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-900 text-xs"
                        >
                          + {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Nível</div>
                    <select
                      value={String(profileDraft?.preferences?.level || 'intermediate')}
                      onChange={(e) => setProfileDraft((prev) => ({ ...(prev || {}), preferences: { ...(prev?.preferences || {}), level: e.target.value } }))}
                      className="mt-2 w-full min-h-[44px] rounded-xl bg-neutral-950 border border-neutral-800 text-white px-3 font-bold focus:outline-none focus:border-yellow-500"
                    >
                      <option value="beginner">Iniciante</option>
                      <option value="intermediate">Intermediário</option>
                      <option value="advanced">Avançado</option>
                    </select>
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Split</div>
                    <select
                      value={String(profileDraft?.preferences?.split || 'full_body')}
                      onChange={(e) => {
                        const split = e.target.value
                        const nextFocus = split === 'upper_lower' ? 'upper' : split === 'ppl' ? 'push' : 'balanced'
                        setProfileDraft((prev) => ({ ...(prev || {}), preferences: { ...(prev?.preferences || {}), split, focus: nextFocus } }))
                      }}
                      className="mt-2 w-full min-h-[44px] rounded-xl bg-neutral-950 border border-neutral-800 text-white px-3 font-bold focus:outline-none focus:border-yellow-500"
                    >
                      <option value="full_body">Full Body</option>
                      <option value="upper_lower">Upper/Lower</option>
                      <option value="ppl">PPL</option>
                    </select>
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Dias/semana</div>
                    <input
                      value={String(profileDraft?.preferences?.daysPerWeek ?? 4)}
                      onChange={(e) => setProfileDraft((prev) => ({ ...(prev || {}), preferences: { ...(prev?.preferences || {}), daysPerWeek: e.target.value } }))}
                      className="mt-2 w-full min-h-[44px] rounded-xl bg-neutral-950 border border-neutral-800 text-white px-3 font-bold focus:outline-none focus:border-yellow-500"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Tempo (min)</div>
                    <input
                      value={String(profileDraft?.preferences?.timeMinutes ?? 60)}
                      onChange={(e) => setProfileDraft((prev) => ({ ...(prev || {}), preferences: { ...(prev?.preferences || {}), timeMinutes: e.target.value } }))}
                      className="mt-2 w-full min-h-[44px] rounded-xl bg-neutral-950 border border-neutral-800 text-white px-3 font-bold focus:outline-none focus:border-yellow-500"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="md:col-span-2 flex gap-2">
                    <button
                      type="button"
                      onClick={saveProfile}
                      disabled={profileSaving}
                      className="min-h-[44px] flex-1 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 disabled:opacity-60"
                    >
                      {profileSaving ? 'Salvando…' : 'Salvar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setProfileOpen(false)}
                      className="min-h-[44px] rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-900 px-4"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Resumo semanal</div>
                  <div className="mt-1 text-sm text-neutral-300">KPIs e recomendações dos últimos 7 dias.</div>
                </div>
                <button
                  type="button"
                  onClick={() => loadWeeklySummary(false)}
                  disabled={weeklyLoading}
                  className="h-10 px-3 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-900 disabled:opacity-60"
                >
                  {weeklyLoading ? 'Atualizando…' : 'Atualizar'}
                </button>
              </div>
              {weekly ? (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
                      <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Frequência</div>
                      <div className="mt-1 text-white font-black text-lg">{Number(weekly?.trainedDays || 0)}</div>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
                      <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Energia</div>
                      <div className={`mt-1 font-black text-lg ${Number(weekly?.checkins?.energy || 0) >= 7 ? 'text-emerald-300' : Number(weekly?.checkins?.energy || 0) >= 5 ? 'text-yellow-300' : 'text-red-300'}`}>
                        {weekly?.checkins?.energy ?? '—'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
                      <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Sono</div>
                      <div className={`mt-1 font-black text-lg ${Number(weekly?.checkins?.sleep || 0) >= 7 ? 'text-emerald-300' : Number(weekly?.checkins?.sleep || 0) >= 6 ? 'text-yellow-300' : 'text-red-300'}`}>
                        {weekly?.checkins?.sleep ?? '—'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
                      <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Fadiga</div>
                      <div className={`mt-1 font-black text-lg ${Number(weekly?.checkins?.soreness || 0) >= 7 ? 'text-red-300' : Number(weekly?.checkins?.soreness || 0) >= 5 ? 'text-yellow-300' : 'text-emerald-300'}`}>
                        {weekly?.checkins?.soreness ?? '—'}
                      </div>
                    </div>
                  </div>
                  {weeklyRecommendation ? (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3 text-sm text-neutral-200">
                      <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Próxima ação</div>
                      <div className="mt-1 font-bold">{weeklyRecommendation}</div>
                    </div>
                  ) : null}
                  {weekly && Array.isArray(weekly?.prs) && weekly.prs.length ? (
                    <div className="text-xs text-neutral-300">
                      <span className="text-neutral-500 font-black uppercase tracking-widest">PRs:</span>{' '}
                      {weekly.prs
                        .slice(0, 3)
                        .map((p) => `${String(p?.exercise || '').trim()} (${p?.weight || 0}kg x ${p?.reps || 0})`)
                        .filter(Boolean)
                        .join(' • ')}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 text-sm text-neutral-400">Clique em Atualizar para montar seu resumo.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 overflow-hidden flex flex-col min-h-[520px]">
            <div className="p-4 border-b border-neutral-800 bg-neutral-900/60 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Chat VIP</div>
                  <div className="mt-1 text-sm text-neutral-300">Pergunte e aplique ações com 1 clique.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  className="h-10 px-3 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-900 inline-flex items-center gap-2"
                >
                  <Trash2 size={16} />
                  Limpar
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { id: 'coach', label: 'Coach', hint: 'Treinos e estratégia' },
                  { id: 'planner', label: 'Plano', hint: 'Blocos e periodização' },
                  { id: 'diagnostic', label: 'Diagnóstico', hint: 'Platô e ajustes' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMode(t.id)}
                    className={`min-h-[40px] px-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95 ${
                      mode === t.id ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'bg-neutral-950 border border-neutral-800 text-neutral-300 hover:bg-neutral-900'
                    }`}
                    title={t.hint}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
              {Array.isArray(messages) && messages.length ? (
                <div className="space-y-3">
                  {messages.map((m) => {
                    const role = String(m?.role || '').trim()
                    const isAssistant = role === 'assistant'
                    return (
                      <div key={String(m?.id || Math.random())} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[92%] md:max-w-[78%] rounded-2xl border ${isAssistant ? 'border-neutral-800 bg-neutral-900/70' : 'border-yellow-500/20 bg-yellow-500/10'} px-4 py-3`}>
                          <div className={`text-[10px] font-black uppercase tracking-widest ${isAssistant ? 'text-yellow-500' : 'text-neutral-200'}`}>
                            {isAssistant ? 'VIP Coach' : 'Você'}
                          </div>
                          <div className={`mt-1 text-sm leading-relaxed ${isAssistant ? 'text-neutral-100' : 'text-white font-bold'}`}>{String(m?.text || '')}</div>
                          {isAssistant && Array.isArray(m?.dataUsed) && m.dataUsed.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {m.dataUsed.slice(0, 8).map((d) => (
                                <span key={d} className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-neutral-950 border border-neutral-800 text-neutral-300">
                                  {String(d || '')}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {isAssistant && Array.isArray(m?.followUps) && m.followUps.length ? (
                            <div className="mt-2 flex flex-col gap-1">
                              {m.followUps.slice(0, 3).map((q) => (
                                <button
                                  key={q}
                                  type="button"
                                  onClick={() => {
                                    setDraft(String(q || ''))
                                    try {
                                      if (inputRef.current) inputRef.current.focus()
                                    } catch {}
                                  }}
                                  className="text-left text-xs text-neutral-200 rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-2 hover:bg-neutral-900"
                                >
                                  {String(q || '')}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {isAssistant && Array.isArray(m?.actions) && m.actions.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {m.actions.slice(0, 4).map((a) => (
                                <button
                                  key={`${String(a?.type || '')}-${String(a?.label || '')}`}
                                  type="button"
                                  disabled={!!actionBusy}
                                  onClick={() => handleAction(a)}
                                  className="min-h-[40px] px-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 disabled:opacity-60"
                                >
                                  {String(a?.label || 'Ação')}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                  <div className="text-sm text-neutral-200 font-bold">Pronto. Me diga o que você quer hoje.</div>
                  <div className="mt-1 text-sm text-neutral-400">Dica: use um playbook na esquerda para acelerar.</div>
                </div>
              )}
            </div>

            <div className="border-t border-neutral-800 bg-neutral-900/85 backdrop-blur p-4 sticky bottom-0">
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setDraft(p)
                      try {
                        if (inputRef.current) inputRef.current.focus()
                      } catch {}
                    }}
                    className="shrink-0 h-10 px-3 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-900 text-xs whitespace-nowrap"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escreva sua pergunta..."
                  className="flex-1 min-h-[48px] rounded-xl bg-neutral-950 border border-neutral-800 text-white px-4 font-bold focus:outline-none focus:border-yellow-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={busy}
                  className="min-h-[48px] px-6 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 disabled:opacity-60"
                >
                  {busy ? 'Pensando…' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
