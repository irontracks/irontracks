'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { motion } from 'framer-motion'

import { logMealAction } from '@/app/(app)/dashboard/nutrition/actions'
import type { MealLog } from '@/lib/nutrition/engine'

type Totals = { calories: number; protein: number; carbs: number; fat: number }

type RecentMeal = {
  id: string
  at: string
  meal: MealLog
}

const DEFAULT_RECENTS_LIMIT = 8

function safeNumber(value: any): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function formatClock(iso: string) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function makeId(seed: string) {
  try {
    if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
      return (globalThis.crypto as any).randomUUID() as string
    }
  } catch {}
  let base = seed
  try {
    if (typeof globalThis.btoa === 'function') base = globalThis.btoa(seed)
  } catch {
    base = seed
  }
  return String(base).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || `${Date.now()}`
}

function Meter({
  label,
  unit,
  value,
  goal,
}: {
  label: string
  unit: string
  value: number
  goal: number
}) {
  const safeValue = safeNumber(value)
  const safeGoal = Math.max(1, safeNumber(goal))
  const ratio = safeValue / safeGoal
  const pct = clamp01(ratio)
  const clipping = ratio > 1
  const barClass = clipping ? 'bg-red-500' : 'bg-yellow-500'
  const glowClass = clipping ? 'shadow-[0_0_24px_rgba(239,68,68,0.35)]' : 'shadow-[0_0_24px_rgba(234,179,8,0.25)]'

  return (
    <div className="rounded-xl bg-neutral-800 border border-neutral-700 p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-widest text-neutral-400">{label}</div>
        <div className={clipping ? 'text-xs font-black text-red-400' : 'text-xs font-black text-yellow-400'}>
          {Math.round(safeValue)} / {Math.round(safeGoal)}{unit}
        </div>
      </div>
      <div className="mt-4 h-44 rounded-xl bg-zinc-950 border border-neutral-700 overflow-hidden flex items-end">
        <motion.div
          className={`w-full ${barClass} ${glowClass}`}
          animate={{ height: `${Math.round(pct * 100)}%` }}
          transition={{ type: 'spring', stiffness: 140, damping: 18 }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
        <div>{clipping ? 'CLIP' : 'OK'}</div>
        <div>{Math.round(pct * 100)}%</div>
      </div>
    </div>
  )
}

export default function NutritionMixer({
  dateKey,
  initialTotals,
  goals,
  schemaMissing,
}: {
  dateKey: string
  initialTotals: Totals
  goals: Totals
  schemaMissing?: boolean
}) {
  const [totals, setTotals] = useState<Totals>({
    calories: safeNumber(initialTotals?.calories),
    protein: safeNumber(initialTotals?.protein),
    carbs: safeNumber(initialTotals?.carbs),
    fat: safeNumber(initialTotals?.fat),
  })
  const safeGoals = useMemo(
    () => ({
      calories: safeNumber(goals?.calories),
      protein: safeNumber(goals?.protein),
      carbs: safeNumber(goals?.carbs),
      fat: safeNumber(goals?.fat),
    }),
    [goals?.calories, goals?.protein, goals?.carbs, goals?.fat],
  )
  const [recents, setRecents] = useState<RecentMeal[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const storageKey = useMemo(() => `nutrition_recent_meals_${dateKey}`, [dateKey])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      const nextRecents = (() => {
        if (!raw) return []
        const parsed = JSON.parse(raw)
        const list = Array.isArray(parsed) ? parsed : []
        return list
          .filter((x) => x && typeof x === 'object')
          .map((x) => {
            const meal = (x as any).meal
            return {
              id: String((x as any).id || ''),
              at: String((x as any).at || ''),
              meal: {
                foodName: String(meal?.foodName || ''),
                calories: safeNumber(meal?.calories),
                protein: safeNumber(meal?.protein),
                carbs: safeNumber(meal?.carbs),
                fat: safeNumber(meal?.fat),
              },
            } satisfies RecentMeal
          })
          .filter((x) => x.id && x.meal.foodName)
          .slice(0, DEFAULT_RECENTS_LIMIT)
      })()

      if (typeof queueMicrotask === 'function') queueMicrotask(() => setRecents(nextRecents))
      else setTimeout(() => setRecents(nextRecents), 0)
    } catch {
      try {
        if (typeof queueMicrotask === 'function') queueMicrotask(() => setRecents([]))
        else setTimeout(() => setRecents([]), 0)
      } catch {}
    }
  }, [storageKey])

  const persistRecents = (next: RecentMeal[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next.slice(0, DEFAULT_RECENTS_LIMIT)))
    } catch {}
  }

  const handleSubmit = () => {
    const text = input.trim()
    if (!text) return

    setError(null)
    startTransition(async () => {
      try {
        const res = await logMealAction(text)
        if (!res?.ok) {
          setError(String((res as any)?.error || 'Falha ao processar a refeição.'))
          return
        }

        const meal = (res as any).meal as MealLog | undefined
        if (!meal) {
          setError('Falha ao processar a refeição.')
          return
        }

        const nowIso = new Date().toISOString()
        const nextItem: RecentMeal = {
          id: makeId(`${nowIso}:${meal.foodName}`),
          at: nowIso,
          meal,
        }

        setTotals((prev) => ({
          calories: safeNumber(prev?.calories) + safeNumber(meal.calories),
          protein: safeNumber(prev?.protein) + safeNumber(meal.protein),
          carbs: safeNumber(prev?.carbs) + safeNumber(meal.carbs),
          fat: safeNumber(prev?.fat) + safeNumber(meal.fat),
        }))

        setRecents((prev) => {
          const next = [nextItem, ...(Array.isArray(prev) ? prev : [])].slice(0, DEFAULT_RECENTS_LIMIT)
          persistRecents(next)
          return next
        })

        setInput('')
        try {
          if (typeof queueMicrotask === 'function') queueMicrotask(() => inputRef.current?.focus())
          else setTimeout(() => inputRef.current?.focus(), 0)
        } catch {}
      } catch (e: any) {
        setError(e?.message || 'Falha ao processar a refeição.')
      }
    })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-5 md:p-7">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-neutral-400">THE METABOLIC MIXER</div>
              <div className="mt-2 text-2xl md:text-3xl font-black text-white">Nutrition Console</div>
              <div className="mt-1 text-sm text-neutral-400">Data: {dateKey}</div>
            </div>
            <div className="rounded-xl bg-neutral-800 border border-neutral-700 px-4 py-3">
              <div className="text-xs uppercase tracking-widest text-neutral-400">KCAL</div>
              <div className="mt-1 text-xl font-black">
                <span className={safeNumber(totals?.calories) > safeNumber(safeGoals?.calories) ? 'text-red-400' : 'text-yellow-400'}>
                  {Math.round(totals.calories)}
                </span>
                <span className="text-neutral-500"> / {Math.round(safeGoals.calories)}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Meter label="PROTEÍNA" unit="g" value={totals.protein} goal={safeGoals.protein} />
            <Meter label="CARBO" unit="g" value={totals.carbs} goal={safeGoals.carbs} />
            <Meter label="GORDURA" unit="g" value={totals.fat} goal={safeGoals.fat} />
          </div>

          <div className="mt-6 rounded-xl bg-neutral-800 border border-neutral-700 p-4 md:p-5">
            <div className="text-xs uppercase tracking-widest text-neutral-400">The Fader</div>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (!isPending && !schemaMissing) handleSubmit()
                  }
                }}
                disabled={isPending || !!schemaMissing}
                placeholder={
                  schemaMissing
                    ? 'Nutrição não configurada no banco. Aplique a migration.'
                    : 'O que você comeu? Ex: 150g frango + 100g arroz'
                }
                className="w-full rounded-xl bg-zinc-950 border border-neutral-700 px-4 py-4 text-base font-semibold text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
              />
              <button
                type="button"
                onClick={() => {
                  if (!isPending && !schemaMissing) handleSubmit()
                }}
                disabled={isPending || !!schemaMissing}
                className="inline-flex items-center justify-center rounded-xl bg-yellow-500 px-5 py-4 font-black text-black hover:bg-yellow-400 disabled:opacity-60"
              >
                {isPending ? 'Processando…' : 'Lançar'}
              </button>
            </div>
            {schemaMissing && (
              <div className="mt-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                Banco de dados de nutrição não configurado. Rode a migration{' '}
                <span className="font-black">20251227120000_nutrition_core.sql</span> no Supabase.
              </div>
            )}
            {error && (
              <div className="mt-3 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>

          <div className="mt-6 rounded-xl bg-neutral-800 border border-neutral-700 p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-neutral-400">Log</div>
              <div className="text-xs text-neutral-500">Últimos lançamentos (local)</div>
            </div>
            <div className="mt-3 space-y-2">
              {(Array.isArray(recents) ? recents : []).length === 0 ? (
                <div className="rounded-xl bg-zinc-950 border border-neutral-700 px-4 py-4 text-sm text-neutral-500">
                  Nenhuma refeição registrada hoje.
                </div>
              ) : (
                (Array.isArray(recents) ? recents : []).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl bg-zinc-950 border border-neutral-700 px-4 py-3 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white truncate">{item.meal.foodName}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {formatClock(item.at)} · P {Math.round(item.meal.protein)}g · C {Math.round(item.meal.carbs)}g · G {Math.round(item.meal.fat)}g
                      </div>
                    </div>
                    <div className="text-sm font-black text-yellow-400 whitespace-nowrap">{Math.round(item.meal.calories)} kcal</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
