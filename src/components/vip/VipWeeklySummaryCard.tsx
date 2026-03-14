'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, Flame, Trophy, Activity, Moon } from 'lucide-react'
import { getErrorMessage } from '@/utils/errorMessage'

type WeeklySummary = {
  ok: boolean
  summaryText?: string
  dataUsed?: string[]
  trainedDays?: number
  checkins?: { energy: number | null; mood: number | null; soreness: number | null; sleep: number | null }
  prs?: unknown[]
  error?: string
}

const safeArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export default function VipWeeklySummaryCard() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<WeeklySummary | null>(null)
  const [error, setError] = useState('')
  const inFlightRef = useRef(false)

  const load = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/vip/weekly-summary', { method: 'GET', credentials: 'include', cache: 'no-store' })
      const json = (await res.json().catch((): null => null)) as WeeklySummary | null
      if (!json?.ok) {
        setData(null)
        setError(String(json?.error || 'Falha ao carregar resumo semanal.'))
        return
      }
      setData(json)
    } catch (e: unknown) {
      setData(null)
      setError(getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao carregar resumo semanal.')
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const dataUsed = useMemo(() => safeArray<string>(data?.dataUsed), [data?.dataUsed])
  const summaryText = useMemo(() => String(data?.summaryText || '').trim(), [data?.summaryText])
  const trainedDays = data?.trainedDays ?? 0
  const prsCount = safeArray(data?.prs).length
  const checkins = data?.checkins

  return (
    <div className="rounded-2xl p-[1px]" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.2) 0%, rgba(255,255,255,0.03) 50%, rgba(234,179,8,0.08) 100%)' }}>
      <div className="rounded-[15px] p-4" style={{ background: 'rgba(12,12,12,0.99)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#f59e0b' }}>Resumo semanal</div>
            <div className="text-white font-black text-sm">Últimos 7 dias</div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-neutral-300 hover:text-white disabled:opacity-60 transition-all active:scale-95"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Carregando' : 'Atualizar'}
          </button>
        </div>

        {error ? (
          error === 'vip_required' ? (
            <div className="mt-3 rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-3 text-sm text-yellow-100 flex items-center justify-between gap-3">
              <div className="min-w-0">Disponível para assinantes VIP.</div>
              <button
                type="button"
                onClick={() => (window.location.href = '/marketplace')}
                className="shrink-0 rounded-xl bg-yellow-500 px-3 py-2 text-xs font-black text-black hover:bg-yellow-400"
              >
                Ver planos
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
          )
        ) : null}

        {/* ── Metric Cards ──────────────────────────────────────────── */}
        {data && !error && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Dias treinados */}
            <div className="rounded-xl p-3" style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.12)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Flame size={14} className="text-yellow-500" />
                <span className="text-[9px] font-black uppercase tracking-widest text-yellow-600">Treinos</span>
              </div>
              <div className="text-xl font-black text-white">{trainedDays}</div>
              <div className="text-[10px] text-neutral-500">dia{trainedDays !== 1 ? 's' : ''}</div>
            </div>

            {/* PRs */}
            <div className="rounded-xl p-3" style={{ background: prsCount > 0 ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${prsCount > 0 ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy size={14} className={prsCount > 0 ? 'text-purple-400' : 'text-neutral-600'} />
                <span className="text-[9px] font-black uppercase tracking-widest text-purple-500">Recordes</span>
              </div>
              <div className="text-xl font-black text-white">{prsCount}</div>
              <div className="text-[10px] text-neutral-500">PR{prsCount !== 1 ? 's' : ''} esta semana</div>
            </div>

            {/* Energia */}
            {checkins?.energy != null && (
              <div className="rounded-xl p-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Activity size={14} className="text-green-400" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-green-600">Energia</span>
                </div>
                <div className="text-xl font-black text-white">{Math.round(checkins.energy * 10) / 10}</div>
                <div className="text-[10px] text-neutral-500">média</div>
              </div>
            )}

            {/* Sono */}
            {checkins?.sleep != null && (
              <div className="rounded-xl p-3" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Moon size={14} className="text-indigo-400" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500">Sono</span>
                </div>
                <div className="text-xl font-black text-white">{Math.round(checkins.sleep * 10) / 10}</div>
                <div className="text-[10px] text-neutral-500">média</div>
              </div>
            )}
          </div>
        )}

        {/* ── Summary text ──────────────────────────────────────────── */}
        {summaryText ? (
          <div className="mt-3 rounded-2xl p-4 whitespace-pre-wrap text-sm text-neutral-200 leading-relaxed" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {summaryText}
          </div>
        ) : !error && data ? (
          <div className="mt-3 text-sm text-neutral-400">Sem dados suficientes ainda.</div>
        ) : null}

        {dataUsed.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {dataUsed.map((x) => (
              <div key={x} className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {x}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
