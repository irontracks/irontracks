'use client'

import React from 'react'
import { FlaskConical, AlertTriangle, ChevronRight, Loader2, Trash2 } from 'lucide-react'
import type { LabExam } from '@/types/labExam'

function formatDate(raw: string | null): string {
  if (!raw) return 'Sem data'
  try {
    const d = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return raw
  }
}

export function LabExamCard({ exam, onView, onDelete }: { exam: LabExam; onView: () => void; onDelete?: () => void }) {
  const markers = exam.extracted_markers
  const alteredCount = markers?.markers?.filter((m) => m.status !== 'normal').length ?? 0
  const urgentCount = exam.protocol?.medicalAlerts?.filter((a) => a.severity === 'urgent').length ?? 0
  const examTypes = markers?.examTypes ?? []
  const isProcessing = ['pending', 'uploading', 'extracting', 'analyzing'].includes(exam.status)
  const isFailed = exam.status === 'failed'
  const isDone = exam.status === 'done'

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
      <button
        onClick={onView}
        disabled={!isDone}
        className="w-full text-left p-4 flex items-center gap-3 disabled:cursor-default hover:bg-neutral-900/40 transition"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 flex-shrink-0">
          <FlaskConical className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{formatDate(exam.exam_date)}</span>
            {exam.lab_name ? <span className="text-[11px] text-neutral-500 truncate">· {exam.lab_name}</span> : null}
          </div>

          {isProcessing ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Loader2 className="w-3 h-3 text-yellow-500 animate-spin" />
              <span className="text-[11px] text-neutral-400">Processando…</span>
            </div>
          ) : isFailed ? (
            <span className="text-[11px] text-red-400">Falhou — toque para apagar e tentar de novo</span>
          ) : (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {examTypes.slice(0, 2).map((t, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">{t}</span>
              ))}
              {examTypes.length > 2 ? <span className="text-[10px] text-neutral-500">+{examTypes.length - 2}</span> : null}
              {alteredCount > 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">
                  {alteredCount} alterado{alteredCount > 1 ? 's' : ''}
                </span>
              ) : null}
            </div>
          )}
        </div>

        {urgentCount > 0 && (
          <span title="Alerta médico" className="flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </span>
        )}
        {isDone && <ChevronRight className="w-5 h-5 text-neutral-600 flex-shrink-0" />}
      </button>

      {onDelete && (
        <div className="px-4 pb-3 -mt-1 flex justify-end">
          <button onClick={onDelete} className="text-[11px] text-neutral-500 hover:text-red-400 transition inline-flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Apagar
          </button>
        </div>
      )}
    </div>
  )
}
