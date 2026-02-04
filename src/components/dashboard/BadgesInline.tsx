'use client'

import React from 'react'
import { Award, Flame, Star } from 'lucide-react'
import { motion } from 'framer-motion'

export type Badge = {
  id: string
  label: string
  kind: string
}

const DumbbellIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-blue-400"
  >
    <path d="M6.5 6.5h11" />
    <path d="M6.5 17.5h11" />
    <path d="M6.5 6.5v11" />
    <path d="M17.5 6.5v11" />
    <path d="M2 12h20" />
  </svg>
)

const getBadgeIcon = (id: string, kind: string) => {
  if (kind === 'streak') return <Flame className="text-orange-500" size={18} />
  if (kind === 'volume') return <DumbbellIcon />
  if (id === 'first_workout') return <Star className="text-yellow-400" size={18} />
  return <Award className="text-yellow-500" size={18} />
}

export default function BadgesInline({ badges }: { badges: Badge[] }) {
  const safeBadges = Array.isArray(badges) ? badges : []
  if (!safeBadges.length) {
    return (
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-3 text-xs text-neutral-400 font-bold">
        Sem conquistas ainda. Complete treinos para desbloquear badges.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {safeBadges.map((badge) => (
        <motion.div
          key={badge.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-neutral-900/80 border border-neutral-800 px-2 py-1.5 rounded-xl flex items-center gap-2"
        >
          <div className="bg-neutral-900 p-1.5 rounded-full border border-neutral-800">
            {getBadgeIcon(badge.id, badge.kind)}
          </div>
          <span className="text-[11px] font-bold text-neutral-200 leading-tight">{badge.label}</span>
        </motion.div>
      ))}
    </div>
  )
}

