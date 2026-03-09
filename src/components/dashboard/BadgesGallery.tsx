'use client'

import React, { memo, useEffect, useState } from 'react'
import Image from 'next/image'
import { Crown, X, ChevronRight } from 'lucide-react'
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

  // Level based on total volume lifted
  const getLevel = (vol: number) => {
    if (vol < 5000) return 1
    if (vol < 20000) return 2
    if (vol < 50000) return 3
    if (vol < 100000) return 4
    if (vol < 250000) return 5
    if (vol < 500000) return 6
    if (vol < 1000000) return 7
    return 8
  }

  const level = getLevel(totalVolumeKg)
  const nextLevelVol = [5000, 20000, 50000, 100000, 250000, 500000, 1000000, 10000000][level - 1] || 10000000
  const prevLevelVol = [0, 5000, 20000, 50000, 100000, 250000, 500000, 1000000][level - 1] || 0
  const progressPercent = Math.min(100, Math.max(0, ((totalVolumeKg - prevLevelVol) / (nextLevelVol - prevLevelVol)) * 100))

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
    try { window.addEventListener('keydown', onKeyDown) } catch { }
    return () => { try { window.removeEventListener('keydown', onKeyDown) } catch { } }
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
            if (lower.includes('does not exist') || lower.includes('function') || lower.includes('iron_rank_leaderboard') || lower.includes('schema cache'))
              return 'Ranking indisponível: migrations do Supabase pendentes para o Iron Rank.'
            if (lower.includes('invalid input syntax for type numeric'))
              return 'Ranking indisponível: alguns treinos antigos têm formato inválido.'
            if (lower.includes('not_authenticated') || lower.includes('unauthorized'))
              return 'Ranking indisponível: faça login novamente.'
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
          if (lower.includes('does not exist') || lower.includes('function') || lower.includes('iron_rank_leaderboard') || lower.includes('schema cache'))
            return 'Ranking indisponível: migrations do Supabase pendentes para o Iron Rank.'
          if (lower.includes('invalid input syntax for type numeric'))
            return 'Ranking indisponível: alguns treinos antigos têm formato inválido.'
          if (lower.includes('not_authenticated') || lower.includes('unauthorized'))
            return 'Ranking indisponível: faça login novamente.'
          return raw
        })()
        setRankError(msg)
        setLeaderboard([])
      } finally {
        if (!cancelled) setRankLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [rankOpen, rankReloadKey])

  const roleLabel = (roleRaw: string | null) => {
    const role = String(roleRaw || '').toLowerCase()
    if (role === 'admin') return { label: 'Admin', cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' }
    if (role === 'teacher') return { label: 'Coach', cls: 'bg-purple-500/10 text-purple-300 border-purple-500/30' }
    return { label: 'Aluno', cls: 'bg-neutral-800 text-neutral-400 border-neutral-700' }
  }

  if (!showIronRank && !showBadges) return null

  return (
    <div className="space-y-3 mb-5">

      {/* ─── Iron Rank Card ────────────────────────────────────────────── */}
      {showIronRank ? (
        <motion.button
          type="button"
          onClick={() => setRankOpen(true)}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="w-full text-left cursor-pointer relative overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-yellow-500/30 group"
          style={{
            background: 'linear-gradient(135deg, rgba(234,179,8,0.08) 0%, rgba(12,12,12,0.92) 50%, rgba(234,179,8,0.04) 100%)',
            border: '1px solid rgba(234,179,8,0.22)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(234,179,8,0.1)',
            backdropFilter: 'blur(12px)',
          }}
          aria-label="Abrir ranking Iron Rank"
        >
          {/* Shimmer accent line top */}
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(234,179,8,0.6) 40%, rgba(251,191,36,1) 50%, rgba(234,179,8,0.6) 60%, transparent 100%)',
          }} />

          {/* Glow orb top-right */}
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none" style={{
            background: 'radial-gradient(circle, rgba(234,179,8,0.10) 0%, transparent 70%)',
          }} />

          {/* Watermark crown */}
          <div className="absolute -bottom-3 -right-3 opacity-[0.04] pointer-events-none">
            <Crown size={90} className="text-yellow-400" />
          </div>

          <div className="relative z-10 p-4">
            {/* Row 1: Badge + Title + Streak */}
            <div className="flex items-center gap-3">
              {/* Level badge */}
              <div className="shrink-0 relative">
                <div className="absolute inset-0 rounded-xl blur-sm opacity-60" style={{ background: 'rgba(245,158,11,0.5)' }} />
                <div className="relative px-2.5 py-1.5 rounded-xl font-black text-[11px] leading-none text-black"
                  style={{ background: 'linear-gradient(135deg, #facc15 0%, #f59e0b 60%, #b45309 100%)' }}>
                  NIV {level}
                </div>
              </div>

              {/* Title */}
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-black uppercase tracking-[0.22em] leading-none mb-0.5 text-yellow-500">Iron Rank</div>
                <div className="text-white font-black text-[15px] leading-tight truncate">{levelName}</div>
              </div>

              {/* Streak + Arrow */}
              <div className="shrink-0 flex items-center gap-2">
                {currentStreak > 0 && (
                  <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5"
                    style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.22)' }}>
                    <span className="text-sm leading-none">🔥</span>
                    <span className="text-orange-400 font-black text-xs leading-none">{currentStreak}d</span>
                  </div>
                )}
                <ChevronRight size={15} className="text-neutral-600 group-hover:text-yellow-500 transition-colors" />
              </div>
            </div>

            {/* Row 2: Progress */}
            <div className="mt-3.5">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[11px] text-neutral-400 font-semibold">
                  {totalVolumeKg.toLocaleString('pt-BR')}kg levantados
                </span>
                <span className="text-[12px] font-black tabular-nums text-yellow-400">
                  {Math.round(progressPercent)}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 1.4, ease: 'easeOut' }}
                  className="h-full rounded-full relative"
                  style={{ background: 'linear-gradient(90deg, #92400e 0%, #d97706 40%, #fbbf24 80%, #fde68a 100%)' }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2.5s_ease-in-out_infinite] rounded-full" />
                </motion.div>
              </div>

              <div className="flex justify-between items-center mt-1.5">
                <span className="text-[10px] text-neutral-600">Toque para ver o ranking</span>
                <span className="text-[10px] text-neutral-600">próx. {nextLevelVol.toLocaleString('pt-BR')}kg</span>
              </div>
            </div>
          </div>
        </motion.button>
      ) : null}

      {/* Badges grid */}
      {showBadges ? (
        <div>
          <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 px-1">
            Conquistas ({safeBadges.length})
          </h3>
          <BadgesInline badges={safeBadges} />
        </div>
      ) : null}

      {/* ─── Leaderboard modal ─────────────────────────────────────────── */}
      {showIronRank && rankOpen && (
        <div className="fixed inset-0 z-[1250] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 pt-safe">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-lg overflow-hidden rounded-2xl"
            style={{
              background: 'linear-gradient(160deg, rgba(20,20,20,0.98) 0%, rgba(12,12,12,0.98) 100%)',
              border: '1px solid rgba(234,179,8,0.2)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.12)',
            }}
          >
            {/* Modal header */}
            <div className="relative p-4 flex items-center justify-between gap-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {/* Shimmer top */}
              <div className="absolute top-0 left-0 right-0 h-[2px]" style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(234,179,8,0.6) 40%, rgba(251,191,36,1) 50%, rgba(234,179,8,0.6) 60%, transparent 100%)',
              }} />
              <div className="min-w-0">
                <div className="text-[9px] font-black uppercase tracking-[0.22em] text-yellow-500">Iron Rank</div>
                <div className="text-white font-black text-lg truncate">Ranking Global</div>
              </div>
              <button
                type="button"
                onClick={() => setRankOpen(false)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                aria-label="Fechar"
              >
                <X size={17} />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-4 space-y-2.5 max-h-[72vh] overflow-y-auto">
              {rankLoading ? (
                <div className="p-4 rounded-xl text-sm text-neutral-400"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  Carregando ranking…
                </div>
              ) : rankError ? (
                <div className="p-4 rounded-xl text-sm text-red-300"
                  style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {rankError}
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="p-4 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="font-bold text-neutral-200 text-sm">Ainda não há dados suficientes.</div>
                  <div className="mt-1.5 text-neutral-500 text-xs">O Iron Rank soma séries concluídas com peso e reps preenchidos.</div>
                  <div className="mt-1.5 text-neutral-500 text-xs">
                    Seu volume: <span className="text-yellow-400 font-black">{Math.round(totalVolumeKg).toLocaleString('pt-BR')}kg</span>
                  </div>
                  <button type="button" onClick={() => setRankReloadKey(v => v + 1)}
                    className="mt-3 px-3 py-2 rounded-xl text-xs font-black text-neutral-200 hover:text-white transition-colors"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
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
                        className="flex items-center gap-3 rounded-xl p-3 transition-colors"
                        style={{
                          background: isMe
                            ? 'linear-gradient(135deg, rgba(234,179,8,0.1), rgba(0,0,0,0.3))'
                            : idx < 3 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                          border: isMe
                            ? '1px solid rgba(234,179,8,0.35)'
                            : idx < 3 ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(255,255,255,0.04)',
                        }}
                      >
                        <div className="w-7 text-center font-black tabular-nums shrink-0">
                          {medal ? (
                            <span className="text-base leading-none">{medal}</span>
                          ) : (
                            <span className="text-neutral-600 text-xs">#{idx + 1}</span>
                          )}
                        </div>
                        <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          {row.photoUrl ? (
                            <Image src={row.photoUrl} alt="Perfil" width={36} height={36} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-yellow-400 font-black text-sm">
                              {String(name).slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={['text-sm font-black truncate', isMe ? 'text-yellow-400' : 'text-white'].join(' ')}>
                            {name}{isMe ? ' (você)' : ''}
                          </div>
                          <span className={`mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${role.cls}`}>
                            {role.label}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[9px] text-neutral-600 font-bold uppercase tracking-widest">Volume</div>
                          <div className="text-sm font-black text-yellow-400 tabular-nums">
                            {Math.round(row.totalVolumeKg).toLocaleString('pt-BR')}kg
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
});

export default BadgesGallery;
