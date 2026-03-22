'use client'

import React, { useState, useCallback } from 'react'
import { Brain, TrendingUp, AlertTriangle, Sparkles, Loader2, ChevronDown, ChevronUp, Target, Lightbulb } from 'lucide-react'

/* ──────────────────────────────────────────────────────────
 * WeeklyAIReport
 *
 * Dashboard card showing AI-generated weekly training report.
 * Fetches from /api/ai/weekly-report on demand.
 * ────────────────────────────────────────────────────────── */

interface MuscleBalance {
  group: string
  status: 'ok' | 'deficit' | 'excess'
  suggestion: string
}

interface Report {
  summary: string
  sessions: number
  totalVolume?: number
  highlights: string[]
  warnings: string[]
  muscleBalance: MuscleBalance[]
  progressionTips?: string[]
  motivation: string
}

export default function WeeklyAIReport() {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [fetched, setFetched] = useState(false)

  const fetchReport = useCallback(async () => {
    if (fetched && report) { setExpanded(true); return }
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/ai/weekly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const data = await res.json()
      if (data?.ok && data?.report) {
        setReport(data.report)
        setFetched(true)
        setExpanded(true)
      } else {
        setError(data?.error || data?.message || 'Erro ao gerar relatório')
      }
    } catch {
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }, [fetched, report])

  const balanceColor = (status: string) =>
    status === 'ok' ? 'text-emerald-400 bg-emerald-500/10'
    : status === 'deficit' ? 'text-red-400 bg-red-500/10'
    : 'text-yellow-400 bg-yellow-500/10'

  const balanceLabel = (status: string) =>
    status === 'ok' ? '✅' : status === 'deficit' ? '⚠️' : '📈'

  // Not yet fetched — show CTA
  if (!fetched) {
    return (
      <button
        type="button"
        onClick={fetchReport}
        disabled={loading}
        className="w-full rounded-2xl bg-gradient-to-r from-violet-950/40 to-purple-950/30 border border-violet-500/20 p-4 text-left hover:border-violet-500/40 transition-all active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          {loading ? (
            <Loader2 size={20} className="text-violet-400 animate-spin" />
          ) : (
            <Brain size={20} className="text-violet-400" />
          )}
          <div className="flex-1">
            <h3 className="font-black text-white text-sm">Relatório Semanal AI</h3>
            <p className="text-[10px] text-violet-400/70 mt-0.5">
              {loading ? 'Analisando seus treinos da semana…' : 'Toque para gerar seu resumo semanal com IA'}
            </p>
          </div>
          <Sparkles size={16} className="text-violet-500/50" />
        </div>
      </button>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-neutral-900 border border-red-500/20 p-4">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  if (!report) return null

  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-950/30 via-neutral-900/90 to-purple-950/20 border border-violet-500/15 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <Brain size={18} className="text-violet-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-black text-white text-sm">Resumo da Semana</h3>
            <span className="px-1.5 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/25 text-[9px] font-black text-violet-400">
              AI
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5 truncate">
            {report.sessions} treinos{report.totalVolume ? ` • ${Math.round(report.totalVolume).toLocaleString()}kg total` : ''}
          </p>
        </div>
        {expanded ? <ChevronUp size={16} className="text-neutral-500" /> : <ChevronDown size={16} className="text-neutral-500" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Summary */}
          <p className="text-sm text-neutral-200 leading-relaxed">{report.summary}</p>

          {/* Highlights */}
          {report.highlights.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-500/80 uppercase tracking-wider">
                <TrendingUp size={10} />
                <span>Destaques</span>
              </div>
              {report.highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-neutral-300">
                  <span className="text-emerald-400 shrink-0 mt-0.5">▸</span>
                  <span>{h}</span>
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {report.warnings.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] font-black text-yellow-500/80 uppercase tracking-wider">
                <AlertTriangle size={10} />
                <span>Atenção</span>
              </div>
              {report.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-yellow-300/80">
                  <span className="text-yellow-500 shrink-0 mt-0.5">▸</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Muscle Balance */}
          {report.muscleBalance?.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[9px] font-black text-violet-400/80 uppercase tracking-wider">
                <Target size={10} />
                <span>Balanço Muscular</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {report.muscleBalance.map((mb, i) => (
                  <div
                    key={i}
                    className={`px-2 py-1.5 rounded-lg ${balanceColor(mb.status)} text-[10px]`}
                    title={mb.suggestion}
                  >
                    <span className="mr-1">{balanceLabel(mb.status)}</span>
                    <span className="font-bold">{mb.group}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progression Tips */}
          {report.progressionTips && report.progressionTips.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] font-black text-blue-400/80 uppercase tracking-wider">
                <Lightbulb size={10} />
                <span>Próxima Semana</span>
              </div>
              {report.progressionTips.map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-neutral-300">
                  <span className="text-blue-400 shrink-0 mt-0.5">▸</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          )}

          {/* Motivation */}
          <div className="rounded-xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/15 p-3">
            <p className="text-sm text-violet-200 italic">&ldquo;{report.motivation}&rdquo;</p>
          </div>
        </div>
      )}
    </div>
  )
}
