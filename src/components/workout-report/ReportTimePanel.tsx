'use client'

import React from 'react'
import { CheckCircle2, AlertTriangle, Clock, Timer } from 'lucide-react'

type RestCompliance = {
  setsTracked: number
  onTime: number
  tooShort: number
  tooLong: number
}

type ReportTimePanelProps = {
  reportRest: Record<string, unknown> | null
  reportCadence: Record<string, unknown> | null
}

const toNum = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : null
}

function formatSec(sec: number | null | undefined): string {
  const n = toNum(sec)
  if (n == null || n <= 0) return '—'
  if (n < 60) return `${Math.round(n)}s`
  const m = Math.floor(n / 60)
  const s = Math.round(n % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

// ─── Rest Compliance Badge ───────────────────────────────────────────────────

function RestComplianceBadge({ planned, actual }: { planned: number | null; actual: number | null }) {
  if (planned == null || planned <= 0 || actual == null || actual <= 0) return null
  const ratio = actual / planned
  const deltaPct = Math.round((ratio - 1) * 100)
  if (ratio >= 0.8 && ratio <= 1.2) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
        <CheckCircle2 size={10} /> Na meta
      </span>
    )
  }
  if (ratio < 0.8) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
        <AlertTriangle size={10} /> {Math.abs(deltaPct)}% curto
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">
      <AlertTriangle size={10} /> +{deltaPct}% longo
    </span>
  )
}

// ─── Cadence Compliance Badge ────────────────────────────────────────────────

function CadenceBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null
  if (pct >= 80 && pct <= 120) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
        <CheckCircle2 size={10} /> Na cadência
      </span>
    )
  }
  if (pct < 80) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
        <AlertTriangle size={10} /> Acelerado ({Math.round(pct)}%)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">
      <AlertTriangle size={10} /> Lento ({Math.round(pct)}%)
    </span>
  )
}

// ─── Bar ─────────────────────────────────────────────────────────────────────

function ComplianceBar({ onTime, tooShort, tooLong }: { onTime: number; tooShort: number; tooLong: number }) {
  const total = onTime + tooShort + tooLong
  if (total <= 0) return null
  const pctOk = Math.round((onTime / total) * 100)
  const pctShort = Math.round((tooShort / total) * 100)
  const pctLong = 100 - pctOk - pctShort
  return (
    <div className="mt-2 space-y-1">
      <div className="flex rounded-full overflow-hidden h-1.5 bg-neutral-800">
        {pctOk > 0 && <div className="bg-green-500 transition-all" style={{ width: `${pctOk}%` }} />}
        {pctShort > 0 && <div className="bg-blue-400 transition-all" style={{ width: `${pctShort}%` }} />}
        {pctLong > 0 && <div className="bg-yellow-400 transition-all" style={{ width: `${pctLong}%` }} />}
      </div>
      <div className="flex gap-3 flex-wrap text-[9px] font-black uppercase tracking-widest">
        {onTime > 0 && <span className="text-green-400">✓ {onTime} na meta</span>}
        {tooShort > 0 && <span className="text-blue-400">↓ {tooShort} curto</span>}
        {tooLong > 0 && <span className="text-yellow-400">↑ {tooLong} longo</span>}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const ReportTimePanel = ({ reportRest, reportCadence }: ReportTimePanelProps) => {
  const plannedRest = toNum(reportRest?.avgPlannedRestSec)
  const actualRest = toNum(reportRest?.avgActualRestSec)
  const compliance = reportRest?.compliance as RestCompliance | null | undefined
  const hasRestData = (plannedRest != null && plannedRest > 0) || (actualRest != null && actualRest > 0)

  const cadencePct = toNum(reportCadence?.compliancePct)
  const cadenceExpected = toNum(reportCadence?.avgExpectedSec)
  const cadenceActual = toNum(reportCadence?.avgActualSec)
  const cadenceSets = toNum(reportCadence?.setsChecked)
  const hasCadenceData = cadenceSets != null && cadenceSets > 0

  if (!hasRestData && !hasCadenceData) return null

  return (
    <div className="mb-8 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60">
      <div className="mb-4">
        <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Tempo &amp; Cadência</div>
        <div className="text-lg font-black text-white">Análise temporal</div>
        <div className="text-xs text-neutral-300">Descanso planejado vs real e conformidade de cadência.</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Descanso ────────────────────────────────────────────────────── */}
        {hasRestData && (
          <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-yellow-500 shrink-0" />
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Descanso</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-neutral-600 mb-0.5">Planejado</div>
                <div className="text-xl font-mono font-black text-white">{formatSec(plannedRest)}</div>
                <div className="text-[9px] text-neutral-600">média por série</div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-neutral-600 mb-0.5">Real</div>
                <div className={`text-xl font-mono font-black ${actualRest != null && actualRest > 0 ? 'text-white' : 'text-neutral-600'}`}>
                  {formatSec(actualRest)}
                </div>
                <div className="text-[9px] text-neutral-600">via timer</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <RestComplianceBadge planned={plannedRest} actual={actualRest} />
              {actualRest == null || actualRest <= 0 ? (
                <span className="text-[9px] text-neutral-600">Use o timer para rastrear</span>
              ) : null}
            </div>

            {compliance && (compliance.onTime > 0 || compliance.tooShort > 0 || compliance.tooLong > 0) && (
              <ComplianceBar
                onTime={compliance.onTime}
                tooShort={compliance.tooShort}
                tooLong={compliance.tooLong}
              />
            )}
          </div>
        )}

        {/* ── Cadência ────────────────────────────────────────────────────── */}
        {hasCadenceData && (
          <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Timer size={14} className="text-yellow-500 shrink-0" />
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Cadência</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-neutral-600 mb-0.5">Esperada</div>
                <div className="text-xl font-mono font-black text-white">{formatSec(cadenceExpected)}</div>
                <div className="text-[9px] text-neutral-600">média por série</div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-neutral-600 mb-0.5">Real</div>
                <div className={`text-xl font-mono font-black ${cadenceActual != null && cadenceActual > 0 ? 'text-white' : 'text-neutral-600'}`}>
                  {formatSec(cadenceActual)}
                </div>
                <div className="text-[9px] text-neutral-600">execução medida</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <CadenceBadge pct={cadencePct} />
            </div>

            <div className="text-[9px] text-neutral-600">
              Baseado em {Math.round(cadenceSets ?? 0)} série{(cadenceSets ?? 0) !== 1 ? 's' : ''} verificada{(cadenceSets ?? 0) !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
