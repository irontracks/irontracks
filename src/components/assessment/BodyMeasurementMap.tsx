'use client'

import React, { memo, useMemo, useState } from 'react'
import type { AssessmentFormData } from '@/types/assessment'

/* ──────────────────────────────────────────────────────────
 * Premium Adaptive Body Measurement Map
 *
 * Selects the closest body type image based on the
 * person's body fat %. 12 pre-rendered 3D images
 * (6 male + 6 female) covering all body compositions.
 *
 * Card bg = #000 + mix-blend-mode:lighten = seamless.
 * ────────────────────────────────────────────────────────── */

/* ─── Body type selection ─── */

interface BodyType {
  id: string
  label: string
  /** BF% upper threshold (inclusive) */
  maxBf: number
  src: string
}

const MALE_TYPES: BodyType[] = [
  { id: 'shredded', label: 'Definido',  maxBf: 8,  src: '/body-types/male-shredded.png' },
  { id: 'lean',     label: 'Magro',     maxBf: 12, src: '/body-types/male-lean.png' },
  { id: 'athletic', label: 'Atlético',  maxBf: 16, src: '/body-types/male-athletic.png' },
  { id: 'average',  label: 'Médio',     maxBf: 22, src: '/body-types/male-average.png' },
  { id: 'stocky',   label: 'Robusto',   maxBf: 28, src: '/body-types/male-stocky.png' },
  { id: 'heavy',    label: 'Pesado',    maxBf: 99, src: '/body-types/male-heavy.png' },
]

const FEMALE_TYPES: BodyType[] = [
  { id: 'shredded', label: 'Definida',   maxBf: 14, src: '/body-types/female-shredded.png' },
  { id: 'lean',     label: 'Magra',      maxBf: 20, src: '/body-types/female-lean.png' },
  { id: 'athletic', label: 'Atlética',   maxBf: 25, src: '/body-types/female-athletic.png' },
  { id: 'average',  label: 'Média',      maxBf: 30, src: '/body-types/female-average.png' },
  { id: 'curvy',    label: 'Curvilínea', maxBf: 36, src: '/body-types/female-curvy.png' },
  { id: 'heavy',    label: 'Pesada',     maxBf: 99, src: '/body-types/female-heavy.png' },
]

function selectBodyType(bf: number, gender: string): BodyType {
  const types = gender === 'F' ? FEMALE_TYPES : MALE_TYPES
  return types.find(t => bf <= t.maxBf) || types[types.length - 1]
}

/* ─── Measurement labels ─── */

interface MeasurementPoint {
  id: string
  label: string
  singleField?: string
  leftField?: string
  rightField?: string
  /** Label position [left%, top%] relative to body container */
  lx: number
  ly: number
  /** Dot on body [left%, top%] */
  dx: number
  dy: number
  side: 'L' | 'R'
}

const POINTS: MeasurementPoint[] = [
  { id: 'chest',   label: 'Tórax',   singleField: 'chest_circ',                                    lx: 0,   ly: 24, dx: 42, dy: 25, side: 'L' },
  { id: 'arm_l',   label: 'Braço E', leftField: 'arm_circ_left',   singleField: 'arm_circ',        lx: 0,   ly: 32, dx: 26, dy: 32, side: 'L' },
  { id: 'hip',     label: 'Quadril', singleField: 'hip_circ',                                      lx: 0,   ly: 45, dx: 42, dy: 45, side: 'L' },
  { id: 'thigh_l', label: 'Coxa E',  leftField: 'thigh_circ_left', singleField: 'thigh_circ',      lx: 0,   ly: 58, dx: 38, dy: 58, side: 'L' },
  { id: 'calf_l',  label: 'Pant. E', leftField: 'calf_circ_left',  singleField: 'calf_circ',       lx: 0,   ly: 79, dx: 42, dy: 79, side: 'L' },
  { id: 'waist',   label: 'Cintura', singleField: 'waist_circ',                                    lx: 100, ly: 38, dx: 58, dy: 38, side: 'R' },
  { id: 'arm_r',   label: 'Braço D', rightField: 'arm_circ_right', singleField: 'arm_circ',        lx: 100, ly: 32, dx: 74, dy: 32, side: 'R' },
  { id: 'thigh_r', label: 'Coxa D',  rightField: 'thigh_circ_right', singleField: 'thigh_circ',    lx: 100, ly: 58, dx: 62, dy: 58, side: 'R' },
  { id: 'calf_r',  label: 'Pant. D', rightField: 'calf_circ_right',  singleField: 'calf_circ',     lx: 100, ly: 79, dx: 58, dy: 79, side: 'R' },
]

function resolveValue(data: Record<string, string | undefined>, m: MeasurementPoint): string {
  if (m.leftField)   { const v = parseFloat(data[m.leftField]  || '0'); if (v > 0) return v.toFixed(1) }
  if (m.rightField)  { const v = parseFloat(data[m.rightField] || '0'); if (v > 0) return v.toFixed(1) }
  if (m.singleField) { const v = parseFloat(data[m.singleField]|| '0'); if (v > 0) return v.toFixed(1) }
  return ''
}

/* ─── Component ─── */

interface Props {
  formData: AssessmentFormData
  bodyFatPercentage?: number
}

const BodyMeasurementMap = memo(function BodyMeasurementMap({ formData, bodyFatPercentage }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const isFemale = formData.gender === 'F'
  const data = formData as unknown as Record<string, string | undefined>
  const bf = bodyFatPercentage ?? 20

  const bodyType = useMemo(() => selectBodyType(bf, formData.gender), [bf, formData.gender])

  const points = useMemo(() =>
    POINTS.map((m) => ({ ...m, value: resolveValue(data, m) })).filter(p => p.value),
    [data],
  )

  if (points.length === 0) return null

  return (
    <div className="rounded-2xl relative overflow-hidden" style={{ background: '#000' }}>
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-600/12 to-transparent z-10" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 rounded-full bg-yellow-500/50" />
          <span className="text-[10px] font-medium text-neutral-600 uppercase tracking-[0.18em]">Mapa Corporal</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider"
            style={{
              background: 'rgba(234,179,8,0.08)',
              color: 'rgba(234,179,8,0.5)',
              border: '1px solid rgba(234,179,8,0.1)',
            }}
          >
            {bodyType.label}
          </span>
          <span className="text-[9px] text-neutral-700 uppercase tracking-[0.2em]">
            {isFemale ? 'F' : 'M'}
          </span>
        </div>
      </div>

      {/* Body container */}
      <div className="relative" style={{ aspectRatio: '1 / 1.3' }}>

        {/* Body image — large, blended */}
        <img
          src={bodyType.src}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute pointer-events-none select-none"
          style={{
            left: '12%',
            top: '0',
            width: '76%',
            height: '100%',
            objectFit: 'contain',
            mixBlendMode: 'lighten',
            opacity: 0.65,
          }}
          onError={(e) => {
            // Fallback to default body images
            const fb = isFemale ? '/body-types/female-athletic.png' : '/body-types/male-athletic.png'
            if (e.currentTarget.src !== fb) e.currentTarget.src = fb
          }}
        />

        {/* Warm ambient glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '25%', top: '12%', width: '50%', height: '50%',
            background: 'radial-gradient(ellipse at center, rgba(234,179,8,0.02) 0%, transparent 70%)',
          }}
        />

        {/* SVG lines + dots */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
          {points.map((p) => {
            const isActive = selected === p.id
            const anchorX = p.side === 'L' ? 16 : 84
            return (
              <g key={`svg-${p.id}`}>
                <line
                  x1={`${anchorX}%`} y1={`${p.ly}%`}
                  x2={`${p.dx}%`}    y2={`${p.dy}%`}
                  stroke={isActive ? 'rgba(234,179,8,0.3)' : 'rgba(255,255,255,0.035)'}
                  strokeWidth={isActive ? 0.8 : 0.3}
                />
                <circle
                  cx={`${p.dx}%`} cy={`${p.dy}%`}
                  r={isActive ? 3 : 1.5}
                  fill={isActive ? 'rgba(234,179,8,0.6)' : 'rgba(255,255,255,0.1)'}
                />
              </g>
            )
          })}
        </svg>

        {/* HTML labels */}
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
                  ? { left: '2%', textAlign: 'right' as const }
                  : { right: '2%', textAlign: 'left' as const }),
                top: `${p.ly}%`,
                transform: 'translateY(-50%)',
                width: '14%',
              }}
            >
              <div style={{
                fontSize: '7px',
                fontWeight: 500,
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                color: isActive ? 'rgba(234,179,8,0.6)' : 'rgba(130,130,130,0.3)',
                lineHeight: 1,
                marginBottom: '1px',
                whiteSpace: 'nowrap' as const,
              }}>
                {p.label}
              </div>
              <div className="tabular-nums" style={{
                fontSize: '13px',
                fontWeight: 600,
                color: isActive ? 'rgba(251,191,36,0.85)' : 'rgba(255,255,255,0.45)',
                lineHeight: 1.15,
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
