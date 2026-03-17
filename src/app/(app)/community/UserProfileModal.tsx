'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { X, Dumbbell, Flame, Calendar, Trophy, Loader2, Swords } from 'lucide-react'
import ChallengesPanel from './ChallengesPanel'

interface ProfileData {
  profile: { id: string; displayName: string | null; photoUrl: string | null; role: string | null }
  stats: { totalWorkouts: number; streak: number; weeklyWorkouts: number }
  recentPRs: Array<{ message: string; prs: unknown; createdAt: string }>
}

const formatRole = (raw: unknown): string => {
  const r = String(raw || '').trim().toLowerCase()
  if (r === 'teacher') return 'PROFESSOR'
  if (r === 'admin') return 'ADMIN'
  return 'ALUNO'
}

export default function UserProfileModal({
  userId,
  onClose,
}: {
  userId: string
  onClose: () => void
}) {
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showChallenge, setShowChallenge] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/social/profile/${encodeURIComponent(userId)}`)
      const json = await res.json().catch(() => null)
      if (json?.ok) setData(json)
      else setError(json?.error === 'not_following' ? 'Você precisa seguir este usuário para ver o perfil.' : String(json?.error || 'Falha ao carregar'))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [userId])

  useEffect(() => { load() }, [load])

  const p = data?.profile
  const s = data?.stats
  const name = p?.displayName || 'Usuário'
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-end sm:items-center justify-center p-4 pt-safe"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl max-h-[85vh] overflow-y-auto"
        style={{ background: 'rgba(12,12,12,0.98)', border: '1px solid rgba(234,179,8,0.2)', boxShadow: '0 0 60px rgba(234,179,8,0.08)' }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-500">Perfil</div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="p-10 flex flex-col items-center gap-3">
            <Loader2 size={28} className="text-yellow-500 animate-spin" />
            <div className="text-sm text-neutral-500">Carregando perfil…</div>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="text-sm text-red-400">{error}</div>
          </div>
        ) : data ? (
          <div className="px-5 py-5 space-y-5">
            {/* Avatar + Name */}
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                style={{
                  background: p?.photoUrl ? 'transparent' : 'linear-gradient(135deg, #1a1a1a, #0a0a0a)',
                  boxShadow: '0 0 0 2px rgba(234,179,8,0.3), 0 8px 24px rgba(0,0,0,0.5)',
                }}
              >
                {p?.photoUrl ? (
                  <Image src={p.photoUrl} alt="" width={64} height={64} className="w-full h-full object-cover" unoptimized />
                ) : (
                  <span className="font-black text-yellow-500/80 text-xl">{initials}</span>
                )}
              </div>
              <div>
                <div className="text-lg font-black text-white">{name}</div>
                <div
                  className="text-[10px] font-black uppercase tracking-[0.18em] px-2 py-0.5 rounded-full inline-block mt-1"
                  style={{
                    background: p?.role === 'teacher' ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                    color: p?.role === 'teacher' ? '#f59e0b' : '#737373',
                    border: p?.role === 'teacher' ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  {formatRole(p?.role)}
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: <Dumbbell size={16} className="text-yellow-500" />, value: s?.totalWorkouts || 0, label: 'Treinos' },
                { icon: <Flame size={16} className="text-red-400" />, value: s?.streak || 0, label: 'Streak' },
                { icon: <Calendar size={16} className="text-blue-400" />, value: s?.weeklyWorkouts || 0, label: 'Esta semana' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-3 rounded-xl text-center"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex justify-center mb-1">{stat.icon}</div>
                  <div className="text-lg font-black text-white">{stat.value}</div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Recent PRs */}
            {data.recentPRs.length > 0 && (
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-2 flex items-center gap-1.5">
                  <Trophy size={12} />
                  PRs Recentes
                </div>
                <div className="space-y-2">
                  {data.recentPRs.slice(0, 5).map((pr, i) => {
                    const prs = Array.isArray(pr.prs) ? pr.prs as Array<{ exercise: string; value: string }> : []
                    return (
                      <div
                        key={i}
                        className="px-3 py-2 rounded-xl"
                        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}
                      >
                        <div className="flex flex-wrap gap-1.5">
                          {prs.slice(0, 3).map((p, j) => (
                            <span
                              key={j}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}
                            >
                              🏆 {String(p?.exercise || '')}: {String(p?.value || '')}
                            </span>
                          ))}
                        </div>
                        <div className="text-[10px] text-neutral-600 mt-1">
                          {new Date(pr.createdAt).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Challenge button + panel */}
            <button
              type="button"
              onClick={() => setShowChallenge(!showChallenge)}
              className="w-full py-3 rounded-xl text-xs font-black text-black active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 2px 12px rgba(234,179,8,0.3)' }}
            >
              <Swords size={14} />
              {showChallenge ? 'Fechar Desafio' : '⚡ Desafiar'}
            </button>

            {showChallenge && (
              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <ChallengesPanel
                  userId={userId}
                  targetUserId={userId}
                  targetName={name}
                  onClose={() => setShowChallenge(false)}
                />
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
