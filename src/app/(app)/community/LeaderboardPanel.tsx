'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { Trophy, Dumbbell, Flame, Loader2 } from 'lucide-react'

type RankingCategory = 'workouts' | 'volume' | 'streak'

interface RankEntry {
  rank: number
  userId: string
  displayName: string
  photoUrl: string | null
  role: string | null
  value: number
  unit: string
  isMe: boolean
}

interface Rankings {
  workouts: RankEntry[]
  volume: RankEntry[]
  streak: RankEntry[]
}

const categoryConfig: Record<RankingCategory, { label: string; icon: React.ReactNode; color: string }> = {
  workouts: { label: 'Treinos', icon: <Dumbbell size={13} />, color: '#22c55e' },
  volume: { label: 'Volume', icon: <Trophy size={13} />, color: '#f59e0b' },
  streak: { label: 'Streak', icon: <Flame size={13} />, color: '#ef4444' },
}

const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'] // gold, silver, bronze

export default function LeaderboardPanel({ userId }: { userId: string }) {
  const [rankings, setRankings] = useState<Rankings | null>(null)
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<RankingCategory>('workouts')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/social/leaderboard')
      const data = await res.json().catch(() => null)
      if (data?.ok) setRankings(data.rankings)
    } catch { }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center gap-3">
        <Loader2 size={28} className="text-yellow-500 animate-spin" />
        <div className="text-sm text-neutral-500">Calculando ranking…</div>
      </div>
    )
  }

  if (!rankings) {
    return (
      <div className="p-8 flex flex-col items-center gap-3 text-center">
        <Trophy size={28} className="text-neutral-600" />
        <div className="text-sm text-neutral-500">Siga amigos para ver o ranking.</div>
      </div>
    )
  }

  const currentEntries = rankings[category] || []
  const cfg = categoryConfig[category]

  return (
    <div>
      {/* Category Tabs */}
      <div className="px-4 pt-3 pb-2 flex gap-1">
        {(Object.keys(categoryConfig) as RankingCategory[]).map((cat) => {
          const c = categoryConfig[cat]
          const isActive = category === cat
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                isActive ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'
              }`}
              style={isActive ? { background: `${c.color}20`, border: `1px solid ${c.color}30` } : { background: 'transparent' }}
            >
              {c.icon}
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Ranking List */}
      {currentEntries.length === 0 ? (
        <div className="p-6 text-center">
          <div className="text-sm text-neutral-500">Nenhum dado esta semana.</div>
        </div>
      ) : (
        <div>
          {currentEntries.map((entry, i) => {
            const initials = entry.displayName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
            const isTopThree = entry.rank <= 3
            const medalColor = isTopThree ? medalColors[entry.rank - 1] : undefined

            return (
              <div
                key={entry.userId}
                className={`px-4 py-3 flex items-center gap-3 transition-colors ${
                  entry.isMe ? 'bg-yellow-500/[0.04]' : ''
                } ${i < currentEntries.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
              >
                {/* Rank */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black"
                  style={isTopThree ? {
                    background: `${medalColor}18`,
                    border: `1.5px solid ${medalColor}40`,
                    color: medalColor,
                  } : {
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: '#737373',
                  }}
                >
                  {isTopThree ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                </div>

                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                  style={{
                    background: entry.photoUrl ? 'transparent' : 'linear-gradient(135deg, #1a1a1a, #0a0a0a)',
                    boxShadow: entry.isMe ? '0 0 0 1.5px rgba(234,179,8,0.4)' : '0 0 0 1px rgba(255,255,255,0.06)',
                  }}
                >
                  {entry.photoUrl ? (
                    <Image src={entry.photoUrl} alt="" width={36} height={36} className="w-full h-full object-cover" unoptimized />
                  ) : (
                    <span className="font-black text-yellow-500/60 text-xs">{initials}</span>
                  )}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-black truncate ${entry.isMe ? 'text-yellow-500' : 'text-white'}`}>
                    {entry.displayName}
                    {entry.isMe && <span className="text-[10px] text-yellow-600 ml-1.5">(você)</span>}
                  </div>
                </div>

                {/* Value */}
                <div className="flex-shrink-0 text-right">
                  <div className="text-sm font-black" style={{ color: cfg.color }}>
                    {category === 'volume' ? Math.round(entry.value).toLocaleString('pt-BR') : entry.value}
                  </div>
                  <div className="text-[9px] text-neutral-600 uppercase tracking-wider">{entry.unit}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
