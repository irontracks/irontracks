'use client'

import { useState, useEffect } from 'react'

type WeekDay = { date: string; calories: number }

type ReportData = {
  summary: string
  highlights: string[]
  tip: string
}

type Props = {
  weeklyData: WeekDay[]
  goals: { calories: number; protein: number; carbs: number; fat: number }
}

const CACHE_KEY = 'nutrition_weekly_report_v1'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h

function getCached(): ReportData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ts: number; data: ReportData }
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY)
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

function setCache(data: ReportData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch { /* silent */ }
}

export default function WeeklyAIReport({ weeklyData, goals }: Props) {
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  // Check sessionStorage cache on mount
  useEffect(() => {
    const cached = getCached()
    if (cached) {
      setReport(cached)
      setOpen(true)
    }
  }, [])

  // Only show if we have at least 2 days of data
  const daysWithData = weeklyData.filter((d) => d.calories > 0).length
  if (daysWithData < 2) return null

  const generate = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    setOpen(true)
    try {
      const res = await fetch('/api/ai/nutrition-weekly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyData, goals }),
      })
      const json = await res.json().catch((): null => null)
      if (!json?.ok) {
        const msg = json?.upgradeRequired
          ? 'Disponível para assinantes VIP Pro.'
          : String(json?.error || 'Falha ao gerar relatório.')
        setError(msg)
        return
      }
      const data: ReportData = {
        summary: String(json.summary || ''),
        highlights: Array.isArray(json.highlights) ? (json.highlights as string[]).map(String) : [],
        tip: String(json.tip || ''),
      }
      setReport(data)
      setCache(data)
    } catch {
      setError('Falha na conexão.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-3xl bg-neutral-900/85 border border-neutral-800 shadow-[0_12px_35px_rgba(0,0,0,0.45)] overflow-hidden ring-1 ring-neutral-800/60">
      {/* Header */}
      <button
        type="button"
        onClick={() => {
          if (!report && !loading) {
            generate()
          } else {
            setOpen((v) => !v)
          }
        }}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-800/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">🤖</span>
          <div className="text-left">
            <div className="text-[10px] uppercase tracking-[0.24em] text-neutral-400">Análise semanal</div>
            <div className="text-sm font-semibold text-white">
              {loading ? 'Gerando análise...' : report ? 'Relatório da semana' : 'Ver relatório com IA'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <span className="animate-spin text-sm">⏳</span>}
          {!loading && (
            <span className="text-neutral-500 text-xs">{open ? '▲' : '▼'}</span>
          )}
        </div>
      </button>

      {/* Content */}
      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-neutral-800/60">
          {loading && (
            <div className="pt-4 space-y-2">
              <div className="h-3 w-3/4 rounded bg-neutral-800/70 animate-pulse" />
              <div className="h-3 w-5/6 rounded bg-neutral-800/60 animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-neutral-800/50 animate-pulse" />
            </div>
          )}

          {error && !loading && (
            <div className="pt-4 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {report && !loading && (
            <div className="pt-4 space-y-3">
              {/* Summary */}
              <p className="text-sm text-neutral-200 leading-relaxed">{report.summary}</p>

              {/* Highlights */}
              {report.highlights.length > 0 && (
                <ul className="space-y-1.5">
                  {report.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-neutral-300">
                      <span className="mt-0.5 shrink-0 text-yellow-400">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Tip */}
              {report.tip && (
                <div className="rounded-xl bg-purple-500/10 border border-purple-500/15 px-3 py-2 text-xs text-purple-200 italic">
                  💡 {report.tip}
                </div>
              )}

              {/* Regenerate */}
              <button
                type="button"
                onClick={generate}
                disabled={loading}
                className="text-xs text-neutral-500 hover:text-neutral-300 transition"
              >
                Regenerar análise
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
