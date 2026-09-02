'use client'

import { useState, useCallback } from 'react'
import { applyGeneratedMealAction } from '@/app/(app)/dashboard/nutrition/actions'
import { getErrorMessage } from '@/utils/errorMessage'
import { MACRO_SURFACES } from '@/lib/nutrition/macroColors'
import { planMealToLogItems } from '@/lib/nutrition/planMealItems'

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
  embedded = false,
}: {
  goals: Totals
  dateKey: string
  hideVipCtas?: boolean
  onApplied?: () => void
  /**
   * Modo embutido: renderiza só o conteúdo, sem card nem cabeçalho próprios —
   * quem controla a abertura é o card de refeição, que agora concentra as ações
   * de IA. Sem isso, um card dentro de outro card ficava com moldura dupla.
   */
  embedded?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upgrade, setUpgrade] = useState(false)
  const [plan, setPlan] = useState<DietPlan | null>(null)
  const [appliedIdx, setAppliedIdx] = useState<Set<number>>(new Set())
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null)
  const [openMeal, setOpenMeal] = useState<number | null>(null)
  // Salvar ≠ lançar: lançar joga a refeição no diário de HOJE; salvar guarda o
  // cardápio pra seguir depois. Antes só existia o lançar, e o plano sumia ao fechar.
  const [saving, setSaving] = useState(false)
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null)
  const [swappingKey, setSwappingKey] = useState<string | null>(null)
  /** Por item ("mealIdx-itemIdx"): alimentos já recusados, pra não voltarem. */
  const [rejected, setRejected] = useState<Record<string, string[]>>({})
  /** Salvar como plano de um dia ou da semana inteira (item 5 do pedido). */
  const [scope, setScope] = useState<'day' | 'week'>('day')

  const generate = useCallback(async () => {
    if (busy) return
    setBusy(true); setError(null); setUpgrade(false); setPlan(null); setAppliedIdx(new Set()); setOpenMeal(null)
    // Gerou outra? O "salvo" some — senão o selo verde fica dizendo que este
    // cardápio novo está guardado, quando o guardado é o anterior.
    setSavedPlanId(null)
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

  const savePlan = useCallback(async () => {
    if (!plan || saving) return
    setSaving(true); setError(null)
    try {
      // Semana: o servidor deriva os outros 6 dias variando alimentos, sem nova
      // chamada de IA (ver lib/nutrition/weekPlan). O corpo enviado é o mesmo.
      const endpoint = scope === 'week' ? '/api/nutrition/diet-plan/week' : '/api/nutrition/diet-plan'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          planName: plan.planName,
          meals: plan.meals.map((m) => ({
            name: m.name,
            ...(m.time ? { time: m.time } : {}),
            items: m.items.map((it) => ({
              food: it.food,
              grams: num(it.grams),
              calories: num(it.calories),
              protein: num(it.protein),
              carbs: num(it.carbs),
              fat: num(it.fat),
            })),
          })),
        }),
      })
      const json = await res.json().catch((): null => null)
      if (!res.ok || !json?.ok) {
        setError('Não consegui salvar a dieta. Tente novamente.')
        return
      }
      setSavedPlanId(String(json.plan?.id || ''))
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Falha ao salvar a dieta.')
    } finally {
      setSaving(false)
    }
  }, [plan, saving, scope])

  /**
   * Troca um alimento por outro da mesma classe. Só funciona com a dieta SALVA —
   * a troca grava direto no plano (item 4 do pedido), então precisa existir plano.
   * `rejected` acumula o que já foi recusado: clicar de novo traz o próximo, não
   * o mesmo de volta.
   */
  const swapItem = useCallback(async (mealIdx: number, itemIdx: number) => {
    if (!savedPlanId || swappingKey) return
    const key = `${mealIdx}-${itemIdx}`
    setSwappingKey(key); setError(null)
    try {
      const res = await fetch('/api/nutrition/diet-plan/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dayIndex: 0, mealIndex: mealIdx, itemIndex: itemIdx, reject: rejected[key] ?? [] }),
      })
      const json = await res.json().catch((): null => null)
      if (!res.ok || !json?.ok) {
        setError(
          String(json?.error || '') === 'no_alternative'
            ? 'Não achei outro alimento parecido no seu repertório pra trocar.'
            : 'Não consegui trocar agora. Tente novamente.',
        )
        return
      }
      const swappedFood = String(json.swapped?.food || '')
      setPlan((prev) => {
        if (!prev) return prev
        const meals = prev.meals.map((m, mi) =>
          mi !== mealIdx
            ? m
            : {
                ...m,
                items: m.items.map((it, ii) => (ii !== itemIdx ? it : { ...it, ...json.swapped })),
              },
        )
        // Totais recalculados aqui também: o card mostra o total da refeição, e
        // deixá-lo velho depois da troca é a mentira silenciosa que o helper evita.
        return {
          ...prev,
          meals: meals.map((m) => ({
            ...m,
            totals: m.items.reduce(
              (acc, it) => ({
                calories: acc.calories + num(it.calories),
                protein: acc.protein + num(it.protein),
                carbs: acc.carbs + num(it.carbs),
                fat: acc.fat + num(it.fat),
              }),
              { calories: 0, protein: 0, carbs: 0, fat: 0 },
            ),
          })),
        }
      })
      if (swappedFood) {
        setRejected((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), swappedFood] }))
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Falha ao trocar o alimento.')
    } finally {
      setSwappingKey(null)
    }
  }, [savedPlanId, swappingKey, rejected])

  const applyMeal = useCallback(async (meal: PlanMeal, idx: number) => {
    if (applyingIdx !== null) return
    setApplyingIdx(idx); setError(null)
    try {
      const res = await applyGeneratedMealAction(
        { name: meal.name, calories: meal.totals.calories, protein: meal.totals.protein, carbs: meal.totals.carbs, fat: meal.totals.fat },
        dateKey,
        planMealToLogItems(meal),
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

  const content = (
          <div className={embedded ? 'space-y-3' : 'mt-3 space-y-3'}>
            <p className="text-xs text-neutral-400">
              Monta um cardápio batendo suas metas ({Math.round(num(goals.calories))} kcal · {Math.round(num(goals.protein))}g P)
              usando os alimentos que você já come.
            </p>

            <button
              type="button"
              onClick={generate}
              disabled={busy || num(goals.calories) <= 0}
              className="tap-44 h-10 w-full rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-bold text-sm shadow-lg shadow-yellow-500/20 hover:from-yellow-300 hover:to-amber-400 active:scale-[0.98] transition disabled:opacity-40"
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

                {/* Salvar pra UM dia ou repetir a semana com variação — item 5. */}
                <div className="flex gap-1 rounded-xl bg-white/[0.03] border border-white/[0.06] p-1" role="group" aria-label="Salvar para">
                  {(['day', 'week'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScope(s)}
                      disabled={!!savedPlanId}
                      aria-pressed={scope === s}
                      className={`tap-44 h-8 flex-1 rounded-lg text-[11px] font-bold transition disabled:opacity-40 ${
                        scope === s ? 'bg-yellow-500/20 text-yellow-300' : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {s === 'day' ? 'Só hoje' : 'Semana toda'}
                    </button>
                  ))}
                </div>

                {scope === 'week' && !savedPlanId && (
                  <p className="px-1 text-[10px] leading-relaxed text-neutral-400">
                    Os outros 6 dias saem deste cardápio, variando os alimentos por outros do
                    seu repertório — mesma meta, sem repetir a semana inteira.
                  </p>
                )}

                <button
                  type="button"
                  onClick={savePlan}
                  disabled={saving || !!savedPlanId}
                  className={`tap-44 h-10 w-full rounded-xl text-sm font-bold transition active:scale-[0.98] ${
                    savedPlanId
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'bg-white/[0.06] border border-white/[0.1] text-white hover:bg-white/[0.1] disabled:opacity-50'
                  }`}
                >
                  {savedPlanId
                    ? scope === 'week' ? '✓ Semana salva — é só seguir' : '✓ Dieta salva — é só seguir'
                    : saving ? 'Salvando...' : scope === 'week' ? '💾 Salvar a semana' : '💾 Salvar esta dieta'}
                </button>

                {plan.meals.map((meal, idx) => {
                  const applied = appliedIdx.has(idx)
                  const isOpen = openMeal === idx
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
                          <span className="text-[10px] tabular-nums text-yellow-300/90">{Math.round(meal.totals.calories)} kcal · {Math.round(meal.totals.protein)}g P</span>
                          <svg className={`size-3.5 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                          </svg>
                        </span>
                      </button>

                      {isOpen && (
                        <div className="px-3 pb-3">
                          <div className="overflow-hidden rounded-lg bg-black/20 divide-y divide-white/[0.04]">
                            {meal.items.map((it, j) => (
                              <div key={`${it.food}-${j}`} className="px-2.5 py-2">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-xs text-white truncate">{it.food}</span>
                                  <span className="flex shrink-0 items-center gap-1.5">
                                    <span className="text-xs font-semibold tabular-nums text-neutral-200">{Math.round(it.grams)}g</span>
                                    {/* Trocar exige plano salvo: a troca grava direto nele. */}
                                    <button
                                      type="button"
                                      onClick={() => swapItem(idx, j)}
                                      disabled={!savedPlanId || swappingKey !== null}
                                      title={savedPlanId ? `Trocar ${it.food} por outro parecido` : 'Salve a dieta para poder trocar'}
                                      aria-label={`Trocar ${it.food}`}
                                      className="flex size-6 items-center justify-center rounded-md text-[11px] text-neutral-400 transition hover:bg-white/[0.08] hover:text-yellow-300 disabled:opacity-30"
                                    >
                                      {swappingKey === `${idx}-${j}` ? '…' : '↻'}
                                    </button>
                                  </span>
                                </div>
                                <div className="mt-1 flex gap-3 text-[10px] tabular-nums text-neutral-400">
                                  <span>{Math.round(it.calories)} kcal</span>
                                  <span className={MACRO_SURFACES.protein.label}>P {Math.round(it.protein)}g</span>
                                  <span className={MACRO_SURFACES.carbs.label}>C {Math.round(it.carbs)}g</span>
                                  <span className={MACRO_SURFACES.fat.label}>G {Math.round(it.fat)}g</span>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="mt-2 flex items-baseline justify-between gap-2 px-1 text-[11px] tabular-nums">
                            <span className="font-semibold text-white">Total da refeição</span>
                            <span className="text-neutral-300">{Math.round(meal.totals.calories)} kcal · P{Math.round(meal.totals.protein)} C{Math.round(meal.totals.carbs)} G{Math.round(meal.totals.fat)}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => applyMeal(meal, idx)}
                            disabled={applied || applyingIdx !== null}
                            className={`mt-3 tap-44 h-8 w-full rounded-lg text-xs font-bold transition active:scale-[0.98] ${
                              applied
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : 'bg-white/[0.06] border border-white/[0.08] text-white hover:bg-white/[0.1] disabled:opacity-50'
                            }`}
                          >
                            {applied ? '✓ Lançado' : applyingIdx === idx ? 'Lançando...' : '✚ Lançar refeição'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}

                <p className="text-[10px] text-neutral-400 text-center">
                  Macros calculados no servidor. Ajuste as porções ao seu apetite.
                </p>
              </div>
            )}
          </div>
  )

  // Embutido no card de refeição: sem moldura nem cabeçalho — quem abre/fecha é o pai.
  if (embedded) return content

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

        {open && content}
      </div>
    </div>
  )
}
