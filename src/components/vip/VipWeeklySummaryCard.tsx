'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

type WeeklySummary = {
  ok: boolean
  summaryText?: string
  dataUsed?: string[]
  trainedDays?: number
  checkins?: { energy: number | null; mood: number | null; soreness: number | null; sleep: number | null }
  prs?: any[]
  error?: string
}

const safeArray = <T,>(v: any): T[] => (Array.isArray(v) ? (v as T[]) : [])

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
      const json = (await res.json().catch((): any => null)) as WeeklySummary | null
      if (!json?.ok) {
        setData(null)
        setError(String(json?.error || 'Falha ao carregar resumo semanal.'))
        return
      }
      setData(json)
    } catch (e: any) {
      setData(null)
      setError(e?.message ? String(e.message) : 'Falha ao carregar resumo semanal.')
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

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Resumo semanal</div>
          <div className="text-white font-black text-sm">Últimos 7 dias</div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          <RefreshCw size={14} />
          {loading ? 'Atualizando...' : 'Atualizar'}
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

      {summaryText ? (
        <div className="mt-3 rounded-2xl border border-neutral-800 bg-black/30 p-4 whitespace-pre-wrap text-sm text-neutral-200">
          {summaryText}
        </div>
      ) : !error ? (
        <div className="mt-3 text-sm text-neutral-400">Sem dados suficientes ainda.</div>
      ) : null}

      {dataUsed.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {dataUsed.map((x) => (
            <div key={x} className="text-[10px] font-black uppercase tracking-widest text-neutral-300 bg-neutral-900/40 border border-neutral-800 px-2 py-1 rounded-xl">
              {x}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
