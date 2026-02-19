'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Sparkles, FileText, RefreshCw, ArrowRight } from 'lucide-react'
import { generatePostWorkoutInsights } from '@/actions/workout-actions'

type Row = {
  id: string
  name: string | null
  date: string | null
  created_at: string | null
  notes: any
}

const safeJsonParse = (raw: unknown) => {
  try {
    if (!raw) return null
    if (typeof raw === 'object') return raw
    const s = String(raw || '').trim()
    if (!s) return null
    return JSON.parse(s)
  } catch {
    return null
  }
}

const formatBr = (iso: string) => {
  const s = String(iso || '').trim()
  if (!s) return ''
  const base = s.includes('T') ? s.slice(0, 10) : s.slice(0, 10)
  const [y, m, d] = base.split('-')
  if (!y || !m || !d) return base
  return `${d}/${m}/${y}`
}

export default function VipInsightsPanel(props: { onOpenReport?: (session: unknown) => void; onOpenHistory?: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const inFlightRef = useRef(false)
  const [upgradeCta, setUpgradeCta] = useState(false)

  const load = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    setError('')
    setUpgradeCta(false)
    try {
      const res = await fetch('/api/workouts/history?limit=30', { method: 'GET', credentials: 'include', cache: 'no-store' })
      const json = await res.json().catch((): any => null)
      if (!json?.ok) {
        setRows([])
        setError(String(json?.error || 'Falha ao carregar histórico.'))
        return
      }
      const list = Array.isArray(json?.rows) ? json.rows : []
      const mapped = list
        .map((r: any) => ({
          id: String(r?.id || '').trim(),
          name: r?.name != null ? String(r.name) : null,
          date: r?.date != null ? String(r.date) : null,
          created_at: r?.created_at != null ? String(r.created_at) : null,
          notes: r?.notes ?? null,
        }))
        .filter((r: Row) => Boolean(r.id))
      setRows(mapped)
    } catch (e: any) {
      setRows([])
      setError(e?.message ? String(e.message) : 'Falha ao carregar histórico.')
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const items = useMemo(() => {
    const list = Array.isArray(rows) ? rows : []
    return list.slice(0, 8).map((r) => {
      const session = safeJsonParse(r.notes)
      const hasAi = !!(session && typeof session === 'object' && (session as any)?.ai && typeof (session as any).ai === 'object')
      const dateIso = String(r.date || r.created_at || '').slice(0, 10)
      return {
        ...r,
        dateLabel: dateIso ? formatBr(dateIso) : '',
        hasAi,
        session,
      }
    })
  }, [rows])

  const openReport = async (workoutId: string) => {
    const id = String(workoutId || '').trim()
    if (!id) return
    try {
      const { data } = await supabase.from('workouts').select('id, notes').eq('id', id).maybeSingle()
      const session = safeJsonParse(data?.notes)
      if (!session) return
      props.onOpenReport?.(session)
    } catch {}
  }

  const generate = async (workoutId: string) => {
    const id = String(workoutId || '').trim()
    if (!id) return
    if (busyId) return
    setBusyId(id)
    setError('')
    setUpgradeCta(false)
    try {
      const res = await generatePostWorkoutInsights({ workoutId: id })
      if (!res?.ok) {
        const needsUpgrade = !!(res as any)?.upgradeRequired || String((res as any)?.error || '').toLowerCase().includes('vip_required')
        setUpgradeCta(needsUpgrade)
        const msg = needsUpgrade ? 'Disponível para assinantes VIP.' : String((res as any)?.error || 'Falha ao gerar insights.')
        setError(msg)
        return
      }
      await load()
      await openReport(id)
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Insights</div>
          <div className="text-white font-black text-sm">Pós-treino e progressão</div>
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
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 flex items-center justify-between gap-3">
          <div className="min-w-0">{error}</div>
          {upgradeCta ? (
            <button
              type="button"
              onClick={() => (window.location.href = '/marketplace')}
              className="shrink-0 rounded-xl bg-yellow-500 px-3 py-2 text-xs font-black text-black hover:bg-yellow-400"
            >
              Ver planos
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-neutral-400">Finalize um treino para gerar insights.</div>
        ) : (
          items.map((r) => (
            <div key={r.id} className="rounded-xl border border-neutral-800 bg-black/30 px-3 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{r.dateLabel || '—'}</div>
                <div className="text-sm font-black text-white truncate">{String(r.name || 'Treino')}</div>
              </div>
              <div className="flex items-center gap-2">
                {r.hasAi ? (
                  <button
                    type="button"
                    onClick={() => openReport(r.id)}
                    className="inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
                  >
                    <FileText size={14} />
                    <span className="ml-2">Ver relatório</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => generate(r.id)}
                    disabled={busyId === r.id}
                    className="inline-flex items-center justify-center rounded-xl bg-yellow-500 px-3 py-2 text-xs font-black text-black hover:bg-yellow-400 disabled:opacity-60"
                  >
                    <Sparkles size={14} />
                    <span className="ml-2">{busyId === r.id ? 'Gerando...' : 'Gerar insights'}</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => props.onOpenHistory?.()}
          className="inline-flex items-center gap-2 text-xs font-black text-neutral-300 hover:text-white"
        >
          Abrir histórico completo <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
