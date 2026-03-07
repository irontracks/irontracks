'use client'

import React, { memo, useEffect, useState } from 'react'
import { Trophy, TrendingUp, X, ChevronDown, Zap, Flame, Dumbbell, Star } from 'lucide-react'
import { getLatestWorkoutPrs } from '@/actions/workout-actions'
import { motion, AnimatePresence } from 'framer-motion'
import BadgesInline, { type Badge } from './BadgesInline'
import { logError } from '@/lib/logger'

type PrData = {
  exercise: string
  weight: number
  reps: number
  volume: number
  improved?: {
    weight?: boolean
    reps?: boolean
    volume?: boolean
  }
}

type RecentAchievementsProps = {
  userId?: string
  badges?: Badge[]
  showBadges?: boolean
  reloadKey?: number
}

// Returns how many metrics improved for a PR
function countImprovements(pr: PrData): number {
  return [pr.improved?.weight, pr.improved?.reps, pr.improved?.volume].filter(Boolean).length
}

// Medal tier based on number of improved metrics
function getTier(pr: PrData) {
  const n = countImprovements(pr)
  if (n === 3) return { label: 'TRIPLE PR!', color: '#f59e0b', glow: 'rgba(245,158,11,0.5)' }
  if (n === 2) return { label: 'DOUBLE PR', color: '#eab308', glow: 'rgba(234,179,8,0.35)' }
  return { label: 'NOVO PR', color: '#ca8a04', glow: 'rgba(202,138,4,0.25)' }
}

function formatNum(n: number, decimals = 2) {
  return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: decimals })
}

const RecentAchievements = memo(function RecentAchievements({ userId, badges, showBadges = false, reloadKey }: RecentAchievementsProps) {
  const [prs, setPrs] = useState<PrData[]>([])
  const [workoutTitle, setWorkoutTitle] = useState<string>('')
  const [workoutDateIso, setWorkoutDateIso] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!userId) { setLoading(false); return }
    setLoading(true)
    const load = async () => {
      try {
        const res = await getLatestWorkoutPrs()
        if (cancelled) return
        const resObj = res && typeof res === 'object' ? (res as Record<string, unknown>) : null
        const workoutObj = resObj?.workout && typeof resObj.workout === 'object' ? (resObj.workout as Record<string, unknown>) : null
        const dateIso = workoutObj?.date
        const title = workoutObj?.title
        setWorkoutDateIso(dateIso ? String(dateIso) : '')
        setWorkoutTitle(title ? String(title) : 'Sem treinos recentes')
        if (res?.ok && Array.isArray(res?.prs) && res.prs.length > 0) {
          setPrs(res.prs)
        } else {
          setPrs([])
        }
      } catch (e) {
        logError('error', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [userId, reloadKey])

  if (loading) return null

  const withinLast7Days = (() => {
    if (!workoutDateIso) return false
    const d = new Date(workoutDateIso)
    if (Number.isNaN(d.getTime())) return false
    return (new Date().getTime() - d.getTime()) / (1000 * 60 * 60) < 168
  })()

  const safeBadges = Array.isArray(badges) ? badges : []
  const totalImproved = prs.filter(pr => countImprovements(pr) > 0).length
  const bestPr = prs.length > 0 ? [...prs].sort((a, b) => countImprovements(b) - countImprovements(a))[0] : null
  const bestTier = bestPr ? getTier(bestPr) : null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.97 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-2xl mb-4 select-none"
          style={{
            background: 'linear-gradient(135deg, rgba(234,179,8,0.10) 0%, rgba(20,20,20,0.85) 50%, rgba(234,179,8,0.06) 100%)',
            border: '1px solid rgba(234,179,8,0.35)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(234,179,8,0.15)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Shimmer line top */}
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(234,179,8,0.7) 40%, rgba(251,191,36,1) 50%, rgba(234,179,8,0.7) 60%, transparent 100%)',
          }} />

          {/* Glow orb background */}
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none" style={{
            background: 'radial-gradient(circle, rgba(234,179,8,0.12) 0%, transparent 70%)',
          }} />

          {/* Header row */}
          <div
            className="flex items-center gap-3 p-3 cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => setExpanded(v => !v)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v) } }}
          >
            {/* Trophy icon with glow ring */}
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(234,179,8,0.2)', filter: 'blur(6px)' }} />
              <div className="relative w-10 h-10 rounded-full flex items-center justify-center" style={{
                background: 'linear-gradient(135deg, rgba(234,179,8,0.25), rgba(234,179,8,0.08))',
                border: '1px solid rgba(234,179,8,0.5)',
              }}>
                <Trophy size={18} className="text-yellow-400" />
              </div>
            </div>

            {/* Title + subtitle */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white uppercase tracking-widest">Novos Recordes</span>
                {prs.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-black"
                    style={{ background: 'linear-gradient(90deg, #eab308, #f59e0b)' }}>
                    {prs.length} PR{prs.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-neutral-400 truncate mt-0.5">
                {workoutDateIso
                  ? <><span className="text-neutral-500">No treino: </span><span style={{ color: 'rgba(234,179,8,0.8)' }}>{workoutTitle}</span></>
                  : 'Faça um treino para ver seus recordes aqui.'}
              </div>
            </div>

            {/* Expand / close */}
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                aria-label={expanded ? 'Recolher' : 'Expandir'}
                onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
                className="w-9 h-9 flex items-center justify-center rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <motion.span className="inline-flex text-neutral-400" animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown size={16} />
                </motion.span>
              </button>
              <button
                type="button"
                aria-label="Fechar"
                onClick={e => { e.stopPropagation(); setVisible(false) }}
                className="w-9 h-9 flex items-center justify-center rounded-xl transition-all text-neutral-500 hover:text-red-400"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Quick stats bar (always visible when has PRs) */}
          {prs.length > 0 && bestPr && bestTier && (
            <div className="px-3 pb-3 -mt-1">
              <div className="grid grid-cols-3 gap-2">
                {/* best exercise highlight */}
                <div className="col-span-3 flex items-center gap-2 px-3 py-2 rounded-xl" style={{
                  background: `linear-gradient(135deg, ${bestTier.glow.replace(')', ', 0.15)')}, rgba(0,0,0,0.3))`.replace('rgba(', 'rgba(').replace(', 0.15)', ', 0.15)'),
                  border: `1px solid ${bestTier.color}40`,
                }}>
                  <Zap size={13} style={{ color: bestTier.color }} className="shrink-0" />
                  <span className="text-xs font-black truncate" style={{ color: bestTier.color }}>{bestTier.label}</span>
                  <span className="text-xs text-neutral-300 truncate font-semibold flex-1">{bestPr.exercise}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {bestPr.improved?.weight && <span className="text-xs font-black text-yellow-400">{formatNum(bestPr.weight)}kg</span>}
                    {bestPr.improved?.reps && <span className="text-xs font-black text-yellow-300">{formatNum(bestPr.reps, 0)} rep</span>}
                    {bestPr.improved?.volume && <span className="text-xs font-black text-amber-300">{formatNum(Math.round(bestPr.volume), 0)}kg vol</span>}
                  </div>
                </div>

                {/* mini stats */}
                <StatChip icon={<Flame size={11} className="text-orange-400" />} label="PRs" value={String(totalImproved)} />
                <StatChip icon={<Dumbbell size={11} className="text-yellow-400" />} label="Exercícios" value={String(prs.length)} />
                <StatChip icon={<Star size={11} className="text-amber-400" />} label="Conquistas" value={String(safeBadges.length)} />
              </div>
            </div>
          )}

          {/* Expanded content */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3 space-y-1.5">
                  {/* Divider */}
                  <div className="h-px mb-2" style={{ background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.2), transparent)' }} />

                  {prs.length ? (
                    prs.map((pr, idx) => {
                      const tier = getTier(pr)
                      const improved = countImprovements(pr) > 0
                      return (
                        <motion.div
                          key={`${pr.exercise}-${idx}`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className="flex items-center gap-2 rounded-xl px-3 py-2"
                          style={{
                            background: improved
                              ? 'linear-gradient(135deg, rgba(234,179,8,0.08), rgba(0,0,0,0.3))'
                              : 'rgba(255,255,255,0.02)',
                            border: improved
                              ? '1px solid rgba(234,179,8,0.25)'
                              : '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <TrendingUp size={13} className={improved ? 'text-green-400 shrink-0' : 'text-neutral-600 shrink-0'} />
                          <span className="text-xs font-bold text-neutral-200 truncate flex-1">{pr.exercise}</span>

                          <div className="flex items-center gap-2 shrink-0">
                            <MetricBadge label="PESO" value={`${formatNum(pr.weight)}kg`} highlight={!!pr.improved?.weight} />
                            <MetricBadge label="REPS" value={formatNum(pr.reps, 0)} highlight={!!pr.improved?.reps} />
                            <MetricBadge label="VOL" value={`${formatNum(Math.round(pr.volume), 0)}kg`} highlight={!!pr.improved?.volume} />
                          </div>
                        </motion.div>
                      )
                    })
                  ) : (
                    <div className="flex items-center gap-2 py-3 px-3 rounded-xl" style={{
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <Trophy size={14} className="text-neutral-600" />
                      <span className="text-xs text-neutral-500 font-bold">
                        {!workoutDateIso
                          ? 'Sem treinos concluídos ainda.'
                          : !withinLast7Days
                            ? 'Seu último treino foi há mais de 7 dias.'
                            : 'Sem novos recordes detectados neste treino.'}
                      </span>
                    </div>
                  )}

                  {/* Badges section */}
                  {showBadges && safeBadges.length > 0 && (
                    <div className="pt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Star size={11} className="text-yellow-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                          Conquistas ({safeBadges.length})
                        </span>
                      </div>
                      <BadgesInline badges={safeBadges} />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
})

// Sub-components
function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {icon}
      <span className="text-[10px] text-neutral-500 font-bold">{label}</span>
      <span className="text-xs font-black text-white ml-auto">{value}</span>
    </div>
  )
}

function MetricBadge({ label, value, highlight }: { label: string; value: string; highlight: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase font-bold text-neutral-600">{label}</span>
      <span className={`text-[10px] font-black tabular-nums ${highlight ? 'text-yellow-400' : 'text-neutral-400'}`}>
        {value}
      </span>
    </div>
  )
}

export default RecentAchievements
