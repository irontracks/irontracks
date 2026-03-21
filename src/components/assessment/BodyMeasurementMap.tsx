'use client'

import React, { memo, useMemo, useState } from 'react'
import type { AssessmentFormData } from '@/types/assessment'

/* ──────────────────────────────────────────────────────────
 * Body Measurement Map — compact layout with labels
 * beside the body silhouette (not overlapping)
 * ────────────────────────────────────────────────────────── */

interface MeasurementItem {
  id: string
  label: string
  singleField?: string
  leftField?: string
  rightField?: string
}

const LEFT_ITEMS: MeasurementItem[] = [
  { id: 'arm_l', label: 'Braço E', leftField: 'arm_circ_left', singleField: 'arm_circ' },
  { id: 'chest', label: 'Tórax', singleField: 'chest_circ' },
  { id: 'waist', label: 'Cintura', singleField: 'waist_circ' },
  { id: 'thigh_l', label: 'Coxa E', leftField: 'thigh_circ_left', singleField: 'thigh_circ' },
  { id: 'calf_l', label: 'Pant. E', leftField: 'calf_circ_left', singleField: 'calf_circ' },
]

const RIGHT_ITEMS: MeasurementItem[] = [
  { id: 'arm_r', label: 'Braço D', rightField: 'arm_circ_right', singleField: 'arm_circ' },
  { id: 'hip', label: 'Quadril', singleField: 'hip_circ' },
  { id: 'waist_r', label: '', singleField: '' }, // Spacer
  { id: 'thigh_r', label: 'Coxa D', rightField: 'thigh_circ_right', singleField: 'thigh_circ' },
  { id: 'calf_r', label: 'Pant. D', rightField: 'calf_circ_right', singleField: 'calf_circ' },
]

function resolveValue(
  data: Record<string, string | undefined>,
  item: MeasurementItem,
): string {
  if (item.leftField) {
    const v = parseFloat(data[item.leftField] || '0')
    if (v > 0) return v.toFixed(1)
  }
  if (item.rightField) {
    const v = parseFloat(data[item.rightField] || '0')
    if (v > 0) return v.toFixed(1)
  }
  if (item.singleField) {
    const v = parseFloat(data[item.singleField] || '0')
    if (v > 0) return v.toFixed(1)
  }
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

  const leftValues = useMemo(() =>
    LEFT_ITEMS.map((item) => ({ ...item, value: resolveValue(data, item) })).filter(i => i.value && i.label),
    [data]
  )

  const rightValues = useMemo(() =>
    RIGHT_ITEMS.map((item) => ({ ...item, value: resolveValue(data, item) })).filter(i => i.value && i.label),
    [data]
  )

  if (leftValues.length === 0 && rightValues.length === 0) return null

  return (
    <div
      className="rounded-2xl border relative overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />

      {/* Header */}
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
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

      {/* Body + Labels Layout: 3 columns [left labels | body | right labels] */}
      <div className="flex items-center justify-center gap-0 px-2 pb-4">

        {/* Left column — measurement labels */}
        <div className="flex flex-col justify-center gap-3 min-w-[72px] shrink-0">
          {leftValues.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(selected === item.id ? null : item.id)}
              className="text-right transition-all duration-200"
            >
              <div
                className="text-[10px] uppercase tracking-wider font-bold truncate"
                style={{ color: selected === item.id ? '#eab308' : 'rgba(163,163,163,0.7)' }}
              >
                {item.label}
              </div>
              <div
                className="text-base font-black tabular-nums"
                style={{ color: selected === item.id ? '#fbbf24' : '#ffffff' }}
              >
                {item.value}
              </div>
            </button>
          ))}
        </div>

        {/* Center — body silhouette */}
        <div className="relative flex-1 max-w-[180px] mx-1">
          <div className="relative aspect-[200/420]">
            <img
              src={baseSrc}
              alt={`Corpo ${isFemale ? 'feminino' : 'masculino'}`}
              loading="lazy"
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              style={{ filter: 'brightness(0.6) contrast(1.1)', opacity: 0.5 }}
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />

            {/* Horizontal indicator lines */}
            <svg viewBox="0 0 200 420" className="absolute inset-0 w-full h-full pointer-events-none">
              {/* Left side dotted lines */}
              {leftValues.map((item, idx) => {
                const yPositions: Record<string, number> = {
                  arm_l: 120, chest: 100, waist: 175, thigh_l: 265, calf_l: 350,
                }
                const y = yPositions[item.id] ?? (80 + idx * 65)
                return (
                  <line
                    key={item.id}
                    x1="0" y1={y}
                    x2="60" y2={y}
                    stroke={selected === item.id ? 'rgba(234,179,8,0.6)' : 'rgba(234,179,8,0.2)'}
                    strokeWidth={selected === item.id ? 1.2 : 0.6}
                    strokeDasharray="3 3"
                  />
                )
              })}
              {/* Right side dotted lines */}
              {rightValues.map((item, idx) => {
                const yPositions: Record<string, number> = {
                  arm_r: 120, hip: 210, thigh_r: 265, calf_r: 350,
                }
                const y = yPositions[item.id] ?? (80 + idx * 65)
                return (
                  <line
                    key={item.id}
                    x1="140" y1={y}
                    x2="200" y2={y}
                    stroke={selected === item.id ? 'rgba(234,179,8,0.6)' : 'rgba(234,179,8,0.2)'}
                    strokeWidth={selected === item.id ? 1.2 : 0.6}
                    strokeDasharray="3 3"
                  />
                )
              })}
              {/* Dots on body */}
              {[...leftValues, ...rightValues].map((item) => {
                const positions: Record<string, [number, number]> = {
                  arm_l: [58, 120], arm_r: [142, 120],
                  chest: [85, 100], waist: [90, 175], hip: [110, 210],
                  thigh_l: [75, 265], thigh_r: [125, 265],
                  calf_l: [78, 350], calf_r: [122, 350],
                }
                const pos = positions[item.id]
                if (!pos) return null
                return (
                  <circle
                    key={`dot-${item.id}`}
                    cx={pos[0]} cy={pos[1]}
                    r={selected === item.id ? 3.5 : 2}
                    fill={selected === item.id ? '#eab308' : 'rgba(234,179,8,0.5)'}
                  />
                )
              })}
            </svg>
          </div>
        </div>

        {/* Right column — measurement labels */}
        <div className="flex flex-col justify-center gap-3 min-w-[72px] shrink-0">
          {rightValues.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(selected === item.id ? null : item.id)}
              className="text-left transition-all duration-200"
            >
              <div
                className="text-[10px] uppercase tracking-wider font-bold truncate"
                style={{ color: selected === item.id ? '#eab308' : 'rgba(163,163,163,0.7)' }}
              >
                {item.label}
              </div>
              <div
                className="text-base font-black tabular-nums"
                style={{ color: selected === item.id ? '#fbbf24' : '#ffffff' }}
              >
                {item.value}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-center gap-3 px-5 pb-4">
        <span className="text-[10px] text-neutral-600 font-bold uppercase tracking-wider">
          Valores em cm
        </span>
        <span className="text-[10px] text-neutral-700">•</span>
        <span className="text-[10px] text-neutral-600 font-bold uppercase tracking-wider">
          Toque para destacar
        </span>
      </div>
    </div>
  )
})

export default BodyMeasurementMap
