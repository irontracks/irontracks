'use client'

import React, { memo, useEffect, useState } from 'react'
import Image from 'next/image'
import { Crown, X, ChevronRight, Trophy, TrendingUp, ChevronDown, Zap, Star } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { getIronRankLeaderboard, getLatestWorkoutPrs } from '@/actions/workout-actions'
import BadgesInline, { type Badge } from './BadgesInline'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

type PrData = {
    exercise: string
    weight: number
    reps: number
    volume: number
    improved?: { weight?: boolean; reps?: boolean; volume?: boolean }
}

type Props = {
    badges: Badge[]
    currentStreak: number
    totalVolumeKg: number
    currentUserId?: string
    showIronRank?: boolean
    showBadges?: boolean
    showRecords?: boolean
    reloadKey?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLevel(vol: number) {
    if (vol < 5000) return 1; if (vol < 20000) return 2; if (vol < 50000) return 3
    if (vol < 100000) return 4; if (vol < 250000) return 5; if (vol < 500000) return 6
    if (vol < 1000000) return 7; return 8
}

const LEVEL_NAMES = [
    'Iniciante das Ferros', 'Soldado de Aço', 'Guerreiro de Ferro', 'Cavaleiro Blindado',
    'Titã da Força', 'Senhor das Barras', 'Mestre Supremo', 'Lenda Imortal',
]

const LEVEL_THRESHOLDS = [5000, 20000, 50000, 100000, 250000, 500000, 1000000, 10000000]
const LEVEL_PREV = [0, 5000, 20000, 50000, 100000, 250000, 500000, 1000000]

function countImprovements(pr: PrData) {
    return [pr.improved?.weight, pr.improved?.reps, pr.improved?.volume].filter(Boolean).length
}

function getTier(pr: PrData) {
    const n = countImprovements(pr)
    if (n === 3) return { label: 'TRIPLE PR!', color: '#f59e0b', accent: 'rgba(245,158,11,0.16)' }
    if (n === 2) return { label: 'DOUBLE PR', color: '#eab308', accent: 'rgba(234,179,8,0.12)' }
    return { label: 'NOVO PR', color: '#ca8a04', accent: 'rgba(202,138,4,0.09)' }
}

function fmt(n: number, d = 2) {
    return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: d })
}

// ─── Component ────────────────────────────────────────────────────────────────

const IronRankCard = memo(function IronRankCard({
    badges, currentStreak, totalVolumeKg, currentUserId,
    showIronRank = true, showBadges = true, showRecords = true, reloadKey,
}: Props) {

    const safeBadges = Array.isArray(badges) ? badges : []
    const safeUserId = typeof currentUserId === 'string' ? currentUserId : ''

    // Iron Rank
    const level = getLevel(totalVolumeKg)
    const nextVol = LEVEL_THRESHOLDS[level - 1] || 10000000
    const prevVol = LEVEL_PREV[level - 1] || 0
    const progress = Math.min(100, Math.max(0, ((totalVolumeKg - prevVol) / (nextVol - prevVol)) * 100))
    const levelName = LEVEL_NAMES[(level - 1) % LEVEL_NAMES.length]

    // Rank modal
    const [rankOpen, setRankOpen] = useState(false)
    const [rankLoading, setRankLoading] = useState(false)
    const [rankError, setRankError] = useState('')
    const [reloadRank, setReloadRank] = useState(0)
    const [leaderboard, setLeaderboard] = useState<
        { userId: string; displayName: string | null; photoUrl: string | null; role: string | null; totalVolumeKg: number }[]
    >([])

    // PRs
    const [prs, setPrs] = useState<PrData[]>([])
    const [prsTitle, setPrsTitle] = useState('')
    const [prsDate, setPrsDate] = useState('')
    const [prsLoading, setPrsLoading] = useState(true)
    const [prsExpanded, setPrsExpanded] = useState(false)
    const rankFocusTrapRef = useFocusTrap(rankOpen, () => setRankOpen(false))

    // ── Load PRs ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!showRecords || !currentUserId) { setPrsLoading(false); return }
        let cancelled = false
        setPrsLoading(true)
            ; (async () => {
                try {
                    const res = await getLatestWorkoutPrs()
                    if (cancelled) return
                    const wo = res?.workout && typeof res.workout === 'object' ? res.workout as Record<string, unknown> : null
                    setPrsDate(wo?.date ? String(wo.date) : '')
                    setPrsTitle(wo?.title ? String(wo.title) : '')
                    setPrs(res?.ok && Array.isArray(res?.prs) ? res.prs : [])
                } catch (e) { logError('error', e) }
                finally { if (!cancelled) setPrsLoading(false) }
            })()
        return () => { cancelled = true }
    }, [currentUserId, reloadKey, showRecords])

    // ── Load Leaderboard ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!rankOpen) return
        let cancelled = false
        setRankLoading(true); setRankError('')
            ; (async () => {
                try {
                    const res = await getIronRankLeaderboard(100)
                    if (cancelled) return
                    if (!res?.ok) { setRankError(friendlyRankError(String(res?.error || ''))); setLeaderboard([]); return }
                    const rows = Array.isArray(res?.data) ? res.data : []
                    setLeaderboard(rows
                        .map((r: Record<string, unknown>) => ({
                            userId: String(r?.userId ?? r?.user_id ?? '').trim(),
                            displayName: r?.displayName != null ? String(r.displayName) : r?.display_name != null ? String(r.display_name) : null,
                            photoUrl: r?.photoUrl != null ? String(r.photoUrl) : r?.photo_url != null ? String(r.photo_url) : null,
                            role: r?.role != null ? String(r.role) : null,
                            totalVolumeKg: Number(r?.totalVolumeKg ?? r?.total_volume_kg ?? 0) || 0,
                        }))
                        .filter((r: Record<string, unknown>) => !!r.userId))
                } catch (e) {
                    if (!cancelled) { setRankError(friendlyRankError(String(getErrorMessage(e) ?? e))); setLeaderboard([]) }
                } finally { if (!cancelled) setRankLoading(false) }
            })()
        return () => { cancelled = true }
    }, [rankOpen, reloadRank])

    useEffect(() => {
        if (!showIronRank) setRankOpen(false)
    }, [showIronRank])

    useEffect(() => {
        if (!rankOpen) return
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setRankOpen(false) } }
        try { window.addEventListener('keydown', h) } catch { }
        return () => { try { window.removeEventListener('keydown', h) } catch { } }
    }, [rankOpen])

    // ── Derived ────────────────────────────────────────────────────────────────
    const totalImproved = prs.filter(pr => countImprovements(pr) > 0).length
    const bestPr = prs.length > 0 ? [...prs].sort((a, b) => countImprovements(b) - countImprovements(a))[0] : null
    const bestTier = bestPr ? getTier(bestPr) : null
    const withinWeek = (() => {
        if (!prsDate) return false
        const d = new Date(prsDate)
        return !Number.isNaN(d.getTime()) && (Date.now() - d.getTime()) / 36e5 < 168
    })()

    // Neither section to show
    if (!showIronRank && !showBadges && !showRecords) return null

    const hasContent = showIronRank || (showRecords && !prsLoading)

    return (
        <>
            {hasContent && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="relative overflow-hidden rounded-2xl mb-4"
                    style={{
                        background: 'linear-gradient(135deg, rgba(234,179,8,0.08) 0%, rgba(12,12,12,0.94) 55%, rgba(234,179,8,0.04) 100%)',
                        border: '1px solid rgba(234,179,8,0.22)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(234,179,8,0.1)',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    {/* Shimmer accent line */}
                    <div className="absolute top-0 left-0 right-0 h-[2px]" style={{
                        background: 'linear-gradient(90deg, transparent 0%, rgba(234,179,8,0.6) 40%, rgba(251,191,36,1) 50%, rgba(234,179,8,0.6) 60%, transparent 100%)',
                    }} />
                    {/* Glow orb */}
                    <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full pointer-events-none" style={{
                        background: 'radial-gradient(circle, rgba(234,179,8,0.09) 0%, transparent 70%)',
                    }} />
                    {/* Watermark */}
                    <div className="absolute -bottom-4 -right-4 opacity-[0.035] pointer-events-none">
                        <Crown size={100} className="text-yellow-400" />
                    </div>

                    {/* ── Iron Rank section ─────────────────────────────────────────── */}
                    {showIronRank && (
                        <button
                            type="button"
                            onClick={() => setRankOpen(true)}
                            className="w-full text-left relative z-10 p-3 group focus:outline-none"
                            aria-label="Abrir ranking Iron Rank"
                        >
                            <div className="flex items-center gap-2.5">
                                {/* Level badge */}
                                <div className="shrink-0 relative">
                                    <div className="absolute inset-0 rounded-lg blur-sm opacity-40" style={{ background: 'rgba(245,158,11,0.5)' }} />
                                    <div className="relative px-2 py-1 rounded-lg font-black text-[10px] leading-none text-black"
                                        style={{ background: 'linear-gradient(135deg, #facc15 0%, #f59e0b 60%, #b45309 100%)' }}>
                                        NIV {level}
                                    </div>
                                </div>
                                {/* Title */}
                                <div className="min-w-0 flex-1">
                                    <div className="text-[8px] font-black uppercase tracking-[0.22em] text-yellow-500 leading-none mb-0.5">Iron Rank</div>
                                    <div className="text-white font-black text-[13px] leading-tight truncate">{levelName}</div>
                                </div>
                                {/* Streak + arrow */}
                                <div className="shrink-0 flex items-center gap-1.5">
                                    {currentStreak > 0 && (
                                        <div className="flex items-center gap-1 rounded-lg px-1.5 py-1"
                                            style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)' }}>
                                            <span className="text-xs leading-none">🔥</span>
                                            <span className="text-orange-400 font-black text-[10px] leading-none">{currentStreak}d</span>
                                        </div>
                                    )}
                                    <ChevronRight size={13} className="text-neutral-600 group-hover:text-yellow-500 transition-colors" />
                                </div>
                            </div>

                            {/* Progress */}
                            <div className="mt-2">
                                <div className="flex items-baseline justify-between mb-1">
                                    <span className="text-[10px] text-neutral-500 font-semibold">{totalVolumeKg.toLocaleString('pt-BR')}kg levantados</span>
                                    <span className="text-[10px] font-black tabular-nums text-yellow-400">{Math.round(progress)}%</span>
                                </div>
                                <div className="h-1.5 rounded-full overflow-hidden"
                                    style={{ background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)' }}>
                                    <motion.div
                                        initial={{ width: 0 }} animate={{ width: `${progress}%` }}
                                        transition={{ duration: 1.4, ease: 'easeOut' }}
                                        className="h-full rounded-full relative"
                                        style={{ background: 'linear-gradient(90deg, #92400e 0%, #d97706 40%, #fbbf24 80%, #fde68a 100%)' }}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2.5s_ease-in-out_infinite] rounded-full" />
                                    </motion.div>
                                </div>
                                <div className="flex justify-between mt-1">
                                    <span className="text-[9px] text-neutral-700">Toque para ver o ranking</span>
                                    <span className="text-[9px] text-neutral-700">próx. {nextVol.toLocaleString('pt-BR')}kg</span>
                                </div>
                            </div>
                        </button>
                    )}

                    {/* Divider between sections (when both visible) */}
                    {showIronRank && showRecords && !prsLoading && (
                        <div className="mx-4 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.15), transparent)' }} />
                    )}

                    {/* ── Records section ────────────────────────────────────────────── */}
                    {showRecords && !prsLoading && (
                        <div className="relative z-10">
                            {/* Records header */}
                            <div
                                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer"
                                role="button" tabIndex={0}
                                onClick={() => setPrsExpanded(v => !v)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPrsExpanded(v => !v) } }}
                            >
                                {/* Icon */}
                                <div className="relative shrink-0">
                                    <div className="absolute inset-0 rounded-lg opacity-35" style={{ background: 'rgba(234,179,8,0.3)', filter: 'blur(3px)' }} />
                                    <div className="relative w-8 h-8 rounded-lg flex items-center justify-center"
                                        style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.16), rgba(234,179,8,0.04))', border: '1px solid rgba(234,179,8,0.25)' }}>
                                        <Trophy size={13} className="text-yellow-400" />
                                    </div>
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[8px] font-black uppercase tracking-[0.22em] text-yellow-500">Novos Recordes</span>
                                        {prs.length > 0 && (
                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-black"
                                                style={{ background: 'linear-gradient(90deg, #d97706, #f59e0b)' }}>
                                                {prs.length} PR{prs.length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                    {prsDate
                                        ? <div className="text-[9px] text-neutral-600 mt-0.5 truncate">
                                            <span style={{ color: 'rgba(234,179,8,0.65)' }}>{prsTitle}</span>
                                        </div>
                                        : <div className="text-[9px] text-neutral-700 mt-0.5">Faça um treino para ver seus recordes.</div>
                                    }
                                </div>

                                <motion.span className="text-neutral-600 shrink-0" animate={{ rotate: prsExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                    <ChevronDown size={13} />
                                </motion.span>
                            </div>

                            {/* Best PR quick-view */}
                            {prs.length > 0 && bestPr && bestTier && (
                                <div className="px-3 pb-2 -mt-0.5">
                                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                                        style={{ background: bestTier.accent, border: `1px solid ${bestTier.color}30` }}>
                                        <Zap size={10} style={{ color: bestTier.color }} className="shrink-0" />
                                        <span className="text-[9px] font-black shrink-0" style={{ color: bestTier.color }}>{bestTier.label}</span>
                                        <span className="text-[10px] text-neutral-300 truncate flex-1 font-semibold">{bestPr.exercise}</span>
                                        <div className="flex items-center gap-1 shrink-0 text-[9px] font-black">
                                            {bestPr.improved?.weight && <span className="text-yellow-400">{fmt(bestPr.weight)}kg</span>}
                                            {bestPr.improved?.reps && <span className="text-yellow-300">{fmt(bestPr.reps, 0)} rep</span>}
                                            {bestPr.improved?.volume && <span className="text-amber-300">{fmt(Math.round(bestPr.volume), 0)}kg vol</span>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Expanded PR list */}
                            <AnimatePresence initial={false}>
                                {prsExpanded && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="px-4 pb-4 space-y-1.5">
                                            <div className="h-px mb-2" style={{ background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.15), transparent)' }} />
                                            {prs.length ? (
                                                prs.map((pr, idx) => {
                                                    const tier = getTier(pr)
                                                    const improved = countImprovements(pr) > 0
                                                    return (
                                                        <motion.div key={`${pr.exercise}-${idx}`}
                                                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                                                            transition={{ delay: idx * 0.04 }}
                                                            className="flex items-center gap-2 rounded-xl px-3 py-2"
                                                            style={{
                                                                background: improved ? tier.accent : 'rgba(255,255,255,0.02)',
                                                                border: improved ? `1px solid ${tier.color}28` : '1px solid rgba(255,255,255,0.05)',
                                                            }}
                                                        >
                                                            <TrendingUp size={11} className={improved ? 'text-green-400 shrink-0' : 'text-neutral-700 shrink-0'} />
                                                            <span className="text-xs font-bold text-neutral-200 truncate flex-1">{pr.exercise}</span>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <MetricBadge label="PESO" value={`${fmt(pr.weight)}kg`} highlight={!!pr.improved?.weight} />
                                                                <MetricBadge label="REPS" value={fmt(pr.reps, 0)} highlight={!!pr.improved?.reps} />
                                                                <MetricBadge label="VOL" value={`${fmt(Math.round(pr.volume), 0)}kg`} highlight={!!pr.improved?.volume} />
                                                            </div>
                                                        </motion.div>
                                                    )
                                                })
                                            ) : (
                                                <div className="flex items-center gap-2 py-2 px-3 rounded-xl"
                                                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <Trophy size={12} className="text-neutral-700" />
                                                    <span className="text-xs text-neutral-600 font-bold">
                                                        {!prsDate ? 'Sem treinos concluídos ainda.'
                                                            : !withinWeek ? 'Seu último treino foi há mais de 7 dias.'
                                                                : 'Sem novos recordes neste treino.'}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Badges */}
                                            {showBadges && safeBadges.length > 0 && (
                                                <div className="pt-1.5">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Star size={10} className="text-yellow-500" />
                                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600">Conquistas ({safeBadges.length})</span>
                                                    </div>
                                                    <BadgesInline badges={safeBadges} />
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* Badges only (no records section) */}
                    {showBadges && !showRecords && safeBadges.length > 0 && (
                        <div className="px-4 pb-4 relative z-10">
                            <div className="h-px mb-3" style={{ background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.12), transparent)' }} />
                            <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600 mb-2">Conquistas ({safeBadges.length})</h3>
                            <BadgesInline badges={safeBadges} />
                        </div>
                    )}
                </motion.div>
            )}

            {/* ─── Leaderboard modal ──────────────────────────────────────────────── */}
            {showIronRank && rankOpen && (
                <div
                    className="fixed inset-0 z-[1250] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
                    aria-hidden="false"
                >
                    <motion.div
                        ref={rankFocusTrapRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Ranking Global Iron Rank"
                        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full max-w-lg overflow-hidden rounded-2xl"
                        style={{
                            background: 'linear-gradient(160deg, rgba(20,20,20,0.98) 0%, rgba(12,12,12,0.98) 100%)',
                            border: '1px solid rgba(234,179,8,0.2)',
                            boxShadow: '0 24px 64px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.12)',
                        }}
                    >
                        {/* Header */}
                        <div className="relative p-4 flex items-center justify-between gap-3"
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{
                                background: 'linear-gradient(90deg, transparent 0%, rgba(234,179,8,0.6) 40%, rgba(251,191,36,1) 50%, rgba(234,179,8,0.6) 60%, transparent 100%)',
                            }} />
                            <div>
                                <div className="text-[9px] font-black uppercase tracking-[0.22em] text-yellow-500">Iron Rank</div>
                                <div className="text-white font-black text-lg">Ranking Global</div>
                            </div>
                            <button type="button" onClick={() => setRankOpen(false)}
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                                aria-label="Fechar">
                                <X size={17} />
                            </button>
                        </div>
                        {/* Body */}
                        <div className="p-4 space-y-2 max-h-[72vh] overflow-y-auto">
                            {rankLoading ? (
                                <div className="p-4 rounded-xl text-sm text-neutral-500"
                                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    Carregando ranking…
                                </div>
                            ) : rankError ? (
                                <div className="p-4 rounded-xl text-sm text-red-300"
                                    style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
                                    {rankError}
                                </div>
                            ) : leaderboard.length === 0 ? (
                                <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div className="font-bold text-neutral-200 text-sm">Ainda não há dados suficientes.</div>
                                    <div className="mt-1 text-neutral-600 text-xs">Seu volume: <span className="text-yellow-400 font-black">{Math.round(totalVolumeKg).toLocaleString('pt-BR')}kg</span></div>
                                    <button type="button" onClick={() => setReloadRank(v => v + 1)}
                                        className="mt-3 px-3 py-2 rounded-xl text-xs font-black text-neutral-300"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                        Recarregar
                                    </button>
                                </div>
                            ) : (
                                leaderboard.map((row, idx) => {
                                    const isMe = safeUserId && row.userId === safeUserId
                                    const role = roleLabel(row.role)
                                    const name = row.displayName || `Usuário ${row.userId.slice(0, 6)}`
                                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                                    return (
                                        <div key={row.userId} className="flex items-center gap-3 rounded-xl p-3"
                                            style={{
                                                background: isMe ? 'linear-gradient(135deg, rgba(234,179,8,0.1), rgba(0,0,0,0.3))' : idx < 3 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                                                border: isMe ? '1px solid rgba(234,179,8,0.35)' : idx < 3 ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(255,255,255,0.04)',
                                            }}>
                                            <div className="w-7 text-center shrink-0">
                                                {medal ? <span className="text-base">{medal}</span> : <span className="text-neutral-600 text-xs">#{idx + 1}</span>}
                                            </div>
                                            <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
                                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                                {row.photoUrl
                                                    ? <Image src={row.photoUrl} alt="" width={36} height={36} className="w-full h-full object-cover" loading="lazy" />
                                                    : <span className="text-yellow-400 font-black text-sm">{String(name).slice(0, 1).toUpperCase()}</span>}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className={['text-sm font-black truncate', isMe ? 'text-yellow-400' : 'text-white'].join(' ')}>
                                                    {name}{isMe ? ' (você)' : ''}
                                                </div>
                                                <span className={`mt-0.5 inline-flex px-1.5 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${role.cls}`}>
                                                    {role.label}
                                                </span>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-[9px] text-neutral-700 font-bold uppercase">Volume</div>
                                                <div className="text-sm font-black text-yellow-400 tabular-nums">
                                                    {Math.round(row.totalVolumeKg).toLocaleString('pt-BR')}kg
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </>
    )
})

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            {icon}
            <span className="text-[9px] text-neutral-600 font-bold">{label}</span>
            <span className="text-[10px] font-black text-white ml-auto">{value}</span>
        </div>
    )
}

function MetricBadge({ label, value, highlight }: { label: string; value: string; highlight: boolean }) {
    return (
        <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase font-bold text-neutral-700">{label}</span>
            <span className={`text-[10px] font-black tabular-nums ${highlight ? 'text-yellow-400' : 'text-neutral-600'}`}>{value}</span>
        </div>
    )
}

function roleLabel(roleRaw: string | null) {
    const r = String(roleRaw || '').toLowerCase()
    if (r === 'admin') return { label: 'Admin', cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' }
    if (r === 'teacher') return { label: 'Coach', cls: 'bg-purple-500/10 text-purple-300 border-purple-500/30' }
    return { label: 'Aluno', cls: 'bg-neutral-800 text-neutral-500 border-neutral-700' }
}

function friendlyRankError(raw: string) {
    const l = raw.toLowerCase()
    if (l.includes('does not exist') || l.includes('iron_rank_leaderboard')) return 'Ranking indisponível: migrations pendentes.'
    if (l.includes('invalid input syntax')) return 'Ranking indisponível: format inválido em treinos antigos.'
    if (l.includes('not_authenticated') || l.includes('unauthorized')) return 'Ranking indisponível: faça login novamente.'
    return raw
}

export default IronRankCard
