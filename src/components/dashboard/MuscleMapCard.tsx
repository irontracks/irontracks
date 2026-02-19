'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Loader2, RefreshCcw, Sparkles, Wand2 } from 'lucide-react'
import BodyMapSvg from '@/components/muscle-map/BodyMapSvg'
import { MUSCLE_BY_ID, MUSCLE_GROUPS, type MuscleId } from '@/utils/muscleMapConfig'
import { backfillExerciseMuscleMaps, getMuscleMapDay, getMuscleMapWeek } from '@/actions/workout-actions'
import { motion, AnimatePresence } from 'framer-motion'

type ApiMuscle = {
  label: string
  sets: number
  minSets: number
  maxSets: number
  ratio: number
  color: string
  view: 'front' | 'back'
}

type ApiPayloadWeek = {
  ok: boolean
  weekStartDate: string
  weekEndDate: string
  workoutsCount: number
  muscles: Record<string, ApiMuscle>
  topMuscles: { id: string; label: string; sets: number }[]
  unknownExercises: string[]
  topExercisesByMuscle?: Record<string, { name: string; setsEq: number }[]>
  diagnostics?: {
    estimatedSetsUsed?: number
    sessionsWithNoLogs?: number
    exercisesWithoutMapping?: string[]
    exercisesWithEstimatedSets?: string[]
  }
  insights: {
    summary: string[]
    imbalanceAlerts: { type: string; severity: string; muscles: string[]; evidence: string; suggestion: string }[]
    recommendations: { title: string; actions: string[] }[]
  }
  ai?: { requested?: boolean; status?: string; insightsStale?: boolean }
}

type ApiPayloadDay = {
  ok: boolean
  date: string
  workoutsCount: number
  muscles: Record<string, ApiMuscle>
  unknownExercises: string[]
  diagnostics?: { estimatedSetsUsed?: number; sessionsWithNoLogs?: number }
  ai?: { requested?: boolean; status?: string; mapped?: number; remaining?: number }
}

type ApiPayload = ApiPayloadWeek | ApiPayloadDay

type Props = {
  onOpenWizard?: () => void
  defaultViewMode?: 'day' | 'week'
}

const localIsoDate = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const formatWeek = (start: string, end: string) => {
  const s = String(start || '').trim()
  const e = String(end || '').trim()
  if (!s || !e) return 'Semana'
  const format = (iso: string) => {
    const d = new Date(`${iso}T00:00:00.000Z`)
    const ok = Number.isFinite(d.getTime())
    if (!ok) return iso
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }
  return `${format(s)}–${format(e)}`
}

const formatDay = (dateIso: string) => {
  const s = String(dateIso || '').trim()
  if (!s) return 'Dia'
  const d = new Date(`${s}T00:00:00.000`)
  const ok = Number.isFinite(d.getTime())
  if (!ok) return s
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const isWeekPayload = (data: ApiPayload | null): data is ApiPayloadWeek => {
  const d: any = data
  return !!d && typeof d.weekStartDate === 'string' && typeof d.weekEndDate === 'string'
}

const PREFILL_KEY = 'irontracks_wizard_prefill_v1'
const CACHE_PREFIX = 'irontracks_muscle_map_cache_v1'
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000
const MIN_FETCH_INTERVAL_MS = 60 * 1000
const CACHE_TTL_MS = 10 * 60 * 1000

const buildCacheKey = (period: 'day' | 'week', date: string) => `${CACHE_PREFIX}_${period}_${period === 'day' ? date : 'week'}`

const readCache = (key: string) => {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const cachedAt = Number(parsed?.cachedAt || 0)
    const data = parsed?.data
    if (!cachedAt || !data) return null
    const stale = Date.now() - cachedAt > CACHE_TTL_MS
    return { data, cachedAt, stale }
  } catch {
    return null
  }
}

const writeCache = (key: string, data: ApiPayload) => {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, JSON.stringify({ cachedAt: Date.now(), data }))
  } catch {}
}

export default function MuscleMapCard(props: Props) {
  const [period, setPeriod] = useState<'day' | 'week'>(props.defaultViewMode || 'week')
  const [selectedDate, setSelectedDate] = useState(localIsoDate)
  const [view, setView] = useState<'front' | 'back'>('front')
  const [selected, setSelected] = useState<MuscleId | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [backfill, setBackfill] = useState<{ status: 'idle' | 'loading' | 'error'; error: string }>({ status: 'idle', error: '' })
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data: ApiPayload | null; error: string }>({
    status: 'idle',
    data: null,
    error: '',
  })
  const [autoSync, setAutoSync] = useState<{ status: 'idle' | 'loading' | 'error'; error: string; lastAt: number }>({
    status: 'idle',
    error: '',
    lastAt: 0,
  })
  const [dataUpdatedAt, setDataUpdatedAt] = useState(0)

  const inflightRef = useRef(false)
  const lastFetchRef = useRef(0)
  const autoErrorCountRef = useRef(0)

  const load = useCallback(
    async (opts?: { refreshCache?: boolean; refreshAi?: boolean; silent?: boolean; source?: 'init' | 'manual' | 'auto' }) => {
      const now = Date.now()
      if (inflightRef.current) return
      if (opts?.source === 'auto' && now - lastFetchRef.current < MIN_FETCH_INTERVAL_MS) return
      inflightRef.current = true
      lastFetchRef.current = now
      if (opts?.silent) {
        setAutoSync((p) => ({ ...p, status: 'loading', error: '' }))
      } else {
        setState((p) => ({ ...p, status: 'loading', error: '' }))
      }
      try {
        const res =
          period === 'day'
            ? await getMuscleMapDay({
                date: selectedDate,
                tzOffsetMinutes: new Date().getTimezoneOffset(),
                refreshAi: !!opts?.refreshAi,
                maxAi: 400,
                batchLimit: 40,
              })
            : await getMuscleMapWeek({ refreshCache: !!opts?.refreshCache, refreshAi: !!opts?.refreshAi })
        if (!res?.ok) {
          const msg = String(res?.error || 'Falha ao carregar mapa muscular')
          if (opts?.silent) {
            autoErrorCountRef.current += 1
            setAutoSync((p) => ({ ...p, status: 'error', error: 'Falha ao sincronizar mapa muscular. Tentando novamente em breve.' }))
          } else {
            setState((prev) => ({ ...prev, status: 'error', error: msg }))
          }
          return
        }
        autoErrorCountRef.current = 0
        const payload = res as unknown as ApiPayload
        setState({ status: 'ready', data: payload, error: '' })
        setAutoSync({ status: 'idle', error: '', lastAt: now })
        setDataUpdatedAt(now)
        const cacheKey = buildCacheKey(period, selectedDate)
        writeCache(cacheKey, payload)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e || 'Falha ao carregar mapa muscular')
        if (opts?.silent) {
          autoErrorCountRef.current += 1
          setAutoSync((p) => ({ ...p, status: 'error', error: 'Falha ao sincronizar mapa muscular. Tentando novamente em breve.' }))
        } else {
          setState((prev) => ({ ...prev, status: 'error', error: msg }))
        }
      } finally {
        inflightRef.current = false
      }
    },
    [period, selectedDate]
  )

  const cacheKey = useMemo(() => buildCacheKey(period, selectedDate), [period, selectedDate])

  useEffect(() => {
    const cached = readCache(cacheKey)
    if (cached?.data) {
      setState((prev) => {
        if (prev?.data && dataUpdatedAt && cached.cachedAt <= dataUpdatedAt) return prev
        return { status: 'ready', data: cached.data as ApiPayload, error: '' }
      })
      if (!dataUpdatedAt || cached.cachedAt > dataUpdatedAt) setDataUpdatedAt(cached.cachedAt)
      if (cached.stale) {
        load({ silent: true, source: 'auto' }).catch(() => setAutoSync((p) => ({ ...p, status: 'error', error: 'Falha ao sincronizar mapa muscular. Tentando novamente em breve.' })))
      }
      return
    }
    const t = window.setTimeout(() => {
      load({ source: 'init' }).catch(() => setState({ status: 'error', data: null, error: 'Falha ao carregar mapa muscular' }))
    }, 0)
    return () => {
      window.clearTimeout(t)
    }
  }, [cacheKey, dataUpdatedAt, load])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      load({ silent: true, source: 'auto' }).catch(() => setAutoSync((p) => ({ ...p, status: 'error', error: 'Falha ao sincronizar mapa muscular. Tentando novamente em breve.' })))
    }, AUTO_SYNC_INTERVAL_MS)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [load])

  const weakestInView = useMemo(() => {
    const muscles = state.data?.muscles && typeof state.data.muscles === 'object' ? state.data.muscles : {}
    const list = Object.entries(muscles)
      .map(([id, m]) => ({ id, ratio: Number((m as Record<string, unknown>)?.ratio || 0), view: (m as Record<string, unknown>)?.view }))
      .filter((x) => x.view === view)
      .sort((a, b) => a.ratio - b.ratio)
    return list[0]?.id ? (list[0].id as MuscleId) : null
  }, [state.data, view])

  useEffect(() => {
    if (selected) return
    if (!weakestInView) return
    const t = window.setTimeout(() => setSelected(weakestInView), 0)
    return () => window.clearTimeout(t)
  }, [selected, weakestInView])

  const musclesForView = useMemo(() => {
    const data = state.data
    const items = data?.muscles && typeof data.muscles === 'object' ? data.muscles : {}
    return Object.fromEntries(Object.entries(items).filter(([, v]) => v && typeof v === 'object' && (v as Record<string, unknown>).view === view))
  }, [state.data, view])

  const selectedInfo = useMemo(() => {
    const id = selected
    if (!id) return null
    const data = state.data?.muscles?.[id]
    if (data) return { id, ...data }
    const meta = (MUSCLE_BY_ID as any)[id]
    if (!meta) return null
    return { id, label: meta.label, sets: 0, minSets: meta.minSets, maxSets: meta.maxSets, ratio: 0, color: '#111827', view: meta.view }
  }, [selected, state.data])

  const weekLabel = period === 'day' ? formatDay(selectedDate) : isWeekPayload(state.data) ? formatWeek(state.data.weekStartDate, state.data.weekEndDate) : 'Semana'
  const aiStatus = String(state.data?.ai?.status || '').trim()
  const aiLabel =
    aiStatus === 'ok'
      ? 'IA ativa'
      : aiStatus === 'failed'
        ? 'IA falhou'
        : aiStatus === 'missing_api_key'
          ? 'Sem IA (config)'
          : 'IA sob demanda'

  const weakMuscles = useMemo(() => {
    const muscles = state.data?.muscles && typeof state.data.muscles === 'object' ? state.data.muscles : {}
    return Object.entries(muscles)
      .map(([id, m]) => ({ id, label: String((m as Record<string, unknown>)?.label || id), ratio: Number((m as Record<string, unknown>)?.ratio || 0), sets: Number((m as Record<string, unknown>)?.sets || 0), minSets: Number((m as Record<string, unknown>)?.minSets || 0), view: (m as Record<string, unknown>)?.view }))
      .filter((x) => x.view === view)
      .sort((a, b) => a.ratio - b.ratio)
      .slice(0, 3)
  }, [state.data, view])

  const prefillWizard = () => {
    if (typeof window === 'undefined') return
    const deficits = weakMuscles
      .filter((m) => Number.isFinite(m.minSets) && m.minSets > 0 && m.sets < m.minSets)
      .slice(0, 2)
    if (!deficits.length) return
    const lines = deficits.map((m) => `- ${m.label}: ${m.sets.toLocaleString('pt-BR')} sets (meta ${m.minSets}–${Number((state.data?.muscles?.[m.id] as any)?.maxSets || 0)})`)
    const constraints = [
      'FOCO (equilíbrio muscular):',
      ...lines,
      '',
      'Regras:',
      '- Priorize incluir exercícios para esses músculos nesta sessão.',
      '- Mantenha o treino dentro do tempo configurado.',
      '- Não ignore restrições/dor relatadas pelo aluno.',
    ].join('\n')
    window.localStorage.setItem(PREFILL_KEY, JSON.stringify({ constraints }))
    props.onOpenWizard?.()
  }

  const runBackfill = useCallback(async () => {
    if (backfill.status === 'loading') return
    setBackfill({ status: 'loading', error: '' })
    const res = await backfillExerciseMuscleMaps({ days: 365, maxAi: 240 })
    if (!res?.ok) {
      const msg = String(res?.error || 'Falha ao reprocessar histórico')
      setBackfill({ status: 'error', error: msg })
      try { window.alert(msg) } catch {}
      return
    }
    setBackfill({ status: 'idle', error: '' })
    try {
      window.alert(
        `Reprocessamento concluído.\n` +
          `Exercícios únicos: ${Number(res?.uniqueExercises || 0).toLocaleString('pt-BR')}\n` +
          `Mapeados (heurística): ${Number(res?.heuristicMapped || 0).toLocaleString('pt-BR')}\n` +
          `Mapeados (IA): ${Number(res?.aiMapped || 0).toLocaleString('pt-BR')}\n` +
          `Ainda sem mapa: ${Number((Array.isArray(res?.remainingUnmapped) ? res.remainingUnmapped.length : 0) || 0).toLocaleString('pt-BR')}`
      )
    } catch {}
    await load({ refreshCache: true, refreshAi: false, source: 'manual' })
  }, [backfill.status, load])

  return (
    <div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl shadow-lg shadow-black/30 overflow-hidden">
      <div
        data-tour="muscle-map"
        className="p-4 cursor-pointer select-none"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          setExpanded((v) => !v)
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Mapa muscular</div>
            <div className="text-white font-black text-lg truncate">{weekLabel}</div>
            <div className="text-xs text-neutral-400 flex flex-wrap items-center gap-2">
              <span>
                {state.data ? `${state.data.workoutsCount} treino(s) ${period === 'day' ? 'no dia' : 'na semana'}` : 'Análise por músculo'}
              </span>
              <span className="text-neutral-600">•</span>
              <span>{aiLabel}</span>
              <span className="text-neutral-600">•</span>
              <span className="inline-flex items-center gap-1 text-neutral-500">
                {autoSync.status === 'loading' ? <Loader2 size={12} className="animate-spin" /> : null}
                {autoSync.status === 'error' ? 'Sync falhou' : 'Sync ativo'}
              </span>
              {autoSync.lastAt ? (
                <>
                  <span className="text-neutral-600">•</span>
                  <span className="text-neutral-500">
                    Atualizado {new Date(autoSync.lastAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </>
              ) : null}
              {weakMuscles.length ? (
                <>
                  <span className="text-neutral-600">•</span>
                  <span className="text-neutral-500">
                    Mais baixos: {weakMuscles.map((m) => m.label).join(', ')}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label={expanded ? 'Recolher' : 'Expandir'}
              onClick={(e) => {
                e.stopPropagation()
                setExpanded((v) => !v)
              }}
              className="text-neutral-500 hover:text-neutral-300 rounded-full hover:bg-neutral-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
            >
              <motion.span className="inline-flex" animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={18} />
              </motion.span>
            </button>
          </div>
        </div>
      </div>

      {state.status === 'error' ? <div className="mt-3 text-sm font-semibold text-red-300">{state.error}</div> : null}
      {autoSync.status === 'error' ? <div className="mt-2 text-xs font-semibold text-amber-300">{autoSync.error}</div> : null}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="px-4 pb-4 space-y-4 overflow-hidden"
          >
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-1 flex gap-1 w-fit">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPeriod('day')
                    }}
                    className={
                      period === 'day'
                        ? 'min-h-[36px] px-3 rounded-lg bg-neutral-900 text-yellow-500 border border-yellow-500/30 font-black text-xs uppercase tracking-widest'
                        : 'min-h-[36px] px-3 rounded-lg bg-transparent text-neutral-400 hover:text-white font-black text-xs uppercase tracking-widest'
                    }
                  >
                    Dia
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPeriod('week')
                    }}
                    className={
                      period === 'week'
                        ? 'min-h-[36px] px-3 rounded-lg bg-neutral-900 text-yellow-500 border border-yellow-500/30 font-black text-xs uppercase tracking-widest'
                        : 'min-h-[36px] px-3 rounded-lg bg-transparent text-neutral-400 hover:text-white font-black text-xs uppercase tracking-widest'
                    }
                  >
                    Semana
                  </button>
                </div>

                {period === 'day' ? (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(String(e.target.value || '').trim())}
                    onClick={(e) => e.stopPropagation()}
                    className="min-h-[40px] px-3 rounded-xl bg-black border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest"
                  />
                ) : null}
              </div>

              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-1 flex gap-1 w-fit">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setView('front')
                  }}
                  className={
                    view === 'front'
                      ? 'min-h-[36px] px-3 rounded-lg bg-neutral-900 text-yellow-500 border border-yellow-500/30 font-black text-xs uppercase tracking-widest'
                      : 'min-h-[36px] px-3 rounded-lg bg-transparent text-neutral-400 hover:text-white font-black text-xs uppercase tracking-widest'
                  }
                >
                  Frente
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setView('back')
                  }}
                  className={
                    view === 'back'
                      ? 'min-h-[36px] px-3 rounded-lg bg-neutral-900 text-yellow-500 border border-yellow-500/30 font-black text-xs uppercase tracking-widest'
                      : 'min-h-[36px] px-3 rounded-lg bg-transparent text-neutral-400 hover:text-white font-black text-xs uppercase tracking-widest'
                  }
                >
                  Costas
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    load({ refreshCache: true, refreshAi: false, source: 'manual' })
                  }}
                  disabled={state.status === 'loading'}
                  className="min-h-[40px] px-3 rounded-xl bg-black border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-950 disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {state.status === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                  Atualizar
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    load({ refreshCache: true, refreshAi: true, source: 'manual' })
                  }}
                  disabled={state.status === 'loading'}
                  className="min-h-[40px] px-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {state.status === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  Gerar com IA
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    runBackfill()
                  }}
                  disabled={state.status === 'loading' || backfill.status === 'loading'}
                  className="min-h-[40px] px-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {backfill.status === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                  Histórico
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    prefillWizard()
                  }}
                  disabled={!props.onOpenWizard || state.status === 'loading' || weakMuscles.length === 0}
                  className="min-h-[40px] px-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 disabled:opacity-60 inline-flex items-center gap-2"
                >
                  <Wand2 size={16} />
                  Criar treino
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          key={`map-${dataUpdatedAt}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="lg:col-span-1 bg-black rounded-2xl border border-neutral-800 p-3"
        >
          <BodyMapSvg
            view={view}
            muscles={musclesForView}
            selected={selected}
            onSelect={(id) => {
              setSelected((prev) => (prev === id ? null : id))
            }}
          />
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] font-black uppercase tracking-widest">
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-2">
              <div className="text-neutral-500">Baixo</div>
              <div className="h-2 rounded-full mt-1" style={{ background: '#1f2937' }} />
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-2">
              <div className="text-neutral-500">Na meta</div>
              <div className="h-2 rounded-full mt-1" style={{ background: '#f59e0b' }} />
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-2">
              <div className="text-neutral-500">Alto</div>
              <div className="h-2 rounded-full mt-1" style={{ background: '#ef4444' }} />
            </div>
          </div>
        </motion.div>

        <motion.div key={`details-${dataUpdatedAt}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="lg:col-span-2 space-y-3">
          <div className="bg-neutral-950 rounded-2xl border border-neutral-800 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Detalhes</div>
              <div className="text-[11px] font-black uppercase tracking-widest text-neutral-500">
                {state.status === 'loading' ? 'Carregando…' : state.data ? aiLabel : '—'}
              </div>
            </div>

            {selectedInfo ? (
              <div className="mt-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-white font-black">{selectedInfo.label}</div>
                  <div className="text-xs font-black text-neutral-300">{selectedInfo.sets.toLocaleString('pt-BR')} sets</div>
                </div>
                <div className="mt-2 h-2 rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, selectedInfo.ratio * 100))}%`, background: selectedInfo.color }}
                  />
                </div>
                <div className="mt-2 text-xs text-neutral-400">
                  Meta sugerida: {selectedInfo.minSets}–{selectedInfo.maxSets} sets/semana
                </div>

                {isWeekPayload(state.data) && state.data.topExercisesByMuscle?.[selectedInfo.id]?.length ? (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-500">Top exercícios</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {state.data.topExercisesByMuscle[selectedInfo.id].slice(0, 4).map((x, idx) => (
                        <div key={`${x.name}-${idx}`} className="rounded-xl border border-neutral-800 bg-black px-3 py-2">
                          <div className="text-xs font-bold text-neutral-200 truncate">{x.name}</div>
                          <div className="text-[11px] text-neutral-500">{Number(x.setsEq || 0).toLocaleString('pt-BR')} sets eq.</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 text-sm text-neutral-300">Toque em um músculo para ver detalhes.</div>
            )}
          </div>

          <div className="bg-neutral-950 rounded-2xl border border-neutral-800 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-widest text-yellow-500 flex items-center gap-2">
                <Sparkles size={14} /> Insights da IA
              </div>
              {state.status === 'loading' ? <Loader2 size={16} className="animate-spin text-neutral-400" /> : null}
            </div>

            {isWeekPayload(state.data) && state.data.insights?.summary?.length ? (
              <ul className="mt-3 space-y-2">
                {state.data.insights.summary.map((item, idx) => (
                  <li key={idx} className="text-sm text-neutral-100">
                    • {String(item || '')}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 text-sm text-neutral-400">Sem insights suficientes para essa semana.</div>
            )}

            {isWeekPayload(state.data) && state.data.insights?.imbalanceAlerts?.length ? (
              <div className="mt-4 space-y-2">
                {state.data.insights.imbalanceAlerts.slice(0, 4).map((a, idx) => (
                  <div key={idx} className="rounded-xl border border-neutral-800 bg-black p-3">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-300">{String(a.type || 'Alerta')}</div>
                    <div className="mt-1 text-sm text-neutral-100">{String(a.suggestion || '').trim()}</div>
                    {String(a.evidence || '').trim() ? <div className="mt-1 text-xs text-neutral-500">{String(a.evidence || '').trim()}</div> : null}
                  </div>
                ))}
              </div>
            ) : null}

            {state.data?.unknownExercises?.length ? (
              <div className="mt-4 text-xs text-neutral-500">
                Exercícios sem mapeamento completo: {state.data.unknownExercises.slice(0, 6).join(', ')}
              </div>
            ) : null}

            {Number(state.data?.diagnostics?.estimatedSetsUsed || 0) > 0 ? (
              <div className="mt-2 text-xs text-neutral-600">
                Estimativa aplicada: {Number(state.data?.diagnostics?.estimatedSetsUsed || 0).toLocaleString('pt-BR')} set(s) (sem logs completos).
              </div>
            ) : null}
          </div>

          <div className="bg-neutral-950 rounded-2xl border border-neutral-800 p-4">
            <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Top músculos</div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(isWeekPayload(state.data) ? state.data.topMuscles : [])
                .filter((x) => x && x.id && (state.data?.muscles?.[x.id]?.view || '') === view)
                .slice(0, 6)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelected(m.id as any)}
                    className="rounded-xl border border-neutral-800 bg-black p-3 text-left hover:bg-neutral-950 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-black text-neutral-100">{m.label}</div>
                      <div className="text-xs font-black text-neutral-400">{Number(m.sets || 0).toLocaleString('pt-BR')}</div>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-neutral-800 overflow-hidden">
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(0, Number(state.data?.muscles?.[m.id]?.ratio || 0) * 100))}%`, background: state.data?.muscles?.[m.id]?.color || '#1f2937' }}
                      />
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </motion.div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {MUSCLE_GROUPS.filter((m) => m.view === view)
          .slice(0, 8)
          .map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected(m.id)}
              className="rounded-xl border border-neutral-800 bg-black px-3 py-2 text-left hover:bg-neutral-950 transition-colors"
            >
              <div className="text-[11px] font-black uppercase tracking-widest text-neutral-400">{m.label}</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="text-sm font-black text-neutral-100">{Number(state.data?.muscles?.[m.id]?.sets || 0).toLocaleString('pt-BR')}</div>
                <div className="w-3 h-3 rounded-full" style={{ background: state.data?.muscles?.[m.id]?.color || '#111827' }} />
              </div>
            </button>
          ))}
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
