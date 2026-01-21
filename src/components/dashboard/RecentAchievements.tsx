'use client'

import React, { useEffect, useState } from 'react'
import { Trophy, TrendingUp, X, ChevronDown } from 'lucide-react'
import { getLatestWorkoutPrs } from '@/actions/workout-actions'
import { motion, AnimatePresence } from 'framer-motion'

type PrData = {
  exercise: string
  label: string
  value: string
}

type RecentAchievementsProps = {
  userId?: string
}

export default function RecentAchievements({ userId }: RecentAchievementsProps) {
  const [prs, setPrs] = useState<PrData[]>([])
  const [workoutTitle, setWorkoutTitle] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!userId) return

    const load = async () => {
      try {
        const res = await getLatestWorkoutPrs()
        if (res.ok && res.prs && res.prs.length > 0) {
            const dateIso = res.workout?.date
            if (dateIso) {
                const d = new Date(dateIso)
                const now = new Date()
                const diffMs = now.getTime() - d.getTime()
                const diffHours = diffMs / (1000 * 60 * 60)
                
                // Show only if within last 7 days
                if (diffHours < 168) { 
                    setPrs(res.prs)
                    setWorkoutTitle(res.workout?.title || 'Treino Recente')
                }
            }
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [userId])

  if (loading || prs.length === 0) return null

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
                No treino: <span className="text-yellow-500/80">{workoutTitle}</span>
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
                {prs.map((pr, idx) => (
                  <div
                    key={`${pr.exercise}-${idx}`}
                    className="flex items-center justify-between bg-neutral-900/80 rounded-lg p-2 border border-neutral-800 hover:border-yellow-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <TrendingUp size={14} className="text-green-500 shrink-0" />
                      <span className="text-xs font-bold text-neutral-200 truncate">{pr.exercise}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] uppercase font-bold text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700">
                        {pr.label}
                      </span>
                      <span className="text-xs font-black text-yellow-500 tabular-nums">{pr.value}</span>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
