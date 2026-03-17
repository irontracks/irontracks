'use client'

import React from 'react'
import Image from 'next/image'
import { Dumbbell, Trophy, Flame, Target, Heart, Wifi } from 'lucide-react'

export interface FeedItem {
  id: string
  type: string
  title: string
  message: string
  senderId: string
  senderName: string | null
  senderPhoto: string | null
  senderRole: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}sem`
}

const typeConfig: Record<string, { icon: React.ReactNode; color: string; bg: string; emoji: string }> = {
  workout_start: {
    icon: <Dumbbell size={14} />,
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.12)',
    emoji: '🏋️',
  },
  workout_finish: {
    icon: <Dumbbell size={14} />,
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    emoji: '✅',
  },
  friend_pr: {
    icon: <Trophy size={14} />,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    emoji: '🏆',
  },
  friend_streak: {
    icon: <Flame size={14} />,
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    emoji: '🔥',
  },
  friend_goal: {
    icon: <Target size={14} />,
    color: '#a855f7',
    bg: 'rgba(168,85,247,0.12)',
    emoji: '🎯',
  },
  story_like: {
    icon: <Heart size={14} />,
    color: '#ec4899',
    bg: 'rgba(236,72,153,0.12)',
    emoji: '❤️',
  },
  friend_online: {
    icon: <Wifi size={14} />,
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.10)',
    emoji: '👋',
  },
}

const defaultConfig = {
  icon: <Dumbbell size={14} />,
  color: '#737373',
  bg: 'rgba(255,255,255,0.04)',
  emoji: '📝',
}

export default function FeedCard({
  item,
  onProfileClick,
}: {
  item: FeedItem
  onProfileClick?: (userId: string) => void
}) {
  const cfg = typeConfig[item.type] || defaultConfig
  const name = item.senderName || 'Usuário'
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div
      className="px-4 py-3.5 flex items-start gap-3 transition-colors hover:bg-white/[0.02] border-b border-white/[0.04] last:border-0"
      style={{ cursor: onProfileClick ? 'pointer' : undefined }}
    >
      {/* Avatar */}
      <button
        type="button"
        onClick={() => onProfileClick?.(item.senderId)}
        className="flex-shrink-0 relative"
        style={{ width: 42, height: 42 }}
      >
        <div
          className="rounded-full overflow-hidden flex items-center justify-center w-full h-full"
          style={{
            background: item.senderPhoto ? 'transparent' : 'linear-gradient(135deg, #1a1a1a, #0a0a0a)',
            boxShadow: `0 0 0 1.5px ${cfg.color}40, 0 4px 12px rgba(0,0,0,0.4)`,
          }}
        >
          {item.senderPhoto ? (
            <Image src={item.senderPhoto} alt="" width={42} height={42} className="w-full h-full object-cover" unoptimized />
          ) : (
            <span className="font-black text-yellow-500/80" style={{ fontSize: 15 }}>{initials}</span>
          )}
        </div>
        {/* Type badge */}
        <div
          className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
          style={{ background: cfg.bg, border: `1.5px solid #0a0a0a`, color: cfg.color }}
        >
          {cfg.emoji}
        </div>
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0" onClick={() => onProfileClick?.(item.senderId)}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-black text-white truncate">{name}</span>
          <span className="text-[10px] text-neutral-600 flex-shrink-0">{timeAgo(item.createdAt)}</span>
        </div>
        <p className="text-[13px] text-neutral-400 leading-snug line-clamp-2">
          {item.message}
        </p>

        {/* PR detail chips */}
        {item.type === 'friend_pr' && (() => {
          const meta = item.metadata as Record<string, unknown> | null
          const prs = Array.isArray(meta?.prs) ? meta.prs as Array<{ exercise: string; label: string; value: string }> : null
          if (!prs?.length) return null
          return (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {prs.slice(0, 3).map((pr, i) => (
                <span
                  key={i}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}
                >
                  {String(pr.exercise)}: {String(pr.value)}
                </span>
              ))}
            </div>
          )
        })()}

        {/* Streak badge */}
        {item.type === 'friend_streak' && (() => {
          const streak = String((item.metadata as Record<string, unknown> | null)?.streak ?? '')
          if (!streak) return null
          return (
            <div className="mt-2">
              <span
                className="text-[10px] font-black px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                🔥 {streak} dias seguidos
              </span>
            </div>
          )
        })()}

        {/* Goal badge */}
        {item.type === 'friend_goal' && (() => {
          const total = String((item.metadata as Record<string, unknown> | null)?.total_workouts ?? '')
          if (!total) return null
          return (
            <div className="mt-2">
              <span
                className="text-[10px] font-black px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.2)' }}
              >
                🎯 {total} treinos
              </span>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
