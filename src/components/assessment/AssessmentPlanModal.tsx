'use client'

import React from 'react'
import { X } from 'lucide-react'
import type { AssessmentRow } from './assessmentUtils'
import { formatDateCompact } from './assessmentChartData'
import type { AiPlanEntry } from '@/hooks/useAssessmentHistoryData'

// ────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────

interface AssessmentPlanModalProps {
  assessment: AssessmentRow
  planState: AiPlanEntry | null | undefined
  onClose: () => void
  onRegenerate: (assessment: AssessmentRow) => void
}

// ────────────────────────────────────────────────────────────────
// Badge builder
// ────────────────────────────────────────────────────────────────

function buildBadge(s: AiPlanEntry | null | undefined) {
  if (!s || s.loading) return null
  if (s.error) return null
  if (s.usedAi) return { text: 'IA', tone: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' }
  if (s.reason === 'missing_api_key') return { text: 'Sem IA (config)', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' }
  if (s.reason === 'insufficient_data') return { text: 'Dados insuf.', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' }
  if (s.reason === 'ai_failed') return { text: 'Fallback', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' }
  return { text: 'Plano base', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' }
}

// ────────────────────────────────────────────────────────────────
// Render helpers
// ────────────────────────────────────────────────────────────────

function renderList(raw: unknown) {
  const items = Array.isArray(raw) ? raw : []
  if (!items.length) return null
  return items.map((item: unknown, idx: number) => <li key={idx}>{String(item ?? '')}</li>)
}

// ────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────

export function AssessmentPlanModal({ assessment, planState, onClose, onRegenerate }: AssessmentPlanModalProps) {
  const s = planState
  const plan = s?.plan && typeof s.plan === 'object' ? s.plan : null
  const badge = buildBadge(s)

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold truncate">Plano Tático</div>
            <div className="text-white font-black truncate">
              {formatDateCompact(assessment?.date || assessment?.assessment_date)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-300 hover:text-white flex items-center justify-center transition-all duration-300 active:scale-95"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 max-h-[80vh] overflow-y-auto space-y-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Resumo Tático</div>
              {badge ? (
                <div className={`px-2 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${badge.tone}`}>
                  {badge.text}
                </div>
              ) : null}
            </div>
            {s?.loading ? (
              <div className="text-sm text-neutral-300">Gerando plano tático personalizado…</div>
            ) : s?.error ? (
              <div className="text-sm text-red-400">{s.error}</div>
            ) : plan ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-neutral-900/70 border border-neutral-700 rounded-xl p-4">
                  <ul className="text-sm text-neutral-200 space-y-1 list-disc list-inside">
                    {renderList(plan.summary)}
                  </ul>
                </div>
                <div className="bg-neutral-900/70 border border-neutral-700 rounded-xl p-4 space-y-3">
                  {[
                    { key: 'training', label: 'Treino', textClass: 'text-neutral-200' },
                    { key: 'nutrition', label: 'Nutrição', textClass: 'text-neutral-200' },
                    { key: 'habits', label: 'Hábitos', textClass: 'text-neutral-200' },
                    { key: 'warnings', label: 'Alertas', textClass: 'text-neutral-300' },
                  ].map(({ key, label, textClass }) => {
                    const items = renderList(plan[key])
                    if (!items) return null
                    return (
                      <div key={key}>
                        <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-1">{label}</div>
                        <ul className={`text-sm ${textClass} space-y-1 list-disc list-inside`}>
                          {items}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="text-sm text-neutral-400">Nenhum plano disponível.</div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await onRegenerate(assessment)
                  } catch {}
                }}
                disabled={!!s?.loading}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 transition-all duration-300 active:scale-95 disabled:opacity-60"
              >
                {s?.loading ? 'Gerando…' : 'Gerar novamente'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 transition-all duration-300 active:scale-95"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
