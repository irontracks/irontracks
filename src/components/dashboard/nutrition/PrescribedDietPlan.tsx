'use client'

import { useState, useEffect, useCallback } from 'react'
import { applyGeneratedMealAction } from '@/app/(app)/dashboard/nutrition/actions'
import { getErrorMessage } from '@/utils/errorMessage'

type Totals = { calories: number; protein: number; carbs: number; fat: number }
type PlanItem = { food: string; grams: number; calories: number; protein: number; carbs: number; fat: number }
type PlanMeal = { name: string; time?: string; items: PlanItem[]; totals: Totals }
type PrescribedPlan = {
  id: string
  plan_name: string
  meals: PlanMeal[]
  notes: string | null
  created_at: string
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Normaliza os macros de uma refeição — recomputa dos itens se o total vier vazio/ausente. */
function mealTotals(meal: PlanMeal): Totals {
  const t = meal?.totals
  if (t && num(t.calories) > 0) return { calories: num(t.calories), protein: num(t.protein), carbs: num(t.carbs), fat: num(t.fat) }
  const items = Array.isArray(meal?.items) ? meal.items : []
  return items.reduce<Totals>(
    (acc, it) => ({
      calories: acc.calories + num(it.calories),
      protein: acc.protein + num(it.protein),
      carbs: acc.carbs + num(it.carbs),
      fat: acc.fat + num(it.fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

/**
 * Plano alimentar PRESCRITO pelo professor, visto pelo aluno na aba Nutrição. Read-only —
 * o aluno não edita o plano, só pode "lançar" uma refeição no dia dele (reusa a mesma action
 * da dieta gerada por IA). Se não houver plano ativo, não renderiza nada.
 */
export default function PrescribedDietPlan({
  dateKey,
  canApply,
  onApplied,
}: {
  dateKey: string
  /** Só deixa lançar no dia atual (histórico/futuro só leem). */
  canApply?: boolean
  onApplied?: () => void
}) {
  const [plan, setPlan] = useState<PrescribedPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [openMeal, setOpenMeal] = useState<number | null>(null)
  const [appliedIdx, setAppliedIdx] = useState<Set<number>>(new Set())
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/nutrition/prescribed-plan', { cache: 'no-store' })
        const json = await res.json().catch((): null => null)
        if (!alive) return
        if (json?.ok && json.plan && Array.isArray(json.plan.meals) && json.plan.meals.length > 0) {
          setPlan(json.plan as PrescribedPlan)
        } else {
          setPlan(null)
        }
      } catch {
        if (alive) setPlan(null)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // "Lançado" é estado por-dia: ao navegar pra outro dia, zera os badges (o componente não
  // remonta na troca de data, então sem isso o ✓ vazaria pro dia seguinte).
  useEffect(() => {
    setAppliedIdx(new Set())
    setOpenMeal(null)
  }, [dateKey])

  const applyMeal = useCallback(async (meal: PlanMeal, idx: number) => {
    if (applyingIdx !== null) return
    setApplyingIdx(idx); setError(null)
    try {
      const t = mealTotals(meal)
      const res = await applyGeneratedMealAction(
        { name: meal.name, calories: t.calories, protein: t.protein, carbs: t.carbs, fat: t.fat },
        dateKey,
      )
      if (!res?.ok) { setError(String(res?.error || 'Falha ao lançar.')); return }
      setAppliedIdx((prev) => new Set(prev).add(idx))
      onApplied?.()
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Falha ao lançar.')
    } finally {
      setApplyingIdx(null)
    }
  }, [applyingIdx, dateKey, onApplied])

  if (loading || !plan) return null

  const grand = plan.meals.reduce<Totals>(
    (acc, m) => {
      const t = mealTotals(m)
      return { calories: acc.calories + t.calories, protein: acc.protein + t.protein, carbs: acc.carbs + t.carbs, fat: acc.fat + t.fat }
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )

  return (
    <div className="relative rounded-2xl bg-neutral-900/80 border border-yellow-500/20 backdrop-blur-sm overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-lg">🥗</span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white truncate">{plan.plan_name || 'Plano alimentar'}</span>
              <span className="block text-[10px] uppercase tracking-wider text-yellow-500">Prescrito pelo seu professor</span>
            </span>
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-neutral-400">{Math.round(grand.calories)} kcal · {Math.round(grand.protein)}g P</span>
        </div>

        {plan.notes ? (
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-neutral-300 whitespace-pre-wrap break-words">{plan.notes}</p>
        ) : null}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{error}</div>
        )}

        <div className="space-y-2">
          {plan.meals.map((meal, idx) => {
            const applied = appliedIdx.has(idx)
            const isOpen = openMeal === idx
            const t = mealTotals(meal)
            return (
              <div key={`${meal.name}-${idx}`} className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenMeal(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-2 p-3 text-left transition active:bg-white/[0.03]"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white truncate">{meal.name}</span>
                    {meal.time ? <span className="text-[10px] text-neutral-400">{meal.time}</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {applied && <span className="text-[10px] font-bold text-emerald-400">✓</span>}
                    <span className="text-[10px] tabular-nums text-yellow-300/90">{Math.round(t.calories)} kcal · {Math.round(t.protein)}g P</span>
                    <svg className={`size-3.5 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </button>

                {isOpen && (
                  <div className="px-3 pb-3">
                    <div className="overflow-hidden rounded-lg bg-black/20 divide-y divide-white/[0.04]">
                      {(Array.isArray(meal.items) ? meal.items : []).map((it, j) => (
                        <div key={`${it.food}-${j}`} className="px-2.5 py-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs text-white truncate">{it.food}</span>
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-neutral-200">{Math.round(num(it.grams))}g</span>
                          </div>
                          <div className="mt-1 flex gap-3 text-[10px] tabular-nums text-neutral-400">
                            <span>{Math.round(num(it.calories))} kcal</span>
                            <span className="text-yellow-400/80">P {Math.round(num(it.protein))}g</span>
                            <span className="text-amber-400/80">C {Math.round(num(it.carbs))}g</span>
                            <span className="text-red-400/80">G {Math.round(num(it.fat))}g</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 flex items-baseline justify-between gap-2 px-1 text-[11px] tabular-nums">
                      <span className="font-semibold text-white">Total da refeição</span>
                      <span className="text-neutral-300">{Math.round(t.calories)} kcal · P{Math.round(t.protein)} C{Math.round(t.carbs)} G{Math.round(t.fat)}</span>
                    </div>

                    {canApply && (
                      <button
                        type="button"
                        onClick={() => applyMeal(meal, idx)}
                        disabled={applied || applyingIdx !== null}
                        className={`mt-3 h-8 w-full rounded-lg text-xs font-bold transition active:scale-[0.98] ${
                          applied
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-white/[0.06] border border-white/[0.08] text-white hover:bg-white/[0.1] disabled:opacity-50'
                        }`}
                      >
                        {applied ? '✓ Lançado' : applyingIdx === idx ? 'Lançando...' : '✚ Lançar refeição'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-[10px] text-neutral-500 text-center">Plano montado pelo seu professor. Ajuste as porções ao seu apetite.</p>
      </div>
    </div>
  )
}
