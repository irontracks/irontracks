'use client'

import React, { memo, useMemo, useState } from 'react'
import type { AssessmentFormData } from '@/types/assessment'

/* ──────────────────────────────────────────────────────────
 * Premium Body Measurement Map v4
 *
 * Full-bleed body silhouette (custom rendered images)
 * with minimal floating measurement badges.
 * Background = pure #000 + mix-blend-mode:lighten = seamless.
 * ────────────────────────────────────────────────────────── */

interface MeasurementPoint {
  id: string
  label: string
  singleField?: string
  leftField?: string
  rightField?: string
  /** Label position [left%, top%] relative to the body image container */
  lx: number
  ly: number
  /** Dot on body [left%, top%] */
  dx: number
  dy: number
  side: 'L' | 'R'
}

/*
 * Calibrated against the new body-measure-male.png:
 * Body is centered, more proportional & detailed than old one.
 * Head top ≈ 5%, shoulders ≈ 18%, chest ≈ 23%, waist ≈ 38%,
 * hips ≈ 43%, mid-thigh ≈ 58%, knees ≈ 68%, calves ≈ 80%, feet ≈ 95%
 * Body X center = 50%, left shoulder ≈ 28%, right shoulder ≈ 72%
 */
const POINTS: MeasurementPoint[] = [
  // Left labels
  { id: 'arm_l',   label: 'Braço E',  leftField: 'arm_circ_left',   singleField: 'arm_circ',   lx: 2,  ly: 28, dx: 26, dy: 30, side: 'L' },
  { id: 'chest',   label: 'Tórax',    singleField: 'chest_circ',                                lx: 2,  ly: 22, dx: 40, dy: 24, side: 'L' },
  { id: 'hip',     label: 'Quadril',  singleField: 'hip_circ',                                  lx: 2,  ly: 43, dx: 40, dy: 44, side: 'L' },
  { id: 'thigh_l', label: 'Coxa E',   leftField: 'thigh_circ_left', singleField: 'thigh_circ',  lx: 2,  ly: 57, dx: 38, dy: 57, side: 'L' },
  { id: 'calf_l',  label: 'Pant. E',  leftField: 'calf_circ_left',  singleField: 'calf_circ',   lx: 2,  ly: 78, dx: 41, dy: 79, side: 'L' },
  // Right labels
  { id: 'arm_r',   label: 'Braço D',  rightField: 'arm_circ_right', singleField: 'arm_circ',    lx: 98, ly: 28, dx: 74, dy: 30, side: 'R' },
  { id: 'waist',   label: 'Cintura',  singleField: 'waist_circ',                                lx: 98, ly: 37, dx: 58, dy: 38, side: 'R' },
  { id: 'thigh_r', label: 'Coxa D',   rightField: 'thigh_circ_right', singleField: 'thigh_circ',lx: 98, ly: 57, dx: 62, dy: 57, side: 'R' },
  { id: 'calf_r',  label: 'Pant. D',  rightField: 'calf_circ_right',  singleField: 'calf_circ', lx: 98, ly: 78, dx: 59, dy: 79, side: 'R' },
]

function resolveValue(data: Record<string, string | undefined>, m: MeasurementPoint): string {
  if (m.leftField)   { const v = parseFloat(data[m.leftField]  || '0'); if (v > 0) return v.toFixed(1) }
  if (m.rightField)  { const v = parseFloat(data[m.rightField] || '0'); if (v > 0) return v.toFixed(1) }
  if (m.singleField) { const v = parseFloat(data[m.singleField]|| '0'); if (v > 0) return v.toFixed(1) }
  return ''
}

interface Props {
  formData: AssessmentFormData
}

const BodyMeasurementMap = memo(function BodyMeasurementMap({ formData }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const isFemale = formData.gender === 'F'
  const baseSrc = isFemale ? '/body-measure-female.png' : '/body-measure-male.png'
  const data = formData as unknown as Record<string, string | undefined>

  const points = useMemo(() =>
    POINTS.map((m) => ({ ...m, value: resolveValue(data, m) })).filter(p => p.value),
    [data],
  )

  if (points.length === 0) return null

  return (
    <div className="rounded-2xl relative overflow-hidden" style={{ background: '#000' }}>
      {/* Accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-600/15 to-transparent z-10" />

      {/* Minimal header */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 rounded-full bg-yellow-500/50" />
          <span className="text-[10px] font-medium text-neutral-600 uppercase tracking-[0.18em]">Mapa Corporal</span>
        </div>
        <span className="text-[9px] text-neutral-700 uppercase tracking-[0.2em]">
          {isFemale ? 'Feminino' : 'Masculino'}
        </span>
      </div>

      {/* ─── Main body container ─── */}
      <div className="relative" style={{ aspectRatio: '1 / 1.25' }}>

        {/* Body image — LARGE, centered, blended */}
        <img
          src={baseSrc}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute pointer-events-none select-none"
          style={{
            left: '10%',
            top: '0',
            width: '80%',
            height: '100%',
            objectFit: 'contain',
            mixBlendMode: 'lighten',
            opacity: 0.7,
          }}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />

        {/* Subtle warm glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '25%', top: '15%', width: '50%', height: '45%',
            background: 'radial-gradient(ellipse at center, rgba(234,179,8,0.025) 0%, transparent 70%)',
          }}
        />

        {/* ─── SVG layer: lines + dots ─── */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
          {points.map((p) => {
            const isActive = selected === p.id
            const labelX = p.side === 'L' ? 16 : 84
            return (
              <g key={`svg-${p.id}`}>
                {/* Connecting line */}
                <line
                  x1={`${labelX}%`} y1={`${p.ly}%`}
                  x2={`${p.dx}%`}   y2={`${p.dy}%`}
                  stroke={isActive ? 'rgba(234,179,8,0.3)' : 'rgba(255,255,255,0.04)'}
                  strokeWidth={isActive ? 0.8 : 0.4}
                />
                {/* Dot on body */}
                <circle
                  cx={`${p.dx}%`} cy={`${p.dy}%`}
                  r={isActive ? 3 : 1.5}
                  fill={isActive ? 'rgba(234,179,8,0.6)' : 'rgba(255,255,255,0.12)'}
                  className="transition-all duration-300"
                />
              </g>
            )
          })}
        </svg>

        {/* ─── HTML labels ─── */}
        {points.map((p) => {
          const isActive = selected === p.id
          const isLeft = p.side === 'L'
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(isActive ? null : p.id)}
              className="absolute transition-all duration-200"
              style={{
                ...(isLeft
                  ? { left: '3%', textAlign: 'right' as const }
                  : { right: '3%', textAlign: 'left' as const }),
                top: `${p.ly}%`,
                transform: 'translateY(-50%)',
                width: '13%',
              }}
            >
              <div style={{
                fontSize: '7px',
                fontWeight: 500,
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                color: isActive ? 'rgba(234,179,8,0.65)' : 'rgba(130,130,130,0.35)',
                lineHeight: 1,
                marginBottom: '2px',
                whiteSpace: 'nowrap' as const,
              }}>
                {p.label}
              </div>
              <div className="tabular-nums" style={{
                fontSize: '13px',
                fontWeight: 600,
                color: isActive ? 'rgba(251,191,36,0.85)' : 'rgba(255,255,255,0.5)',
                lineHeight: 1.1,
              }}>
                {p.value}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className="relative z-10 text-center pb-3">
        <span className="text-[8px] text-neutral-800 uppercase tracking-[0.2em]">
          cm · toque para destacar
        </span>
      </div>
    </div>
  )
})

export default BodyMeasurementMap
