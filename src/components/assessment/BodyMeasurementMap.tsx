'use client'

import React, { memo, useMemo, useState } from 'react'
import type { AssessmentFormData } from '@/types/assessment'

/* ──────────────────────────────────────────────────────────
 * Premium Body Measurement Map
 * Large hero body silhouette with floating delicate labels
 * ────────────────────────────────────────────────────────── */

interface MeasurementPoint {
  id: string
  label: string
  singleField?: string
  leftField?: string
  rightField?: string
  /** Position as percentage of container: [left%, top%] */
  pos: [number, number]
  /** Dot position on body: [left%, top%] */
  dot: [number, number]
  align: 'left' | 'right'
}

const MEASUREMENTS: MeasurementPoint[] = [
  { id: 'arm_l', label: 'Braço E', leftField: 'arm_circ_left', singleField: 'arm_circ', pos: [2, 22], dot: [27, 27], align: 'left' },
  { id: 'arm_r', label: 'Braço D', rightField: 'arm_circ_right', singleField: 'arm_circ', pos: [98, 22], dot: [73, 27], align: 'right' },
  { id: 'chest', label: 'Tórax', singleField: 'chest_circ', pos: [2, 18], dot: [42, 22], align: 'left' },
  { id: 'waist', label: 'Cintura', singleField: 'waist_circ', pos: [98, 38], dot: [55, 40], align: 'right' },
  { id: 'hip', label: 'Quadril', singleField: 'hip_circ', pos: [2, 44], dot: [45, 47], align: 'left' },
  { id: 'thigh_l', label: 'Coxa E', leftField: 'thigh_circ_left', singleField: 'thigh_circ', pos: [2, 60], dot: [38, 60], align: 'left' },
  { id: 'thigh_r', label: 'Coxa D', rightField: 'thigh_circ_right', singleField: 'thigh_circ', pos: [98, 60], dot: [62, 60], align: 'right' },
  { id: 'calf_l', label: 'Pant. E', leftField: 'calf_circ_left', singleField: 'calf_circ', pos: [2, 80], dot: [40, 79], align: 'left' },
  { id: 'calf_r', label: 'Pant. D', rightField: 'calf_circ_right', singleField: 'calf_circ', pos: [98, 80], dot: [60, 79], align: 'right' },
]

function resolveValue(data: Record<string, string | undefined>, m: MeasurementPoint): string {
  if (m.leftField) { const v = parseFloat(data[m.leftField] || '0'); if (v > 0) return v.toFixed(1) }
  if (m.rightField) { const v = parseFloat(data[m.rightField] || '0'); if (v > 0) return v.toFixed(1) }
  if (m.singleField) { const v = parseFloat(data[m.singleField] || '0'); if (v > 0) return v.toFixed(1) }
  return ''
}

interface Props {
  formData: AssessmentFormData
}

const BodyMeasurementMap = memo(function BodyMeasurementMap({ formData }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const isFemale = formData.gender === 'F'
  const baseSrc = isFemale ? '/body-front-female.png' : '/body-front.png'
  const data = formData as unknown as Record<string, string | undefined>

  const points = useMemo(() =>
    MEASUREMENTS.map((m) => ({ ...m, value: resolveValue(data, m) })).filter(p => p.value),
    [data]
  )

  if (points.length === 0) return null

  return (
    <div
      className="rounded-2xl border relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(15,15,12,0.95) 0%, rgba(8,8,8,0.98) 100%)',
        borderColor: 'rgba(255,255,255,0.05)',
      }}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/15 to-transparent" />

      {/* Header — minimal */}
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
          <span className="text-xs font-bold text-neutral-400 uppercase tracking-[0.15em]">Mapa Corporal</span>
        </div>
        <span className="text-[10px] text-neutral-600 uppercase tracking-[0.2em] font-medium">
          {isFemale ? 'Feminino' : 'Masculino'}
        </span>
      </div>

      {/* Hero body container */}
      <div className="relative w-full px-4 pb-5" style={{ minHeight: '420px' }}>
        {/* Body silhouette — LARGE and centered */}
        <div className="relative mx-auto" style={{ width: '65%', maxWidth: '260px' }}>
          <div className="relative" style={{ aspectRatio: '200/440' }}>
            <img
              src={baseSrc}
              alt={`Corpo ${isFemale ? 'feminino' : 'masculino'}`}
              loading="lazy"
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              style={{ opacity: 0.55, filter: 'brightness(0.75) contrast(1.15)' }}
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />

            {/* Subtle body glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 60% 40% at 50% 35%, rgba(234,179,8,0.04) 0%, transparent 70%)',
              }}
            />
          </div>
        </div>

        {/* Floating labels + connecting lines — absolutely positioned over the container */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ top: '36px' }}>
          {points.map((p) => {
            const isActive = selected === p.id
            // Convert % positions to SVG coordinates
            const lx = p.pos[0]
            const ly = p.pos[1]
            const dx = p.dot[0]
            const dy = p.dot[1]

            return (
              <g key={p.id}>
                {/* Thin connecting line */}
                <line
                  x1={`${lx}%`} y1={`${ly}%`}
                  x2={`${dx}%`} y2={`${dy}%`}
                  stroke={isActive ? 'rgba(234,179,8,0.4)' : 'rgba(234,179,8,0.1)'}
                  strokeWidth={isActive ? 1 : 0.5}
                />
                {/* Dot on body */}
                <circle
                  cx={`${dx}%`} cy={`${dy}%`}
                  r={isActive ? 3.5 : 2}
                  fill={isActive ? '#eab308' : 'rgba(234,179,8,0.35)'}
                />
                {/* Outer ring when active */}
                {isActive && (
                  <circle
                    cx={`${dx}%`} cy={`${dy}%`}
                    r={6}
                    fill="none"
                    stroke="rgba(234,179,8,0.2)"
                    strokeWidth={0.5}
                  />
                )}
              </g>
            )
          })}
        </svg>

        {/* HTML labels — positioned absolutely for crisp text */}
        {points.map((p) => {
          const isActive = selected === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(isActive ? null : p.id)}
              className="absolute transition-all duration-300 group"
              style={{
                left: p.align === 'left' ? '4%' : undefined,
                right: p.align === 'right' ? '4%' : undefined,
                top: `calc(${p.pos[1]}% + 28px)`,
                transform: 'translateY(-50%)',
                textAlign: p.align,
              }}
            >
              <div
                className="transition-colors duration-300"
                style={{
                  fontSize: '9px',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: isActive ? 'rgba(234,179,8,0.8)' : 'rgba(163,163,163,0.4)',
                }}
              >
                {p.label}
              </div>
              <div
                className="transition-colors duration-300 tabular-nums"
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: isActive ? '#fbbf24' : 'rgba(255,255,255,0.7)',
                  lineHeight: 1.2,
                }}
              >
                {p.value}
              </div>
            </button>
          )
        })}
      </div>

      {/* Bottom subtle hint */}
      <div className="text-center pb-4">
        <span className="text-[9px] text-neutral-700 uppercase tracking-[0.2em] font-medium">
          cm · toque para destacar
        </span>
      </div>
    </div>
  )
})

export default BodyMeasurementMap
