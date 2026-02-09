'use client'

import React, { useEffect, useState } from 'react'
import { Trophy, TrendingUp, X, ChevronDown } from 'lucide-react'
import { getLatestWorkoutPrs } from '@/actions/workout-actions'
import { motion, AnimatePresence } from 'framer-motion'
import BadgesInline, { type Badge } from './BadgesInline'

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

export default function RecentAchievements({ userId, badges, showBadges = false, reloadKey }: RecentAchievementsProps) {
  const [prs, setPrs] = useState<PrData[]>([])
  const [workoutTitle, setWorkoutTitle] = useState<string>('')
  const [workoutDateIso, setWorkoutDateIso] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setLoading(false)
      return
    }
    setLoading(true)

    const load = async () => {
      try {
        const res = await getLatestWorkoutPrs()
        if (cancelled) return
        const dateIso = res?.workout?.date
        const title = res?.workout?.title
        if (dateIso) setWorkoutDateIso(String(dateIso))
        else setWorkoutDateIso('')
        setWorkoutTitle(title ? String(title) : 'Sem treinos recentes')

        if (res?.ok && Array.isArray(res?.prs) && res.prs.length > 0) {
          setPrs(res.prs)
        } else {
          setPrs([])
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId, reloadKey])

  if (loading) return null

  const withinLast7Days = (() => {
    if (!workoutDateIso) return false
    const d = new Date(workoutDateIso)
    if (Number.isNaN(d.getTime())) return false
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)
    return diffHours < 168
  })()
  const safeBadges = Array.isArray(badges) ? badges : []

  return (
    <AnimatePresence>
      {visible && (
        <motion.div 
          initial={{ opacity: 0, y: -20, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -20, height: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative overflow-hidden bg-gradient-to-br from-yellow-500/10 to-neutral-900 border border-yellow-500/30 rounded-xl p-3 mb-4 shadow-lg shadow-black/20 cursor-pointer select-none"
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            setExpanded((v) => !v)
          }}
        >
          <div className="flex items-center gap-3">
            <div className="bg-yellow-500/20 p-2 rounded-full text-yellow-500 ring-1 ring-yellow-500/50">
              <Trophy size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-white uppercase tracking-wider truncate">
                Novos Recordes
              </div>
              <div className="text-xs text-neutral-400 truncate">
                {workoutDateIso ? (
                  <>
                    No treino: <span className="text-yellow-500/80">{workoutTitle}</span>
                  </>
                ) : (
                  <>Faça um treino para ver seus recordes aqui.</>
                )}
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={expanded ? 'Recolher' : 'Expandir'}
                onClick={(e) => {
                  e.stopPropagation()
                  setExpanded((v) => !v)
                }}
                className="text-neutral-500 hover:text-neutral-300 rounded-full hover:bg-neutral-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
              >
                <motion.span
                  className="inline-flex"
                  animate={{ rotate: expanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={18} />
                </motion.span>
              </button>

              <button
                type="button"
                aria-label="Fechar"
                onClick={(e) => {
                  e.stopPropagation()
                  setVisible(false)
                }}
                className="text-neutral-500 hover:text-neutral-300 rounded-full hover:bg-neutral-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-2 overflow-hidden"
              >
                {prs.length ? (
                  prs.map((pr, idx) => (
                    <div
                      key={`${pr.exercise}-${idx}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-neutral-900/80 rounded-lg p-2 border border-neutral-800 hover:border-yellow-500/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <TrendingUp size={14} className="text-green-500 shrink-0" />
                        <span className="text-xs font-bold text-neutral-200 truncate">{pr.exercise}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] uppercase font-bold text-neutral-500">PESO</span>
                          <span className={`text-xs font-black tabular-nums ${pr?.improved?.weight ? 'text-yellow-500' : 'text-neutral-200'}`}>
                            {Number(pr.weight || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}kg
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] uppercase font-bold text-neutral-500">REPS</span>
                          <span className={`text-xs font-black tabular-nums ${pr?.improved?.reps ? 'text-yellow-500' : 'text-neutral-200'}`}>
                            {Number(pr.reps || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] uppercase font-bold text-neutral-500">VOLUME</span>
                          <span className={`text-xs font-black tabular-nums ${pr?.improved?.volume ? 'text-yellow-500' : 'text-neutral-200'}`}>
                            {Math.round(Number(pr.volume || 0)).toLocaleString('pt-BR')}kg
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-neutral-400 font-bold">
                    {!workoutDateIso
                      ? 'Sem treinos concluídos ainda.'
                      : !withinLast7Days
                        ? 'Seu último treino foi há mais de 7 dias.'
                        : 'Sem novos recordes detectados neste treino.'}
                  </div>
                )}

                {showBadges ? (
                  <div className="pt-2">
                    <div className="text-[11px] font-black uppercase tracking-widest text-neutral-400 mb-2">Conquistas ({safeBadges.length})</div>
                    <BadgesInline badges={safeBadges} />
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
