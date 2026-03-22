'use client'

import React, { memo, useMemo, useState } from 'react'
import type { AssessmentFormData } from '@/types/assessment'

/* ──────────────────────────────────────────────────────────
 * Premium Body Measurement Map
 *
 * Hero body silhouette with seamless dark background
 * and delicate floating measurement labels.
 *
 * The body PNG has a pure-black background. Using
 * mix-blend-mode: lighten makes the black invisible,
 * creating a seamless "infinite dark" effect.
 * ────────────────────────────────────────────────────────── */

interface MeasurementPoint {
  id: string
  label: string
  singleField?: string
  leftField?: string
  rightField?: string
  /**
   * Label position as [left%, top%] of the body image container.
   * Calibrated against the actual body-front.png anatomy.
   */
  labelPos: [number, number]
  /** Body anchor for the connecting line [left%, top%] */
  dotPos: [number, number]
  align: 'left' | 'right'
}

/*
 * Positions calibrated against the 1024×1024 body-front.png mannequin:
 * - Head top:    ~8%
 * - Shoulders:   ~20%
 * - Mid-arm:     ~30%
 * - Chest:       ~25%
 * - Waist:       ~38%
 * - Hip:         ~44%
 * - Mid-thigh:   ~58%
 * - Knees:       ~68%
 * - Mid-calf:    ~78%
 * - Feet:        ~95%
 *
 * Body center X = 50%, shoulders ≈ 25%–75%
 */
const MEASUREMENTS: MeasurementPoint[] = [
  // Left side
  { id: 'chest',   label: 'Tórax',   singleField: 'chest_circ',                                    labelPos: [0, 23],  dotPos: [42, 26],  align: 'left' },
  { id: 'arm_l',   label: 'Braço E', leftField: 'arm_circ_left',   singleField: 'arm_circ',        labelPos: [0, 32],  dotPos: [28, 32],  align: 'left' },
  { id: 'hip',     label: 'Quadril', singleField: 'hip_circ',                                      labelPos: [0, 44],  dotPos: [42, 44],  align: 'left' },
  { id: 'thigh_l', label: 'Coxa E',  leftField: 'thigh_circ_left', singleField: 'thigh_circ',      labelPos: [0, 58],  dotPos: [40, 58],  align: 'left' },
  { id: 'calf_l',  label: 'Pant. E', leftField: 'calf_circ_left',  singleField: 'calf_circ',       labelPos: [0, 78],  dotPos: [42, 78],  align: 'left' },
  // Right side
  { id: 'waist',   label: 'Cintura', singleField: 'waist_circ',                                    labelPos: [100, 36], dotPos: [56, 38],  align: 'right' },
  { id: 'arm_r',   label: 'Braço D', rightField: 'arm_circ_right', singleField: 'arm_circ',        labelPos: [100, 32], dotPos: [72, 32],  align: 'right' },
  { id: 'thigh_r', label: 'Coxa D',  rightField: 'thigh_circ_right', singleField: 'thigh_circ',    labelPos: [100, 58], dotPos: [60, 58],  align: 'right' },
  { id: 'calf_r',  label: 'Pant. D', rightField: 'calf_circ_right',  singleField: 'calf_circ',     labelPos: [100, 78], dotPos: [58, 78],  align: 'right' },
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
  const baseSrc = isFemale ? '/body-front-female.png' : '/body-front.png'
  const data = formData as unknown as Record<string, string | undefined>

  const points = useMemo(() =>
    MEASUREMENTS.map((m) => ({ ...m, value: resolveValue(data, m) })).filter(p => p.value),
    [data],
  )

  if (points.length === 0) return null

  return (
    <div
      className="rounded-2xl relative overflow-hidden"
      style={{ background: '#000000' }}
    >
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/10 to-transparent z-10" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-4 pb-0">
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 rounded-full bg-yellow-500/60" />
          <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-[0.18em]">Mapa Corporal</span>
        </div>
        <span className="text-[9px] text-neutral-700 uppercase tracking-[0.2em]">
          {isFemale ? 'Feminino' : 'Masculino'}
        </span>
      </div>

      {/* Hero body — large, seamless background */}
      <div className="relative" style={{ paddingBottom: '110%' }}>
        {/* Body image — fills most of the container, blended seamlessly */}
        <img
          src={baseSrc}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute pointer-events-none"
          style={{
            left: '15%',
            top: '2%',
            width: '70%',
            height: '96%',
            objectFit: 'contain',
            mixBlendMode: 'lighten',
            opacity: 0.6,
          }}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />

        {/* Subtle ambient glow behind body */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '20%',
            top: '10%',
            width: '60%',
            height: '60%',
            background: 'radial-gradient(ellipse at center, rgba(234,179,8,0.03) 0%, transparent 70%)',
          }}
        />

        {/* SVG connecting lines & dots */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {points.map((p) => {
            const isActive = selected === p.id
            return (
              <g key={`line-${p.id}`}>
                <line
                  x1={`${p.labelPos[0] === 0 ? 18 : 82}%`}
                  y1={`${p.labelPos[1]}%`}
                  x2={`${p.dotPos[0]}%`}
                  y2={`${p.dotPos[1]}%`}
                  stroke={isActive ? 'rgba(234,179,8,0.35)' : 'rgba(234,179,8,0.08)'}
                  strokeWidth={isActive ? 0.8 : 0.4}
                />
                <circle
                  cx={`${p.dotPos[0]}%`}
                  cy={`${p.dotPos[1]}%`}
                  r={isActive ? 3 : 1.5}
                  fill={isActive ? 'rgba(234,179,8,0.7)' : 'rgba(234,179,8,0.25)'}
                />
                {isActive && (
                  <circle
                    cx={`${p.dotPos[0]}%`}
                    cy={`${p.dotPos[1]}%`}
                    r={7}
                    fill="none"
                    stroke="rgba(234,179,8,0.15)"
                    strokeWidth={0.5}
                  />
                )}
              </g>
            )
          })}
        </svg>

        {/* Floating labels */}
        {points.map((p) => {
          const isActive = selected === p.id
          const isLeft = p.align === 'left'
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(isActive ? null : p.id)}
              className="absolute transition-all duration-300"
              style={{
                ...(isLeft
                  ? { left: '3%', textAlign: 'left' as const }
                  : { right: '3%', textAlign: 'right' as const }),
                top: `${p.labelPos[1]}%`,
                transform: 'translateY(-50%)',
              }}
            >
              <div
                className="transition-colors duration-300"
                style={{
                  fontSize: '8px',
                  fontWeight: 500,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase' as const,
                  color: isActive ? 'rgba(234,179,8,0.7)' : 'rgba(115,115,115,0.5)',
                  lineHeight: 1,
                }}
              >
                {p.label}
              </div>
              <div
                className="transition-colors duration-300 tabular-nums"
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: isActive ? 'rgba(251,191,36,0.9)' : 'rgba(255,255,255,0.55)',
                  lineHeight: 1.3,
                }}
              >
                {p.value}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer hint */}
      <div className="relative z-10 text-center pb-3 pt-0">
        <span className="text-[8px] text-neutral-800 uppercase tracking-[0.25em]">
          cm · toque para destacar
        </span>
      </div>
    </div>
  )
})

export default BodyMeasurementMap
