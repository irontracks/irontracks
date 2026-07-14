'use client'

import React from 'react'
import NextImage from 'next/image'

export type Badge = {
  id: string
  label: string
  kind: string
}

// Medalhas de volume com TIERS distintos (bronze → diamante) — antes todas
// usavam a mesma /badge-volume.png e ficavam idênticas.
const VOLUME_BADGE_IMAGES: Record<string, { src: string; glow: string }> = {
  vol_5k: { src: '/badge-vol-5k.png', glow: 'rgba(180,83,9,0.38)' },     // bronze
  vol_20k: { src: '/badge-vol-20k.png', glow: 'rgba(120,120,130,0.35)' }, // aço
  vol_50k: { src: '/badge-vol-50k.png', glow: 'rgba(203,213,225,0.38)' }, // prata
  vol_100k: { src: '/badge-vol-100k.png', glow: 'rgba(234,179,8,0.4)' },  // ouro
  vol_500k: { src: '/badge-vol-500k.png', glow: 'rgba(226,232,240,0.42)' }, // platina
  vol_1m: { src: '/badge-vol-1m.png', glow: 'rgba(96,165,250,0.45)' },    // safira
  vol_2m: { src: '/badge-vol-2m.png', glow: 'rgba(248,113,113,0.45)' },   // rubi
  vol_5m: { src: '/badge-vol-5m.png', glow: 'rgba(191,219,254,0.55)' },   // diamante
}

const getBadgeImage = (id: string, kind: string): { src: string; glow: string } => {
  if (kind === 'streak') return { src: '/badge-streak.png', glow: 'rgba(249,115,22,0.35)' }
  if (VOLUME_BADGE_IMAGES[id]) return VOLUME_BADGE_IMAGES[id]
  if (kind === 'volume') return { src: '/badge-volume.png', glow: 'rgba(148,163,184,0.35)' } // fallback legado
  if (id === 'first_workout') return { src: '/badge-first.png', glow: 'rgba(180,83,9,0.35)' }
  return { src: '/badge-trophy.png', glow: 'rgba(234,179,8,0.35)' }
}

export default function BadgesInline({ badges }: { badges: Badge[] }) {
  const safeBadges = Array.isArray(badges) ? badges : []
  if (!safeBadges.length) {
    return (
      <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* WCAG 1.4.3 AA — neutral-500 → 400 sobre dark */}
        <p className="text-xs text-neutral-400 font-bold">Complete treinos para desbloquear conquistas.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-3">
      {safeBadges.map((badge, i) => {
        const { src, glow } = getBadgeImage(badge.id, badge.kind)
        return (
          <div
            key={badge.id}
            className="flex flex-col items-center gap-1.5 cursor-default select-none animate-in fade-in zoom-in-75 duration-300"
            style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'both' }}
          >
            {/* Medal image */}
            <div
              className="relative w-14 h-14 rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: `0 0 16px ${glow}, 0 4px 12px rgba(0,0,0,0.5)`,
              }}
            >
              <NextImage
                src={src}
                alt={badge.label}
                fill
                sizes="56px"
                className="object-cover"
              />
            </div>
            {/* Label */}
            <span className="text-[10px] font-bold text-neutral-400 text-center leading-tight max-w-[60px]">
              {badge.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
