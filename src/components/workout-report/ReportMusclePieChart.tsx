'use client'
import React, { useMemo } from 'react'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'

type AnyObj = Record<string, unknown>

interface ReportMusclePieChartProps {
    /** muscleTrend data from useReportData */
    data: AnyObj
}

// Minimal color palette — 14 muscle groups
const PALETTE = [
    '#eab308', '#f59e0b', '#84cc16', '#22c55e', '#10b981',
    '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
    '#f43f5e', '#fb923c', '#a3e635', '#38bdf8',
]

/**
 * ReportMusclePieChart — renders a compact inline SVG donut chart showing
 * volume distribution by muscle group for the current session.
 *
 * Reads `data.byMuscle` (Record<muscleId, { sets: number, volume: number }>).
 */
export function ReportMusclePieChart({ data }: ReportMusclePieChartProps) {
    const segments = useMemo(() => {
        const byMuscle = data?.byMuscle && typeof data.byMuscle === 'object'
            ? (data.byMuscle as Record<string, AnyObj>)
            : {}

        const entries = MUSCLE_GROUPS
            .map((m, idx) => {
                const raw = byMuscle[m.id]
                const vol = Number(raw?.volume ?? raw?.sets ?? 0)
                return { id: m.id, label: m.label, vol, color: PALETTE[idx % PALETTE.length] }
            })
            .filter((e) => e.vol > 0)
            .sort((a, b) => b.vol - a.vol)

        if (!entries.length) return []

        const total = entries.reduce((s, e) => s + e.vol, 0)
        if (total <= 0) return []

        // Build SVG donut segments
        const R = 60   // outer radius
        const r = 36   // inner radius (donut hole)
        const cx = 80
        const cy = 80
        let angle = -Math.PI / 2  // start at top
        const GAP = 0.025  // radians gap between slices

        return entries.map((entry) => {
            const slice = (entry.vol / total) * (Math.PI * 2)
            const startAngle = angle + GAP / 2
            const endAngle = angle + slice - GAP / 2
            angle += slice

            const x1 = cx + R * Math.cos(startAngle)
            const y1 = cy + R * Math.sin(startAngle)
            const x2 = cx + R * Math.cos(endAngle)
            const y2 = cy + R * Math.sin(endAngle)
            const x3 = cx + r * Math.cos(endAngle)
            const y3 = cy + r * Math.sin(endAngle)
            const x4 = cx + r * Math.cos(startAngle)
            const y4 = cy + r * Math.sin(startAngle)
            const largeArc = slice - GAP > Math.PI ? 1 : 0

            const pct = Math.round((entry.vol / total) * 100)
            return { ...entry, path: `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${x3.toFixed(1)} ${y3.toFixed(1)} A ${r} ${r} 0 ${largeArc} 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z`, pct, total }
        })
    }, [data])

    if (!segments.length) return null

    const top5 = segments.slice(0, 5)

    return (
        <div className="mb-8 p-4 rounded-2xl border border-neutral-800 bg-neutral-900/60">
            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">💪 Distribuição muscular</div>
            <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* SVG donut */}
                <svg viewBox="0 0 160 160" width={140} height={140} className="shrink-0">
                    {segments.map((seg) => (
                        <path key={seg.id} d={seg.path} fill={seg.color} opacity={0.9} />
                    ))}
                    {/* Center label */}
                    <text x="80" y="76" textAnchor="middle" fontSize="11" fill="#e5e5e5" fontWeight="700" fontFamily="monospace">Volume</text>
                    <text x="80" y="91" textAnchor="middle" fontSize="9" fill="#737373" fontFamily="monospace">por músculo</text>
                </svg>

                {/* Legend */}
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    {top5.map((seg) => (
                        <div key={seg.id} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                            <div className="text-xs text-neutral-200 truncate flex-1">{seg.label}</div>
                            <div className="text-xs font-mono text-neutral-400 shrink-0">{seg.pct}%</div>
                        </div>
                    ))}
                    {segments.length > 5 && (
                        <div className="text-[10px] text-neutral-500">+{segments.length - 5} outros</div>
                    )}
                </div>
            </div>
        </div>
    )
}
