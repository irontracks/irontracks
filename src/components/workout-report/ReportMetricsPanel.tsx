'use client'

import { formatMinutesLabel } from '@/utils/report/formatters'
import { legendaDaDuracao, rotuloDaVariacaoSemanal } from '@/utils/report/reportLabels'

type ReportMetricsPanelProps = {
  reportTotals: Record<string, unknown> | null
  reportRest: Record<string, unknown> | null
  reportWeekly: Record<string, unknown> | null
  reportLoadFlags: Record<string, unknown> | null
}

const formatNumber = (value: unknown) => {
  const v = Number(value || 0)
  return Number.isFinite(v) ? v : null
}

export const ReportMetricsPanel = ({
  reportTotals,
  reportRest,
  reportWeekly,
  reportLoadFlags,
}: ReportMetricsPanelProps) => {
  return (
    <div className="mb-8 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="t-meta text-xs">Métricas do treino</div>
          <div className="text-lg font-black text-white">Resumo técnico</div>
          <div className="text-xs text-neutral-300">Volume, densidade e diagnóstico da sessão.</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Duração</div>
          <div className="text-lg font-mono font-bold text-white">
            {(() => {
              const v = formatNumber(reportTotals?.durationMinutes)
              if (v == null || v <= 0) return '—'
              return formatMinutesLabel(v * 60)
            })()}
          </div>
          {/* Fecha a conta: Duração − (Execução + Descanso) sobrava sem nome, e
              três números lado a lado convidam à soma. */}
          {(() => {
            const legenda = legendaDaDuracao(
              reportTotals?.durationMinutes,
              reportTotals?.executionMinutes,
              reportTotals?.restMinutes,
            )
            return legenda ? <div className="text-[10px] text-neutral-400 mt-1 leading-snug">{legenda}</div> : null
          })()}
        </div>
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Execução</div>
          <div className="text-lg font-mono font-bold text-white">
            {(() => {
              const v = formatNumber(reportTotals?.executionMinutes)
              if (v == null || v <= 0) return '—'
              return formatMinutesLabel(v * 60)
            })()}
          </div>
        </div>
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Descanso</div>
          <div className="text-lg font-mono font-bold text-white">
            {(() => {
              const v = formatNumber(reportTotals?.restMinutes)
              if (v == null || v <= 0) return '—'
              return formatMinutesLabel(v * 60)
            })()}
          </div>
        </div>
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Densidade</div>
          <div className="text-lg font-mono font-bold text-white">
            {(() => {
              const v = formatNumber(reportTotals?.densityKgPerMin)
              if (v == null || v <= 0) return '—'
              return `${v.toFixed(1).replace('.', ',')} kg/min`
            })()}
          </div>
        </div>
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Dens. Exec</div>
          <div className="text-lg font-mono font-bold text-white">
            {(() => {
              const v = formatNumber(reportTotals?.densityKgPerMinExec)
              if (v == null || v <= 0) return '—'
              return `${v.toFixed(1).replace('.', ',')} kg/min`
            })()}
          </div>
        </div>
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Descanso médio</div>
          <div className="text-lg font-mono font-bold text-white">
            {(() => {
              const v = formatNumber(reportRest?.avgPlannedRestSec)
              if (v == null || v <= 0) return '—'
              return `${Math.round(v)} s`
            })()}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Volume semanal</div>
          <div className="text-sm font-mono font-bold text-white">
            {(() => {
              const v = formatNumber(reportWeekly?.currentWeekKg)
              if (v == null || v <= 0) return '—'
              return `${v.toLocaleString('pt-BR')} kg`
            })()}
          </div>
          <div className="text-[10px] text-neutral-400 mt-1">
            {(() => {
              const v = formatNumber(reportWeekly?.previousWeekKg)
              if (v == null || v <= 0) return 'sem semana anterior'
              return `semana anterior ${v.toLocaleString('pt-BR')} kg`
            })()}
          </div>
        </div>
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Variação semanal</div>
          <div className="text-sm font-mono font-bold text-white">
            {(() => {
              const v = formatNumber(reportWeekly?.deltaPct)
              if (v == null) return '—'
              return `${v.toFixed(1)}%`
            })()}
          </div>
          <div className="text-[10px] text-neutral-400 mt-1">
            {rotuloDaVariacaoSemanal({
              deltaPct: reportWeekly?.deltaPct,
              isHeavyWeek: reportWeekly?.isHeavyWeek,
              previousWeekKg: reportWeekly?.previousWeekKg,
            })}
          </div>
        </div>
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Diagnóstico</div>
          <div className="text-xs text-neutral-200 font-semibold">
            {(() => {
              const reason = String(reportLoadFlags?.reason || '—')
              const heavy = !!reportLoadFlags?.isHeavyWeek
              const badDay = !!reportLoadFlags?.isBadDay
              if (reason === '—') return '—'
              if (badDay && heavy) return 'Queda explicada por semana pesada'
              if (badDay) return 'Queda pontual no dia'
              if (heavy) return 'Semana pesada controlada'
              return 'Dentro do padrão recente'
            })()}
          </div>
          <div className="text-[10px] text-neutral-400 mt-1">
            {(() => {
              const v = formatNumber(reportLoadFlags?.dayDropPct)
              if (v == null) return '—'
              return `dia vs média ${v.toFixed(1)}%`
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
