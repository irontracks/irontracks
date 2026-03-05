'use client'

import React, { memo, useEffect, useState } from 'react'
import Image from 'next/image'
import { Crown, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { getIronRankLeaderboard } from '@/actions/workout-actions'
import BadgesInline, { type Badge } from './BadgesInline'
import { getErrorMessage } from '@/utils/errorMessage'

type Props = {
  badges: Badge[]
  currentStreak: number
  totalVolumeKg: number
  currentUserId?: string
  showIronRank?: boolean
  showBadges?: boolean
}

const BadgesGallery = memo(function BadgesGallery({ badges, currentStreak, totalVolumeKg, currentUserId, showIronRank = true, showBadges = true }: Props) {
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

  // Epic level names
  const levelNames = [
    'Iniciante das Ferros',
    'Soldado de Aço',
    'Guerreiro de Ferro',
    'Cavaleiro Blindado',
    'Titã da Força',
    'Senhor das Barras',
    'Mestre Supremo',
    'Lenda Imortal',
  ]
  const levelName = levelNames[(level - 1) % levelNames.length]

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
    } catch { }
    return () => {
      try {
        window.removeEventListener('keydown', onKeyDown)
      } catch { }
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
            .map((r: Record<string, unknown>) => ({
              userId: String(r?.userId ?? r?.user_id ?? '').trim(),
              displayName: r?.displayName != null ? String(r.displayName) : r?.display_name != null ? String(r.display_name) : null,
              photoUrl: r?.photoUrl != null ? String(r.photoUrl) : r?.photo_url != null ? String(r.photo_url) : null,
              role: r?.role != null ? String(r.role) : null,
              totalVolumeKg: Number(r?.totalVolumeKg ?? r?.total_volume_kg ?? 0) || 0,
            }))
            .filter((r: Record<string, unknown>) => !!r.userId)
        )
      } catch (e: unknown) {
        if (cancelled) return
        const raw = String(getErrorMessage(e) ?? e)
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
      {/* ─── Iron Rank Card ─────────────────────────────────── */}
      {showIronRank ? (
        <button
          type="button"
          onClick={() => setRankOpen(true)}
          className="w-full text-left cursor-pointer bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 border border-neutral-700/60 rounded-2xl p-4 relative overflow-hidden hover:border-yellow-500/50 transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-yellow-500/30 shadow-lg group"
          aria-label="Abrir ranking Iron Rank"
        >
          {/* Ambient glow for high levels */}
          {level >= 5 && (
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/8 via-amber-500/3 to-transparent pointer-events-none" />
          )}
          {/* Decorative crown watermark */}
          <div className="absolute -top-2 -right-2 opacity-[0.06] pointer-events-none">
            <Crown size={80} className={level >= 5 ? 'text-yellow-400' : 'text-neutral-400'} />
          </div>

          {/* ── Row 1: Level + Title + Streak ─────────────────── */}
          <div className="flex items-center gap-2.5 relative z-10">
            {/* NIV badge */}
            <div className="shrink-0 bg-gradient-to-br from-yellow-400 to-amber-600 text-black font-black text-[11px] px-2.5 py-1.5 rounded-xl shadow-md shadow-yellow-500/25 leading-none">
              NIV {level}
            </div>

            {/* Title block */}
            <div className="min-w-0 flex-1">
              <div className="text-yellow-500 text-[9px] font-black uppercase tracking-[0.2em] leading-none mb-0.5">Iron Rank</div>
              <div className="text-white font-black text-[15px] leading-tight truncate">{levelName}</div>
            </div>

            {/* Streak badge */}
            {currentStreak > 0 && (
              <div className="shrink-0 flex items-center gap-1.5 bg-orange-500/12 border border-orange-500/25 rounded-xl px-2.5 py-1.5">
                <span className="text-sm leading-none">🔥</span>
                <span className="text-orange-400 font-black text-xs leading-none">{currentStreak}d</span>
              </div>
            )}
          </div>

          {/* ── Row 2: Progress section ────────────────────────── */}
          <div className="relative z-10 mt-3">
            {/* Labels above bar */}
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[11px] text-neutral-400 font-semibold">
                {totalVolumeKg.toLocaleString('pt-BR')}kg levantados
              </span>
              <span className="text-[12px] text-yellow-400 font-black tabular-nums">
                {Math.round(progressPercent)}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2.5 bg-neutral-800/80 rounded-full overflow-hidden ring-1 ring-neutral-700/40">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                className="h-full rounded-full relative"
                style={{ background: 'linear-gradient(90deg, #b45309 0%, #f59e0b 50%, #fde68a 100%)' }}
              >
                {/* Shimmer */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmer_2.5s_ease-in-out_infinite] rounded-full" />
                {/* Glow cap at end */}
                <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-r from-transparent to-yellow-200/40 rounded-full" />
              </motion.div>
            </div>

            {/* Next level label */}
            <div className="flex justify-between items-center mt-1.5">
              <span className="text-[10px] text-neutral-600">Toque para ver o ranking</span>
              <span className="text-[10px] text-neutral-600">
                próx. {nextLevelVol.toLocaleString('pt-BR')}kg
              </span>
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
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                    return (
                      <div
                        key={row.userId}
                        className={[
                          'flex items-center gap-3 border rounded-xl p-3 transition-colors',
                          isMe
                            ? 'bg-yellow-500/10 border-yellow-500/40 shadow-sm shadow-yellow-500/10'
                            : idx < 3
                              ? 'bg-neutral-800/80 border-neutral-700'
                              : 'bg-neutral-900/50 border-neutral-800',
                        ].join(' ')}
                      >
                        <div className="w-8 text-center font-black tabular-nums">
                          {medal ? (
                            <span className="text-lg leading-none">{medal}</span>
                          ) : (
                            <span className="text-neutral-500 text-sm">#{idx + 1}</span>
                          )}
                        </div>
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
                          <div className={['text-sm font-black truncate', isMe ? 'text-yellow-400' : 'text-white'].join(' ')}>{name}{isMe ? ' (você)' : ''}</div>
                          <div className="mt-0.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-widest ${role.cls}`}>
                              {role.label}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Volume</div>
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
});

export default BadgesGallery;
