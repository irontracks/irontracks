'use client'

import React from 'react'
import type { MuscleId } from '@/utils/muscleMapConfig'

type MuscleState = {
  color?: string
  sets?: number
  ratio?: number
  label?: string
}

type Props = {
  view: 'front' | 'back'
  muscles: Record<string, MuscleState>
  onSelect?: (muscleId: MuscleId) => void
  selected?: MuscleId | null
}

const hit = (id: MuscleId, view: 'front' | 'back', muscles: Record<string, MuscleState>, selected?: MuscleId | null) => {
  const m = muscles?.[id] || {}
  const fill = String(m.color || (view === 'front' ? '#111827' : '#111827'))
  const stroke = selected === id ? '#f59e0b' : 'rgba(255,255,255,.10)'
  return { fill, stroke }
}

export default function BodyMapSvg({ view, muscles, onSelect, selected }: Props) {
  const common = {
    width: 260,
    height: 420,
    viewBox: '0 0 260 420',
  }

  return (
    <svg {...common} role="img" aria-label="Mapa muscular" className="w-full max-w-[280px] mx-auto select-none">
      <rect x="92" y="18" width="76" height="76" rx="38" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.08)" />
      <rect x="86" y="96" width="88" height="92" rx="38" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.08)" />
      <rect x="96" y="186" width="68" height="98" rx="28" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.08)" />
      <rect x="64" y="110" width="30" height="88" rx="15" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.08)" />
      <rect x="166" y="110" width="30" height="88" rx="15" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.08)" />
      <rect x="92" y="280" width="34" height="118" rx="16" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.08)" />
      <rect x="134" y="280" width="34" height="118" rx="16" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.08)" />

      {view === 'front' ? (
        <>
          <rect
            x="96"
            y="110"
            width="68"
            height="38"
            rx="16"
            {...hit('chest', view, muscles, selected)}
            onClick={() => onSelect?.('chest')}
            className="cursor-pointer"
          />
          <rect
            x="96"
            y="150"
            width="68"
            height="52"
            rx="18"
            {...hit('abs', view, muscles, selected)}
            onClick={() => onSelect?.('abs')}
            className="cursor-pointer"
          />
          <rect
            x="86"
            y="98"
            width="38"
            height="12"
            rx="12"
            {...hit('delts_front', view, muscles, selected)}
            onClick={() => onSelect?.('delts_front')}
            className="cursor-pointer"
          />
          <rect
            x="136"
            y="98"
            width="38"
            height="12"
            rx="12"
            {...hit('delts_front', view, muscles, selected)}
            onClick={() => onSelect?.('delts_front')}
            className="cursor-pointer"
          />
          <rect
            x="52"
            y="100"
            width="26"
            height="24"
            rx="12"
            {...hit('delts_side', view, muscles, selected)}
            onClick={() => onSelect?.('delts_side')}
            className="cursor-pointer"
          />
          <rect
            x="182"
            y="100"
            width="26"
            height="24"
            rx="12"
            {...hit('delts_side', view, muscles, selected)}
            onClick={() => onSelect?.('delts_side')}
            className="cursor-pointer"
          />
          <rect
            x="64"
            y="126"
            width="30"
            height="40"
            rx="14"
            {...hit('biceps', view, muscles, selected)}
            onClick={() => onSelect?.('biceps')}
            className="cursor-pointer"
          />
          <rect
            x="166"
            y="126"
            width="30"
            height="40"
            rx="14"
            {...hit('biceps', view, muscles, selected)}
            onClick={() => onSelect?.('biceps')}
            className="cursor-pointer"
          />
          <rect
            x="64"
            y="168"
            width="30"
            height="30"
            rx="14"
            {...hit('triceps', view, muscles, selected)}
            onClick={() => onSelect?.('triceps')}
            className="cursor-pointer"
          />
          <rect
            x="166"
            y="168"
            width="30"
            height="30"
            rx="14"
            {...hit('triceps', view, muscles, selected)}
            onClick={() => onSelect?.('triceps')}
            className="cursor-pointer"
          />
          <rect
            x="92"
            y="240"
            width="76"
            height="70"
            rx="26"
            {...hit('quads', view, muscles, selected)}
            onClick={() => onSelect?.('quads')}
            className="cursor-pointer"
          />
          <rect
            x="92"
            y="334"
            width="34"
            height="64"
            rx="14"
            {...hit('calves', view, muscles, selected)}
            onClick={() => onSelect?.('calves')}
            className="cursor-pointer"
          />
          <rect
            x="134"
            y="334"
            width="34"
            height="64"
            rx="14"
            {...hit('calves', view, muscles, selected)}
            onClick={() => onSelect?.('calves')}
            className="cursor-pointer"
          />
        </>
      ) : (
        <>
          <rect
            x="96"
            y="110"
            width="68"
            height="34"
            rx="16"
            {...hit('upper_back', view, muscles, selected)}
            onClick={() => onSelect?.('upper_back')}
            className="cursor-pointer"
          />
          <rect
            x="96"
            y="146"
            width="68"
            height="38"
            rx="16"
            {...hit('lats', view, muscles, selected)}
            onClick={() => onSelect?.('lats')}
            className="cursor-pointer"
          />
          <rect
            x="92"
            y="186"
            width="76"
            height="34"
            rx="16"
            {...hit('spinal_erectors', view, muscles, selected)}
            onClick={() => onSelect?.('spinal_erectors')}
            className="cursor-pointer"
          />
          <rect
            x="86"
            y="98"
            width="38"
            height="26"
            rx="12"
            {...hit('delts_rear', view, muscles, selected)}
            onClick={() => onSelect?.('delts_rear')}
            className="cursor-pointer"
          />
          <rect
            x="136"
            y="98"
            width="38"
            height="26"
            rx="12"
            {...hit('delts_rear', view, muscles, selected)}
            onClick={() => onSelect?.('delts_rear')}
            className="cursor-pointer"
          />
          <rect
            x="92"
            y="226"
            width="76"
            height="44"
            rx="18"
            {...hit('glutes', view, muscles, selected)}
            onClick={() => onSelect?.('glutes')}
            className="cursor-pointer"
          />
          <rect
            x="92"
            y="270"
            width="76"
            height="56"
            rx="22"
            {...hit('hamstrings', view, muscles, selected)}
            onClick={() => onSelect?.('hamstrings')}
            className="cursor-pointer"
          />
          <rect
            x="92"
            y="334"
            width="34"
            height="64"
            rx="14"
            {...hit('calves', view, muscles, selected)}
            onClick={() => onSelect?.('calves')}
            className="cursor-pointer"
          />
          <rect
            x="134"
            y="334"
            width="34"
            height="64"
            rx="14"
            {...hit('calves', view, muscles, selected)}
            onClick={() => onSelect?.('calves')}
            className="cursor-pointer"
          />
        </>
      )}
    </svg>
  )
}
