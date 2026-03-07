'use client'

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
          <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Métricas do treino</div>
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
              return `${v.toFixed(1)} min`
            })()}
          </div>
        </div>
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Execução</div>
          <div className="text-lg font-mono font-bold text-white">
            {(() => {
              const v = formatNumber(reportTotals?.executionMinutes)
              if (v == null || v <= 0) return '—'
              return `${v.toFixed(1)} min`
            })()}
          </div>
        </div>
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Descanso</div>
          <div className="text-lg font-mono font-bold text-white">
            {(() => {
              const v = formatNumber(reportTotals?.restMinutes)
              if (v == null || v <= 0) return '—'
              return `${v.toFixed(1)} min`
            })()}
          </div>
        </div>
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Densidade</div>
          <div className="text-lg font-mono font-bold text-white">
            {(() => {
              const v = formatNumber(reportTotals?.densityKgPerMin)
              if (v == null || v <= 0) return '—'
              return `${v.toFixed(1)} kg/min`
            })()}
          </div>
        </div>
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Dens. Exec</div>
          <div className="text-lg font-mono font-bold text-white">
            {(() => {
              const v = formatNumber(reportTotals?.densityKgPerMinExec)
              if (v == null || v <= 0) return '—'
              return `${v.toFixed(1)} kg/min`
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
          <div className="text-[10px] text-neutral-500 mt-1">
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
          <div className="text-[10px] text-neutral-500 mt-1">
            {reportWeekly?.isHeavyWeek ? 'semana pesada' : 'semana normal'}
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
          <div className="text-[10px] text-neutral-500 mt-1">
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
