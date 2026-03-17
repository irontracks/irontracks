'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { Swords, Loader2, Check, X, Dumbbell, Flame } from 'lucide-react'

interface Challenge {
  id: string
  type: string
  title: string
  message: string
  senderId: string
  recipientId: string
  isCreator: boolean
  challengeType: string
  targetValue: number
  deadline: string | null
  status: string
  creatorProgress: number
  opponentProgress: number
  createdAt: string
  metadata?: Record<string, unknown> | null
  senderProfile: { displayName: string; photoUrl: string | null } | null
  recipientProfile: { displayName: string; photoUrl: string | null } | null
}

const typeLabels: Record<string, { label: string; unit: string; icon: React.ReactNode }> = {
  workouts_count: { label: 'Treinos', unit: 'treinos', icon: <Dumbbell size={14} /> },
  streak: { label: 'Streak', unit: 'dias', icon: <Flame size={14} /> },
}

const daysLeft = (deadline: string | null): string => {
  if (!deadline) return ''
  const diff = new Date(deadline).getTime() - Date.now()
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'Expirado'
  return `${days}d restantes`
}

export default function ChallengesPanel({
  userId,
  targetUserId,
  targetName,
  onClose,
}: {
  userId: string
  targetUserId?: string
  targetName?: string
  onClose?: () => void
}) {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(!!targetUserId)
  const [busy, setBusy] = useState(false)

  // Create form
  const [challengeType, setChallengeType] = useState<'workouts_count' | 'streak'>('workouts_count')
  const [targetValue, setTargetValue] = useState(5)
  const [deadlineDays, setDeadlineDays] = useState(7)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/social/challenges')
      const data = await res.json().catch(() => null)
      if (data?.ok) setChallenges(Array.isArray(data.challenges) ? data.challenges : [])
    } catch { }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const createChallenge = async () => {
    if (!targetUserId || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/social/challenges', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          opponentId: targetUserId,
          type: challengeType,
          targetValue,
          deadlineDays,
        }),
      })
      const data = await res.json().catch(() => null)
      if (data?.ok) {
        setCreating(false)
        load()
      }
    } catch { }
    finally { setBusy(false) }
  }

  const respondChallenge = async (challengeId: string, action: 'accept' | 'decline') => {
    if (busy) return
    setBusy(true)
    try {
      await fetch('/api/social/challenges', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, challengeId }),
      })
      load()
    } catch { }
    finally { setBusy(false) }
  }

  const pending = challenges.filter((c) => c.type === 'challenge_created' && !c.isCreator && c.status !== 'declined')
  const active = challenges.filter((c) => c.type === 'challenge_accepted' || (c.type === 'challenge_created' && c.isCreator))

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2">
          <Swords size={16} className="text-yellow-500" />
          <span className="text-xs font-black uppercase tracking-widest text-yellow-500">Desafios</span>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-white">
            <X size={16} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-8 flex flex-col items-center gap-3">
          <Loader2 size={24} className="text-yellow-500 animate-spin" />
          <div className="text-xs text-neutral-500">Carregando desafios…</div>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-4">
          {/* Create Challenge Form */}
          {creating && targetUserId && (
            <div className="p-3 rounded-xl space-y-3" style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.15)' }}>
              <div className="text-xs font-black text-white">
                Desafiar {targetName || 'amigo'}
              </div>

              <div className="flex gap-2">
                {(['workouts_count', 'streak'] as const).map((t) => {
                  const cfg = typeLabels[t]
                  const isActive = challengeType === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setChallengeType(t)}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${
                        isActive ? 'text-black' : 'text-neutral-500'
                      }`}
                      style={isActive ? {
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      } : {
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      {cfg.icon} {cfg.label}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Meta</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={targetValue}
                    onChange={(e) => setTargetValue(Number(e.target.value) || 1)}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-black/40 border border-neutral-700 text-sm text-white font-bold"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Prazo (dias)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={deadlineDays}
                    onChange={(e) => setDeadlineDays(Number(e.target.value) || 7)}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-black/40 border border-neutral-700 text-sm text-white font-bold"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-neutral-400 transition-all"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={createChallenge}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black text-black transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 2px 12px rgba(234,179,8,0.3)' }}
                >
                  {busy ? 'Enviando…' : '⚡ Desafiar'}
                </button>
              </div>
            </div>
          )}

          {/* Pending Challenges */}
          {pending.length > 0 && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-yellow-500 mb-2">Pendentes</div>
              {pending.map((c) => {
                const meta = c as Challenge
                const opponentName = meta.senderProfile?.displayName || 'Amigo'
                const cfg = typeLabels[meta.challengeType] || typeLabels.workouts_count
                return (
                  <div key={c.id} className="p-3 rounded-xl mb-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      {meta.senderProfile?.photoUrl ? (
                        <Image src={meta.senderProfile.photoUrl} alt="" width={28} height={28} className="w-7 h-7 rounded-full object-cover" unoptimized />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-black text-yellow-500">
                          {opponentName[0]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-black text-white truncate">{opponentName}</div>
                        <div className="text-[10px] text-neutral-500">{meta.targetValue} {cfg.unit} • {daysLeft(meta.deadline as string)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const meta2 = c.metadata && typeof c.metadata === 'object' ? c.metadata as Record<string, unknown> : {}
                          respondChallenge(String(meta2.challengeId || c.id), 'accept')
                        }}
                        disabled={busy}
                        className="flex-1 py-2 rounded-xl text-xs font-black text-black active:scale-[0.98] disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                      >
                        <Check size={12} className="inline mr-1" /> Aceitar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const meta2 = c.metadata && typeof c.metadata === 'object' ? c.metadata as Record<string, unknown> : {}
                          respondChallenge(String(meta2.challengeId || c.id), 'decline')
                        }}
                        disabled={busy}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-neutral-400 disabled:opacity-50"
                        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        <X size={12} className="inline mr-1" /> Recusar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Active Challenges */}
          {active.length > 0 && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-green-400 mb-2">Ativos</div>
              {active.map((c) => {
                const meta = c as Challenge
                const opponentName = meta.isCreator
                  ? meta.recipientProfile?.displayName || 'Oponente'
                  : meta.senderProfile?.displayName || 'Desafiante'
                const cfg = typeLabels[meta.challengeType] || typeLabels.workouts_count
                const progress = meta.isCreator ? meta.creatorProgress : meta.opponentProgress
                const pct = meta.targetValue > 0 ? Math.min(100, Math.round((progress / meta.targetValue) * 100)) : 0

                return (
                  <div key={c.id} className="p-3 rounded-xl mb-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {cfg.icon}
                        <span className="text-xs font-black text-white">{meta.targetValue} {cfg.unit}</span>
                      </div>
                      <span className="text-[10px] text-neutral-500">{daysLeft(meta.deadline as string)}</span>
                    </div>
                    <div className="text-[10px] text-neutral-400 mb-2">vs {opponentName}</div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: 'linear-gradient(90deg, #f59e0b, #22c55e)',
                        }}
                      />
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-1">{progress}/{meta.targetValue} ({pct}%)</div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Empty state */}
          {!creating && pending.length === 0 && active.length === 0 && (
            <div className="p-6 text-center">
              <Swords size={24} className="text-neutral-600 mx-auto mb-2" />
              <div className="text-xs text-neutral-500">Nenhum desafio ativo.</div>
              <div className="text-[10px] text-neutral-600 mt-1">Desafie amigos pelo perfil deles!</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
