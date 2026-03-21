'use client'

import React, { memo, useMemo, useState } from 'react'
import type { AssessmentFormData } from '@/types/assessment'

/* ──────────────────────────────────────────────────────────
 * Measurement label positions (SVG viewBox = 200 × 460)
 * Each label has:
 *   - x,y: label center
 *   - cx,cy: body connection point (where the line "touches" the body)
 *   - side: 'center' | 'left' | 'right' (label alignment)
 * ────────────────────────────────────────────────────────── */

interface MeasurementPoint {
  id: string
  label: string
  /** Fields in formData to read values from */
  singleField?: string
  leftField?: string
  rightField?: string
  /** Label position */
  x: number
  y: number
  /** Body anchor for the connecting line */
  cx: number
  cy: number
  side: 'left' | 'right' | 'center'
  unit: 'cm' | 'mm'
}

const FRONT_MEASUREMENTS: MeasurementPoint[] = [
  // Circumferences
  { id: 'arm_l', label: 'Braço E', singleField: 'arm_circ', leftField: 'arm_circ_left', x: 8, y: 130, cx: 55, cy: 135, side: 'left', unit: 'cm' },
  { id: 'arm_r', label: 'Braço D', singleField: 'arm_circ', rightField: 'arm_circ_right', x: 192, y: 130, cx: 145, cy: 135, side: 'right', unit: 'cm' },
  { id: 'chest', label: 'Tórax', singleField: 'chest_circ', x: 100, y: 92, cx: 100, cy: 108, side: 'center', unit: 'cm' },
  { id: 'waist', label: 'Cintura', singleField: 'waist_circ', x: 100, y: 167, cx: 100, cy: 180, side: 'center', unit: 'cm' },
  { id: 'hip', label: 'Quadril', singleField: 'hip_circ', x: 100, y: 210, cx: 100, cy: 220, side: 'center', unit: 'cm' },
  { id: 'thigh_l', label: 'Coxa E', singleField: 'thigh_circ', leftField: 'thigh_circ_left', x: 8, y: 280, cx: 70, cy: 278, side: 'left', unit: 'cm' },
  { id: 'thigh_r', label: 'Coxa D', singleField: 'thigh_circ', rightField: 'thigh_circ_right', x: 192, y: 280, cx: 130, cy: 278, side: 'right', unit: 'cm' },
  { id: 'calf_l', label: 'Pant. E', singleField: 'calf_circ', leftField: 'calf_circ_left', x: 8, y: 365, cx: 73, cy: 362, side: 'left', unit: 'cm' },
  { id: 'calf_r', label: 'Pant. D', singleField: 'calf_circ', rightField: 'calf_circ_right', x: 192, y: 365, cx: 127, cy: 362, side: 'right', unit: 'cm' },
]

/** Resolve the value to display for a measurement point */
function resolveValue(
  formData: Record<string, string | undefined>,
  point: MeasurementPoint,
): { display: string; detail: string | null } {
  const leftVal = point.leftField ? parseFloat(formData[point.leftField] || '0') : 0
  const rightVal = point.rightField ? parseFloat(formData[point.rightField] || '0') : 0
  const singleVal = point.singleField ? parseFloat(formData[point.singleField] || '0') : 0

  // For lateral points, show the specific side value
  if (point.side === 'left' && leftVal > 0) {
    return { display: leftVal.toFixed(1), detail: null }
  }
  if (point.side === 'right' && rightVal > 0) {
    return { display: rightVal.toFixed(1), detail: null }
  }

  // For center points with bilateral, show average
  if (leftVal > 0 && rightVal > 0) {
    const avg = ((leftVal + rightVal) / 2).toFixed(1)
    return { display: avg, detail: `E:${leftVal} D:${rightVal}` }
  }

  // Single value fallback
  if (singleVal > 0) {
    return { display: singleVal.toFixed(1), detail: null }
  }
  if (leftVal > 0) return { display: leftVal.toFixed(1), detail: null }
  if (rightVal > 0) return { display: rightVal.toFixed(1), detail: null }

  return { display: '', detail: null }
}

interface Props {
  formData: AssessmentFormData
}

const BodyMeasurementMap = memo(function BodyMeasurementMap({ formData }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const isFemale = formData.gender === 'F'
  const baseSrc = isFemale ? '/body-front-female.png' : '/body-front.png'

  const data = formData as unknown as Record<string, string | undefined>

  const measurements = useMemo(() => {
    return FRONT_MEASUREMENTS.map((point) => ({
      ...point,
      ...resolveValue(data, point),
    })).filter((m) => m.display)
  }, [data])

  if (measurements.length === 0) return null

  return (
    <div className="rounded-2xl border p-5 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)', borderColor: 'rgba(255,255,255,0.06)' }}>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />

      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-yellow-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="3" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="9" y1="22" x2="12" y2="16" />
          <line x1="15" y1="22" x2="12" y2="16" />
        </svg>
        <h3 className="text-lg font-bold text-white">Mapa Corporal</h3>
        <span className="text-[10px] text-neutral-500 uppercase tracking-wider ml-auto font-bold">
          {isFemale ? 'Feminino' : 'Masculino'}
        </span>
      </div>

      <div className="relative w-full max-w-[320px] mx-auto select-none">
        {/* Body silhouette image */}
        <div className="relative aspect-[200/460]">
          <img
            src={baseSrc}
            alt={`Corpo ${isFemale ? 'feminino' : 'masculino'}`}
            loading="lazy"
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-40"
            style={{ filter: 'brightness(0.7) contrast(1.2)' }}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />

          {/* SVG overlay with labels and connecting lines */}
          <svg
            viewBox="0 0 200 460"
            className="absolute inset-0 w-full h-full"
            style={{ overflow: 'visible' }}
          >
            <defs>
              <filter id="label-glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <linearGradient id="line-gradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(234,179,8,0.6)" />
                <stop offset="100%" stopColor="rgba(234,179,8,0.15)" />
              </linearGradient>
              <linearGradient id="line-gradient-r" x1="1" y1="0" x2="0" y2="0">
                <stop offset="0%" stopColor="rgba(234,179,8,0.6)" />
                <stop offset="100%" stopColor="rgba(234,179,8,0.15)" />
              </linearGradient>
            </defs>

            {measurements.map((m) => {
              const isSelected = selected === m.id
              const lineGrad = m.side === 'right' ? 'url(#line-gradient-r)' : 'url(#line-gradient)'

              return (
                <g
                  key={m.id}
                  onClick={() => setSelected(isSelected ? null : m.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Connecting line */}
                  <line
                    x1={m.x}
                    y1={m.y}
                    x2={m.cx}
                    y2={m.cy}
                    stroke={isSelected ? 'rgba(234,179,8,0.8)' : lineGrad}
                    strokeWidth={isSelected ? 1.2 : 0.7}
                    strokeDasharray={isSelected ? 'none' : '2 2'}
                  />

                  {/* Dot on body */}
                  <circle
                    cx={m.cx}
                    cy={m.cy}
                    r={isSelected ? 3 : 2}
                    fill={isSelected ? '#eab308' : 'rgba(234,179,8,0.6)'}
                  />

                  {/* Label pill background */}
                  <rect
                    x={m.side === 'left' ? m.x - 38 : m.side === 'right' ? m.x - 2 : m.x - 20}
                    y={m.y - 16}
                    width={40}
                    height={isSelected && m.detail ? 28 : 20}
                    rx={5}
                    fill={isSelected ? 'rgba(234,179,8,0.15)' : 'rgba(23,23,23,0.85)'}
                    stroke={isSelected ? 'rgba(234,179,8,0.5)' : 'rgba(255,255,255,0.08)'}
                    strokeWidth={0.6}
                  />

                  {/* Label text */}
                  <text
                    x={m.side === 'left' ? m.x - 18 : m.side === 'right' ? m.x + 18 : m.x}
                    y={m.y - 8}
                    textAnchor="middle"
                    className="select-none"
                    style={{
                      fontSize: '5px',
                      fontWeight: 700,
                      fill: isSelected ? '#eab308' : 'rgba(163,163,163,0.9)',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {m.label}
                  </text>

                  {/* Value text */}
                  <text
                    x={m.side === 'left' ? m.x - 18 : m.side === 'right' ? m.x + 18 : m.x}
                    y={m.y + 1}
                    textAnchor="middle"
                    className="select-none"
                    style={{
                      fontSize: '7px',
                      fontWeight: 900,
                      fill: isSelected ? '#fbbf24' : '#ffffff',
                    }}
                  >
                    {m.display}
                  </text>

                  {/* Detail text (E/D) when selected */}
                  {isSelected && m.detail && (
                    <text
                      x={m.side === 'left' ? m.x - 18 : m.side === 'right' ? m.x + 18 : m.x}
                      y={m.y + 9}
                      textAnchor="middle"
                      style={{
                        fontSize: '4px',
                        fontWeight: 600,
                        fill: 'rgba(163,163,163,0.7)',
                      }}
                    >
                      {m.detail}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {/* Unit legend */}
        <div className="flex justify-center gap-4 mt-2">
          <span className="text-[10px] text-neutral-600 font-bold uppercase tracking-wider">
            Valores em cm
          </span>
          <span className="text-[10px] text-neutral-700">•</span>
          <span className="text-[10px] text-neutral-600 font-bold uppercase tracking-wider">
            Toque para detalhes
          </span>
        </div>
      </div>
    </div>
  )
})

export default BodyMeasurementMap
