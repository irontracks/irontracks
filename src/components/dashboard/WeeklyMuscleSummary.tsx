'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, TrendingUp, Brain, AlertTriangle, Target, Dumbbell } from 'lucide-react'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'
import { logWarn } from '@/lib/logger'

type Insights = {
  summary?: string[]
  imbalanceAlerts?: { type?: string; severity?: string; muscles?: string[]; evidence?: string; suggestion?: string }[]
  recommendations?: { title?: string; actions?: string[] }[]
}
type WeeklyPayload = {
  weekStartDate?: string
  workoutsCount?: number
  topMuscles?: { id: string; label: string; sets: number }[]
  insights?: Insights | null
}

const TARGETS: Record<string, { label: string; minSets: number; maxSets: number }> = Object.fromEntries(
  MUSCLE_GROUPS.map((m) => [m.id, { label: m.label, minSets: m.minSets, maxSets: m.maxSets }]),
)

const fmtRange = (weekStart?: string) => {
  if (!weekStart) return ''
  try {
    const start = new Date(`${weekStart}T00:00:00Z`)
    const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
    const d = (x: Date) => `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}`
    return `${d(start)} – ${d(end)}`
  } catch { return '' }
}

export default function WeeklyMuscleSummary({ onBack }: { onBack: () => void }) {
  const searchParams = useSearchParams()
  const week = String(searchParams.get('week') || '').trim()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [data, setData] = useState<WeeklyPayload | null>(null)
  const [found, setFound] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    const qs = /^\d{4}-\d{2}-\d{2}$/.test(week) ? `?week=${encodeURIComponent(week)}` : ''
    fetch(`/api/muscle/weekly-summary${qs}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return
        if (!json?.ok) { setError(true); return }
        setError(false)
        setFound(Boolean(json.found))
        setData(json.found ? { ...(json.payload || {}), weekStartDate: json.weekStartDate } : null)
      })
      .catch((e) => { if (alive) { logWarn('WeeklyMuscleSummary', 'fetch', e); setError(true) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [week, reloadKey])

  const muscles = useMemo(() => {
    const top = Array.isArray(data?.topMuscles) ? data!.topMuscles : []
    return top
      .map((m) => {
        const t = TARGETS[m.id]
        const meta = t?.minSets || 0
        const pct = meta > 0 ? Math.min(1, m.sets / meta) : (m.sets > 0 ? 1 : 0)
        const reached = meta > 0 && m.sets >= meta
        return { id: m.id, label: m.label || t?.label || m.id, sets: m.sets, meta, pct, reached }
      })
      .sort((a, b) => b.sets - a.sets)
  }, [data])

  const insights = data?.insights || null
  const workouts = Number(data?.workoutsCount || 0)
  const topLabel = muscles[0]?.label || ''

  return (
    <div className="fixed inset-0 z-[1200] bg-neutral-950 flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 pb-3 border-b border-neutral-800" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors -ml-1"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-black text-white leading-tight truncate">Resumo da semana 💪</h1>
          {data?.weekStartDate && <p className="text-xs text-neutral-400 leading-tight">{fmtRange(data.weekStartDate)}</p>}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>
        {loading ? (
          <div className="p-12 flex flex-col items-center gap-3">
            <Loader2 size={28} className="text-yellow-500 animate-spin" />
            <p className="text-sm text-neutral-400">Carregando seu resumo…</p>
          </div>
        ) : error ? (
          <div className="p-10 flex flex-col items-center gap-3 text-center">
            <AlertTriangle size={28} className="text-amber-400" />
            <p className="text-sm text-neutral-400">Não foi possível carregar o resumo.</p>
            <button type="button" onClick={() => { setError(false); setLoading(true); setReloadKey((k) => k + 1) }} className="mt-1 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider text-yellow-500" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}>Tentar de novo</button>
          </div>
        ) : !found || !data ? (
          <div className="p-10 flex flex-col items-center gap-3 text-center">
            <Dumbbell size={28} className="text-neutral-600" />
            <p className="text-sm text-neutral-400">Sem dados de treino para esta semana ainda.</p>
          </div>
        ) : (
          <div className="px-4 py-5 space-y-5 max-w-2xl mx-auto">
            {/* Hero */}
            <div className="rounded-2xl p-5 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(217,119,6,0.06))', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
                <TrendingUp size={26} className="text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="text-3xl font-black text-white leading-none">{workouts}<span className="text-base font-bold text-neutral-400 ml-1.5">treino{workouts === 1 ? '' : 's'}</span></div>
                {topLabel && <div className="text-xs text-amber-300/90 font-bold mt-1 truncate">Foco da semana: {topLabel}</div>}
              </div>
            </div>

            {/* Breakdown muscular */}
            {muscles.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Target size={13} className="text-yellow-500" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-yellow-500">Volume por músculo</h2>
                </div>
                <div className="space-y-2.5">
                  {muscles.map((m) => (
                    <div key={m.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <span className="text-sm font-bold text-white truncate">{m.label}</span>
                        <span className="text-xs font-mono tabular-nums shrink-0 text-neutral-300">
                          {m.sets.toFixed(1).replace(/\.0$/, '')}{m.meta > 0 && <span className="text-neutral-500"> / {m.meta} séries</span>}
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden bg-neutral-800">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(m.pct * 100)}%`, background: m.reached ? 'linear-gradient(90deg, #22c55e, #16a34a)' : 'linear-gradient(90deg, #f59e0b, #d97706)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Insights da IA */}
            {insights?.summary?.length ? (
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Brain size={13} className="text-amber-400" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-amber-400">Análise da IA</h2>
                </div>
                <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  {insights.summary.map((line, i) => (
                    <p key={i} className="text-sm text-neutral-200 leading-relaxed">{line}</p>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Alertas de desequilíbrio */}
            {insights?.imbalanceAlerts?.length ? (
              <div className="space-y-2">
                {insights.imbalanceAlerts.slice(0, 4).map((a, i) => (
                  <div key={i} className="rounded-xl p-3 flex gap-2.5" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      {a.muscles?.length ? <div className="text-xs font-bold text-red-300 mb-0.5">{a.muscles.join(' · ')}</div> : null}
                      {a.evidence ? <p className="text-xs text-neutral-300 leading-snug">{a.evidence}</p> : null}
                      {a.suggestion ? <p className="text-xs text-neutral-400 leading-snug mt-1">→ {a.suggestion}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Recomendações */}
            {insights?.recommendations?.length ? (
              <div className="space-y-2">
                {insights.recommendations.slice(0, 5).map((r, i) => (
                  <div key={i} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {r.title ? <div className="text-sm font-bold text-yellow-400 mb-1">{r.title}</div> : null}
                    {Array.isArray(r.actions) && r.actions.length ? (
                      <ul className="space-y-1">
                        {r.actions.map((act, j) => (
                          <li key={j} className="text-xs text-neutral-300 leading-snug flex gap-1.5"><span className="text-yellow-500/60">•</span><span>{act}</span></li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
