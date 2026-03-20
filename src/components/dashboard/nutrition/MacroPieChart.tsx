'use client'
/**
 * MacroPieChart
 * Donut SVG chart showing Protein / Carbs / Fat as % of calories consumed.
 * Layout: donut centred on top, 3-column legend below. 100% self-contained width.
 */
import { memo, useMemo } from 'react'

interface Props { protein: number; carbs: number; fat: number }

const ITEMS = [
  { key: 'p', label: 'Proteína', color: '#3b82f6', ring: 'bg-blue-500', kcalPer: 4 },
  { key: 'c', label: 'Carbo',    color: '#f59e0b', ring: 'bg-amber-500', kcalPer: 4 },
  { key: 'f', label: 'Gordura',  color: '#eab308', ring: 'bg-yellow-400', kcalPer: 9 },
] as const

function buildArcs(segments: { pct: number; color: string }[]) {
  const R = 38; const cx = 50; const cy = 50
  let angle = -90
  return segments.map(seg => {
    if (seg.pct <= 0) return ''
    const deg = seg.pct * 360
    const r1 = (angle * Math.PI) / 180
    const r2 = ((angle + deg) * Math.PI) / 180
    const x1 = cx + R * Math.cos(r1); const y1 = cy + R * Math.sin(r1)
    const x2 = cx + R * Math.cos(r2); const y2 = cy + R * Math.sin(r2)
    const large = deg > 180 ? 1 : 0
    angle += deg
    return `<path d="M${cx} ${cy}L${x1} ${y1}A${R} ${R} 0 ${large} 1 ${x2} ${y2}Z" fill="${seg.color}" opacity="0.9"/>`
  }).join('')
}

const MacroPieChart = memo(function MacroPieChart({ protein, carbs, fat }: Props) {
  const grams = [protein, carbs, fat]
  const kcals = ITEMS.map((it, i) => grams[i] * it.kcalPer)
  const total = kcals.reduce((s, v) => s + v, 0)

  const arcs = useMemo(() => {
    if (total <= 0) return ''
    return buildArcs(ITEMS.map((_, i) => ({ pct: kcals[i] / total, color: ITEMS[i].color })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protein, carbs, fat, total])

  if (total <= 0) return null

  return (
    <div className="rounded-2xl bg-neutral-900/70 border border-neutral-800 p-4 ring-1 ring-neutral-800/70 overflow-hidden w-full">
      <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 mb-3 whitespace-nowrap">Distribuição de Macros</div>

      {/* Donut centrado */}
      <div className="flex justify-center mb-4">
        <div className="relative w-24 h-24">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="38" fill="#27272a" />
            <circle cx="50" cy="50" r="24" fill="#171717" />
            <g dangerouslySetInnerHTML={{ __html: arcs }} />
            <circle cx="50" cy="50" r="24" fill="#171717" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[11px] font-bold text-white leading-none">{Math.round(total)}</div>
              <div className="text-[8px] text-neutral-500">kcal</div>
            </div>
          </div>
        </div>
      </div>

      {/* Legenda — 3 colunas iguais em grid */}
      <div className="grid grid-cols-3 gap-2">
        {ITEMS.map((it, i) => {
          const pct = total > 0 ? Math.round((kcals[i] / total) * 100) : 0
          return (
            <div key={it.key} className="flex flex-col items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${it.ring}`} />
              <div className="text-[10px] text-neutral-400 text-center leading-tight">{it.label}</div>
              <div className="text-xs font-semibold text-white">{Math.round(grams[i])}g</div>
              <div className="text-[10px] text-neutral-500">{pct}%</div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

export default MacroPieChart
