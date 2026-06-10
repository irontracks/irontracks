'use client'

import { useState, useCallback } from 'react'
import { applyGeneratedMealAction } from '@/app/(app)/dashboard/nutrition/actions'
import { getErrorMessage } from '@/utils/errorMessage'

type Totals = { calories: number; protein: number; carbs: number; fat: number }

type PlanItem = { food: string; grams: number; calories: number; protein: number; carbs: number; fat: number }
type PlanMeal = { name: string; time?: string; items: PlanItem[]; totals: Totals }
type DietPlan = {
  planName: string
  meals: PlanMeal[]
  totals: Totals
  target: Totals
  adherence: { calories: number; protein: number }
  usedHistory: boolean
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function DietGenerator({
  goals,
  dateKey,
  hideVipCtas,
  onApplied,
}: {
  goals: Totals
  dateKey: string
  hideVipCtas?: boolean
  onApplied?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upgrade, setUpgrade] = useState(false)
  const [plan, setPlan] = useState<DietPlan | null>(null)
  const [appliedIdx, setAppliedIdx] = useState<Set<number>>(new Set())
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null)

  const generate = useCallback(async () => {
    if (busy) return
    setBusy(true); setError(null); setUpgrade(false); setPlan(null); setAppliedIdx(new Set())
    try {
      const res = await fetch('/api/ai/diet-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calories: num(goals.calories),
          protein: num(goals.protein),
          carbs: num(goals.carbs),
          fat: num(goals.fat),
        }),
      })
      const json = await res.json().catch((): null => null)
      if (!json?.ok) {
        const up = !!json?.upgradeRequired || String(json?.error || '') === 'vip_required'
        setUpgrade(up)
        setError(up ? 'Disponível para assinantes VIP Pro.' : 'Não consegui gerar agora. Tente novamente.')
        return
      }
      setPlan(json.plan as DietPlan)
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Falha ao gerar a dieta.')
    } finally {
      setBusy(false)
    }
  }, [busy, goals.calories, goals.protein, goals.carbs, goals.fat])

  const applyMeal = useCallback(async (meal: PlanMeal, idx: number) => {
    if (applyingIdx !== null) return
    setApplyingIdx(idx); setError(null)
    try {
      const res = await applyGeneratedMealAction(
        { name: meal.name, calories: meal.totals.calories, protein: meal.totals.protein, carbs: meal.totals.carbs, fat: meal.totals.fat },
        dateKey,
      )
      if (!res?.ok) { setError(String(res?.error || 'Falha ao aplicar.')); return }
      setAppliedIdx((prev) => new Set(prev).add(idx))
      onApplied?.()
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Falha ao aplicar.')
    } finally {
      setApplyingIdx(null)
    }
  }, [applyingIdx, dateKey, onApplied])

  return (
    <div className="relative rounded-2xl bg-neutral-900/80 border border-white/[0.06] backdrop-blur-sm overflow-hidden">
      <div className="p-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <span className="text-lg">🍱</span>
            <span className="text-sm font-bold text-white">Gerar dieta com IA</span>
          </span>
          <span className="text-[10px] uppercase tracking-wider text-yellow-500">{open ? 'Fechar' : 'Abrir'}</span>
        </button>

        {open && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-neutral-400">
              Monta um cardápio batendo suas metas ({Math.round(num(goals.calories))} kcal · {Math.round(num(goals.protein))}g P)
              usando os alimentos que você já come.
            </p>

            <button
              type="button"
              onClick={generate}
              disabled={busy || num(goals.calories) <= 0}
              className="h-10 w-full rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-bold text-sm shadow-lg shadow-yellow-500/20 hover:from-yellow-300 hover:to-amber-400 active:scale-[0.98] transition disabled:opacity-40"
            >
              {busy ? 'Gerando...' : plan ? '↻ Gerar outra' : '✨ Gerar dieta'}
            </button>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300 flex items-start justify-between gap-2">
                <span>{error}</span>
                {upgrade && !hideVipCtas && (
                  <button type="button" onClick={() => (window.location.href = '/marketplace')} className="shrink-0 text-[10px] font-bold text-yellow-400 hover:text-yellow-300">VIP Pro →</button>
                )}
              </div>
            )}

            {plan && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                  <span className="text-xs font-semibold text-white truncate">{plan.planName}</span>
                  <span className="text-[10px] tabular-nums text-neutral-400">
                    {Math.round(plan.totals.calories)} kcal · {plan.adherence.calories}% da meta
                  </span>
                </div>

                {plan.meals.map((meal, idx) => {
                  const applied = appliedIdx.has(idx)
                  return (
                    <div key={`${meal.name}-${idx}`} className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-white">
                          {meal.name}{meal.time ? <span className="text-neutral-400 font-normal"> · {meal.time}</span> : null}
                        </span>
                        <span className="text-[10px] tabular-nums text-yellow-300/90 shrink-0">
                          {Math.round(meal.totals.calories)} kcal · {Math.round(meal.totals.protein)}g P
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {meal.items.map((it, j) => (
                          <li key={`${it.food}-${j}`} className="flex items-baseline justify-between gap-2 text-xs text-neutral-300">
                            <span className="truncate">{it.food}</span>
                            <span className="shrink-0 tabular-nums text-neutral-400">{Math.round(it.grams)}g</span>
                          </li>
                        ))}
                      </ul>
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
                    </div>
                  )
                })}

                <p className="text-[10px] text-neutral-500 text-center">
                  Macros calculados no servidor. Ajuste as porções ao seu apetite.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
