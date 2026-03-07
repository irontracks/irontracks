'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { Crown, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { getIronRankLeaderboard } from '@/actions/workout-actions'
import BadgesInline, { type Badge } from './BadgesInline'

type Props = {
  badges: Badge[]
  currentStreak: number
  totalVolumeKg: number
  currentUserId?: string
  showIronRank?: boolean
  showBadges?: boolean
}

export default function BadgesGallery({ badges, currentStreak, totalVolumeKg, currentUserId, showIronRank = true, showBadges = true }: Props) {
  const safeBadges = Array.isArray(badges) ? badges : []

  // Calculate Level based on Volume (Gamification)
  // Level 1: 0-5k, Level 2: 5k-20k, Level 3: 20k-50k, etc.
  const getLevel = (vol: number) => {
    if (vol < 5000) return 1
    if (vol < 20000) return 2
    if (vol < 50000) return 3
    if (vol < 100000) return 4
    if (vol < 250000) return 5
    if (vol < 500000) return 6
    if (vol < 1000000) return 7
    return 8 // Legend
  }

  const level = getLevel(totalVolumeKg)
  const nextLevelVol = [5000, 20000, 50000, 100000, 250000, 500000, 1000000, 10000000][level - 1] || 10000000
  const prevLevelVol = [0, 5000, 20000, 50000, 100000, 250000, 500000, 1000000][level - 1] || 0
  
  const progressPercent = Math.min(100, Math.max(0, ((totalVolumeKg - prevLevelVol) / (nextLevelVol - prevLevelVol)) * 100))

  const [rankOpen, setRankOpen] = useState(false)
  const [rankLoading, setRankLoading] = useState(false)
  const [rankError, setRankError] = useState('')
  const [rankReloadKey, setRankReloadKey] = useState(0)
  const [leaderboard, setLeaderboard] = useState<
    { userId: string; displayName: string | null; photoUrl: string | null; role: string | null; totalVolumeKg: number }[]
  >([])

  const safeCurrentUserId = typeof currentUserId === 'string' ? currentUserId : ''

  useEffect(() => {
    if (showIronRank) return
    setRankOpen(false)
  }, [showIronRank])

  useEffect(() => {
    if (!rankOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setRankOpen(false)
    }
    try {
      window.addEventListener('keydown', onKeyDown)
    } catch {}
    return () => {
      try {
        window.removeEventListener('keydown', onKeyDown)
      } catch {}
    }
  }, [rankOpen])

  useEffect(() => {
    if (!rankOpen) return
    let cancelled = false
    const load = async () => {
      setRankLoading(true)
      setRankError('')
      try {
        const res = await getIronRankLeaderboard(100)
        if (cancelled) return
        if (!res?.ok) {
          const raw = String(res?.error || 'Falha ao carregar ranking')
          const lower = raw.toLowerCase()
          const msg = (() => {
            if (lower.includes('does not exist') || lower.includes('function') || lower.includes('iron_rank_leaderboard') || lower.includes('schema cache')) {
              return 'Ranking indisponível: migrations do Supabase pendentes para o Iron Rank.'
            }
            if (lower.includes('invalid input syntax for type numeric')) {
              return 'Ranking indisponível: alguns treinos antigos têm formato inválido (aplique a migration de parsing numérico).'
            }
            if (lower.includes('not_authenticated') || lower.includes('unauthorized')) {
              return 'Ranking indisponível: faça login novamente.'
            }
            return raw
          })()
          setRankError(msg)
          setLeaderboard([])
          return
        }
        const rows = Array.isArray(res?.data) ? res.data : []
        setLeaderboard(
          rows
            .map((r: any) => ({
              userId: String(r?.userId ?? r?.user_id ?? '').trim(),
              displayName: r?.displayName != null ? String(r.displayName) : r?.display_name != null ? String(r.display_name) : null,
              photoUrl: r?.photoUrl != null ? String(r.photoUrl) : r?.photo_url != null ? String(r.photo_url) : null,
              role: r?.role != null ? String(r.role) : null,
              totalVolumeKg: Number(r?.totalVolumeKg ?? r?.total_volume_kg ?? 0) || 0,
            }))
            .filter((r: any) => !!r.userId)
        )
      } catch (e) {
        if (cancelled) return
        const raw = String(e?.message ?? e)
        const lower = raw.toLowerCase()
        const msg = (() => {
          if (lower.includes('does not exist') || lower.includes('function') || lower.includes('iron_rank_leaderboard') || lower.includes('schema cache')) {
            return 'Ranking indisponível: migrations do Supabase pendentes para o Iron Rank.'
          }
          if (lower.includes('invalid input syntax for type numeric')) {
            return 'Ranking indisponível: alguns treinos antigos têm formato inválido (aplique a migration de parsing numérico).'
          }
          if (lower.includes('not_authenticated') || lower.includes('unauthorized')) {
            return 'Ranking indisponível: faça login novamente.'
          }
          return raw
        })()
        setRankError(msg)
        setLeaderboard([])
      } finally {
        if (!cancelled) setRankLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [rankOpen, rankReloadKey])

  const roleLabel = (roleRaw: string | null) => {
    const role = String(roleRaw || '').toLowerCase()
    if (role === 'admin') return { label: 'Admin', cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' }
    if (role === 'teacher') return { label: 'Coach', cls: 'bg-purple-500/10 text-purple-300 border-purple-500/30' }
    return { label: 'Aluno', cls: 'bg-neutral-800 text-neutral-300 border-neutral-700' }
  }

  if (!showIronRank && !showBadges) return null

  return (
    <div className="space-y-3 mb-5">
      {/* Level Card */}
      {showIronRank ? (
        <button
          type="button"
          onClick={() => setRankOpen(true)}
          className="w-full text-left cursor-pointer bg-neutral-900 border border-neutral-800 rounded-xl p-3 relative overflow-hidden hover:border-yellow-500/30 hover:bg-neutral-900/80 transition-colors active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
          aria-label="Abrir ranking Iron Rank"
        >
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Crown size={48} />
          </div>
          
          <div className="flex items-center gap-3 mb-2 relative z-10">
            <div className="bg-yellow-500 text-black font-black text-xs px-2 py-1 rounded">
              NÍVEL {level}
            </div>
            <span className="text-neutral-400 text-xs font-bold uppercase tracking-wider">
              Iron Rank
            </span>
            {currentStreak > 0 && (
              <span className="ml-auto text-[11px] text-neutral-400 font-bold">
                <span className="text-orange-400">{currentStreak}</span> dia(s)
              </span>
            )}
          </div>

          <div className="relative z-10">
            <div className="flex justify-between text-[11px] text-neutral-500 mb-1">
              <span>{totalVolumeKg.toLocaleString('pt-BR')}kg levantados</span>
              <span>{nextLevelVol.toLocaleString('pt-BR')}kg</span>
            </div>
            <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400"
              />
            </div>
          </div>
        </button>
      ) : null}

      {/* Badges Grid */}
      {showBadges ? (
        <div>
          <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 px-1">
            Conquistas ({safeBadges.length})
          </h3>
          <BadgesInline badges={safeBadges} />
        </div>
      ) : null}

      {showIronRank && rankOpen && (
        <div className="fixed inset-0 z-[1250] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe">
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Iron Rank</div>
                <div className="text-white font-black text-lg truncate">Ranking Global</div>
              </div>
              <button
                type="button"
                onClick={() => setRankOpen(false)}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto custom-scrollbar">
              {rankLoading ? (
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 text-sm text-neutral-400">
                  Carregando ranking…
                </div>
              ) : rankError ? (
                <div className="bg-neutral-800 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
                  {rankError}
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 text-sm text-neutral-400">
                  <div className="font-bold text-neutral-200">Ainda não há dados suficientes para o ranking.</div>
                  <div className="mt-2 text-neutral-400">
                    O Iron Rank soma apenas séries concluídas com peso e reps preenchidos.
                  </div>
                  <div className="mt-2 text-neutral-500">
                    Seu volume atual: <span className="text-yellow-500 font-black">{Math.round(totalVolumeKg).toLocaleString('pt-BR')}kg</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRankReloadKey((v) => v + 1)}
                    className="mt-3 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800"
                  >
                    Recarregar
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((row, idx) => {
                    const isMe = safeCurrentUserId && row.userId === safeCurrentUserId
                    const role = roleLabel(row.role)
                    const name = row.displayName || `Usuário ${row.userId.slice(0, 6)}`
                    return (
                      <div
                        key={row.userId}
                        className={`flex items-center gap-3 bg-neutral-800 border rounded-xl p-3 ${
                          isMe ? 'border-yellow-500/40' : 'border-neutral-700'
                        }`}
                      >
                        <div className="w-8 text-center font-black text-neutral-400 tabular-nums">#{idx + 1}</div>
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-neutral-900 border border-neutral-700 flex items-center justify-center shrink-0">
                          {row.photoUrl ? (
                            <Image src={row.photoUrl} alt="Perfil" width={40} height={40} className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-yellow-500 font-black">
                              {String(name).slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-black text-white truncate">{name}</div>
                          <div className="mt-1">
                            <span className={`inline-flex items-center px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${role.cls}`}>
                              {role.label}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[11px] text-neutral-500 font-bold uppercase tracking-widest">Volume</div>
                          <div className="text-sm font-black text-yellow-500 tabular-nums">
                            {Math.round(row.totalVolumeKg).toLocaleString('pt-BR')}kg
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
