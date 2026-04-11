'use client'

import React from 'react'
import NextImage from 'next/image'

export type Badge = {
  id: string
  label: string
  kind: string
}

const getBadgeImage = (id: string, kind: string): { src: string; glow: string } => {
  if (kind === 'streak') return { src: '/badge-streak.png', glow: 'rgba(249,115,22,0.35)' }
  if (kind === 'volume') return { src: '/badge-volume.png', glow: 'rgba(148,163,184,0.35)' }
  if (id === 'first_workout') return { src: '/badge-first.png', glow: 'rgba(180,83,9,0.35)' }
  return { src: '/badge-trophy.png', glow: 'rgba(234,179,8,0.35)' }
}

export default function BadgesInline({ badges }: { badges: Badge[] }) {
  const safeBadges = Array.isArray(badges) ? badges : []
  if (!safeBadges.length) {
    return (
      <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-xs text-neutral-500 font-bold">Complete treinos para desbloquear conquistas.</p>
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
                unoptimized
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
