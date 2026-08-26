'use client'

import React, { memo, useMemo } from 'react'
import { MUSCLE_BY_ID, type MuscleId } from '@/utils/muscleMapConfig'
import {
  FRONT_OVERLAYS,
  BACK_OVERLAYS,
  OVERLAY_FOLDER,
  dedupOverlays,
  ratioToOpacity,
} from '@/lib/muscleMap/overlays'

/**
 * Hitbox SVG acessível — substitui <rect onClick> "inacessível" por
 * elemento focável (tabIndex), com role=button, aria-label e
 * suporte a teclado (Enter/Space). WCAG 2.1.1 + 4.1.2 + 2.4.7.
 */
function HitboxRect({
  x, y, width, height, rx,
  muscleId, sets, onSelect,
}: {
  x: number; y: number; width: number; height: number; rx: number;
  muscleId: MuscleId; sets?: number; onSelect?: (id: MuscleId) => void;
}) {
  const label = MUSCLE_BY_ID[muscleId]?.label || muscleId
  const handleKey = (e: React.KeyboardEvent<SVGRectElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(muscleId)
    }
  }
  return (
    <rect
      x={x} y={y} width={width} height={height} rx={rx}
      fill="transparent"
      role="button"
      tabIndex={onSelect ? 0 : -1}
      aria-label={typeof sets === 'number' ? `${label}, ${sets} séries` : label}
      style={{ pointerEvents: 'all', cursor: onSelect ? 'pointer' : 'default', outline: 'none' }}
      onClick={() => onSelect?.(muscleId)}
      onKeyDown={handleKey}
    />
  )
}

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
  calibrationMode?: boolean
  /** Determines which body image set to use. Defaults to 'male' for backward compatibility. */
  gender?: 'male' | 'female' | 'not_informed'
}

// Listas de overlay, dedup e curva de opacidade vivem em `lib/muscleMap/overlays`
// — o manequim do Story desenha o MESMO corpo em canvas e precisa da mesma
// tabela. Duas cópias divergiriam em silêncio.

const BodyMapSvg = memo(function BodyMapSvg({ view, muscles, onSelect, selected, gender }: Props) {
  const isFemale = gender === 'female'
  const overlays = view === 'front' ? FRONT_OVERLAYS : BACK_OVERLAYS
  const baseSrc = view === 'front'
    ? (isFemale ? '/body-front-female.png' : '/body-front.png')
    : (isFemale ? '/body-back-female.png' : '/body-back.png')

  // Mask image: white silhouette of the body — overlays only show WITHIN the body shape
  const maskSrc = view === 'front'
    ? (isFemale ? '/body-front-female-mask.png' : '/body-front-mask.png')
    : (isFemale ? '/body-back-female-mask.png' : '/body-back-mask.png')

  const layers = useMemo(
    () => dedupOverlays(overlays, (id) => Number(muscles[id]?.ratio || 0)),
    [overlays, muscles],
  )

  return (
    <div
      className="relative w-full max-w-[280px] mx-auto select-none overflow-hidden rounded-2xl bg-black aspect-square"
    >

      {/* Base body (dark mannequin) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${baseSrc})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* Muscle overlay layers — masked by body silhouette so they only show within the body shape */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          WebkitMaskImage: `url(${maskSrc})`,
          maskImage: `url(${maskSrc})`,
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }}
      >
        {layers.map(({ file, muscleIds, maxRatio }) => {
          const isSelected = muscleIds.some((id) => id === selected)
          const opacity = ratioToOpacity(maxRatio, isSelected)
          if (opacity <= 0) return null

          return (
            <div
              key={`${OVERLAY_FOLDER}/${file}`}
              className="absolute inset-0 pointer-events-none transition-opacity duration-500"
              style={{
                backgroundImage: `url(${OVERLAY_FOLDER}/${file})`,
                backgroundSize: 'contain',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                opacity,
                filter: isSelected ? 'saturate(1.4) brightness(1.15)' : 'none',
              }}
            />
          )
        })}
      </div>

      {/* Invisible click areas (SVG hitboxes for each muscle group) — keyboard-accessible */}
      <svg
        viewBox="0 0 200 450"
        className="absolute inset-0 w-full h-full z-20"
        style={{ pointerEvents: 'none' }}
        role="group"
        aria-label={view === 'front' ? 'Mapa muscular frontal — selecione um músculo' : 'Mapa muscular posterior — selecione um músculo'}
      >
        <g transform="translate(50, 55) scale(0.52)">
          {view === 'front' ? (
            <>
              <HitboxRect x={64} y={66} width={72} height={74} rx={8} muscleId="chest" sets={muscles.chest?.sets} onSelect={onSelect} />
              <HitboxRect x={30} y={56} width={36} height={50} rx={8} muscleId="delts_front" sets={muscles.delts_front?.sets} onSelect={onSelect} />
              <HitboxRect x={134} y={56} width={36} height={50} rx={8} muscleId="delts_front" sets={muscles.delts_front?.sets} onSelect={onSelect} />
              <HitboxRect x={14} y={114} width={34} height={64} rx={8} muscleId="biceps" sets={muscles.biceps?.sets} onSelect={onSelect} />
              <HitboxRect x={152} y={114} width={34} height={64} rx={8} muscleId="biceps" sets={muscles.biceps?.sets} onSelect={onSelect} />
              <HitboxRect x={82} y={132} width={36} height={66} rx={6} muscleId="abs" sets={muscles.abs?.sets} onSelect={onSelect} />
              <HitboxRect x={52} y={210} width={42} height={100} rx={8} muscleId="quads" sets={muscles.quads?.sets} onSelect={onSelect} />
              <HitboxRect x={106} y={210} width={42} height={100} rx={8} muscleId="quads" sets={muscles.quads?.sets} onSelect={onSelect} />
              <HitboxRect x={48} y={312} width={40} height={90} rx={8} muscleId="calves" sets={muscles.calves?.sets} onSelect={onSelect} />
              <HitboxRect x={112} y={312} width={40} height={90} rx={8} muscleId="calves" sets={muscles.calves?.sets} onSelect={onSelect} />
            </>
          ) : (
            <>
              <HitboxRect x={64} y={52} width={72} height={72} rx={8} muscleId="upper_back" sets={muscles.upper_back?.sets} onSelect={onSelect} />
              <HitboxRect x={30} y={56} width={36} height={44} rx={8} muscleId="delts_rear" sets={muscles.delts_rear?.sets} onSelect={onSelect} />
              <HitboxRect x={134} y={56} width={36} height={44} rx={8} muscleId="delts_rear" sets={muscles.delts_rear?.sets} onSelect={onSelect} />
              <HitboxRect x={42} y={110} width={46} height={100} rx={8} muscleId="lats" sets={muscles.lats?.sets} onSelect={onSelect} />
              <HitboxRect x={112} y={110} width={46} height={100} rx={8} muscleId="lats" sets={muscles.lats?.sets} onSelect={onSelect} />
              <HitboxRect x={14} y={100} width={34} height={74} rx={8} muscleId="triceps" sets={muscles.triceps?.sets} onSelect={onSelect} />
              <HitboxRect x={152} y={100} width={34} height={74} rx={8} muscleId="triceps" sets={muscles.triceps?.sets} onSelect={onSelect} />
              <HitboxRect x={86} y={120} width={28} height={96} rx={6} muscleId="spinal_erectors" sets={muscles.spinal_erectors?.sets} onSelect={onSelect} />
              <HitboxRect x={52} y={210} width={96} height={60} rx={8} muscleId="glutes" sets={muscles.glutes?.sets} onSelect={onSelect} />
              <HitboxRect x={52} y={258} width={42} height={70} rx={8} muscleId="hamstrings" sets={muscles.hamstrings?.sets} onSelect={onSelect} />
              <HitboxRect x={106} y={258} width={42} height={70} rx={8} muscleId="hamstrings" sets={muscles.hamstrings?.sets} onSelect={onSelect} />
              <HitboxRect x={48} y={318} width={40} height={90} rx={8} muscleId="calves" sets={muscles.calves?.sets} onSelect={onSelect} />
              <HitboxRect x={112} y={318} width={40} height={90} rx={8} muscleId="calves" sets={muscles.calves?.sets} onSelect={onSelect} />
            </>
          )}
        </g>
      </svg>

      {/* Inner shadow frame */}
      <div className="absolute inset-0 pointer-events-none rounded-2xl shadow-[inset_0_0_30px_rgba(0,0,0,0.95)]" />
    </div>
  )
})

export default BodyMapSvg
