'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { logMealAction } from '@/app/(app)/dashboard/nutrition/actions'
import type { MealLog } from '@/lib/nutrition/engine'
import { isIosNative } from '@/utils/platform'
import { createClient } from '@/utils/supabase/client'

type Totals = { calories: number; protein: number; carbs: number; fat: number }

type MealEntry = {
  id: string
  created_at: string
  food_name: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

const PERCENT_SCALE = 100

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
  const safeGoal = Math.max(0, safeNumber(goal))
  const ratio = safeGoal > 0 ? safeValue / safeGoal : 0
  const pct = clamp01(ratio)
  const pctValue = Math.round(pct * PERCENT_SCALE)
  const clipping = safeGoal > 0 && ratio > 1
  const barClass = clipping ? 'bg-red-500/70' : 'bg-yellow-500/80'

  return (
    <div className="rounded-2xl bg-neutral-900/70 border border-neutral-800 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-neutral-800/70">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">{label}</div>
        <div
          className={
            clipping
              ? 'mt-2 inline-flex min-w-[46px] justify-center text-[11px] font-semibold leading-none tabular-nums text-red-200 rounded-full px-2 py-1 bg-red-500/10 border border-red-500/20'
              : 'mt-2 inline-flex min-w-[46px] justify-center text-[11px] font-semibold leading-none tabular-nums text-yellow-300 rounded-full px-2 py-1 bg-yellow-500/10 border border-yellow-500/20'
          }
        >
          {pctValue}%
        </div>
      </div>
      <div className="mt-3 text-lg font-semibold text-white">
        {Math.round(safeValue)}
        <span className="text-neutral-500">/{Math.round(safeGoal || 0)}{unit}</span>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-neutral-800/70 overflow-hidden">
        <div className={`h-full ${barClass}`} style={{ width: `${pctValue}%` }} />
      </div>
    </div>
  )
}

export default function NutritionMixer({
  dateKey,
  initialTotals,
  goals,
  schemaMissing,
  canViewMacros,
}: {
  dateKey: string
  initialTotals: Totals
  goals: Totals
  schemaMissing?: boolean
  canViewMacros?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [totals, setTotals] = useState<Totals>({
    calories: safeNumber(initialTotals?.calories),
    protein: safeNumber(initialTotals?.protein),
    carbs: safeNumber(initialTotals?.carbs),
    fat: safeNumber(initialTotals?.fat),
  })
  const [goalsState, setGoalsState] = useState<Totals>({
    calories: safeNumber(goals?.calories),
    protein: safeNumber(goals?.protein),
    carbs: safeNumber(goals?.carbs),
    fat: safeNumber(goals?.fat),
  })
  const safeGoals = useMemo(
    () => ({
      calories: safeNumber(goalsState?.calories),
      protein: safeNumber(goalsState?.protein),
      carbs: safeNumber(goalsState?.carbs),
      fat: safeNumber(goalsState?.fat),
    }),
    [goalsState?.calories, goalsState?.protein, goalsState?.carbs, goalsState?.fat],
  )
  const [entries, setEntries] = useState<MealEntry[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const hideVipCtas = useMemo(() => isIosNative(), [])
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [goalsDraft, setGoalsDraft] = useState<Totals>(() => ({
    calories: safeNumber(goals?.calories),
    protein: safeNumber(goals?.protein),
    carbs: safeNumber(goals?.carbs),
    fat: safeNumber(goals?.fat),
  }))
  const [goalsSaving, setGoalsSaving] = useState(false)
  const [goalsError, setGoalsError] = useState('')
  const [entryBusyId, setEntryBusyId] = useState('')
  const [entriesError, setEntriesError] = useState('')
  const [entriesTick, setEntriesTick] = useState(0)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiUpgrade, setAiUpgrade] = useState(false)
  const [entriesLoading, setEntriesLoading] = useState(false)
  const safeEntries = Array.isArray(entries) ? entries : []
  const hasEntries = safeEntries.length > 0
  const shouldShowBottomCta = Boolean(input.trim()) || hasEntries || isPending
  const calorieRatio = safeGoals.calories > 0 ? safeNumber(totals?.calories) / safeGoals.calories : 0
  const caloriePct = Math.round(clamp01(calorieRatio) * PERCENT_SCALE)
  const calorieClipping = safeGoals.calories > 0 && calorieRatio > 1
  const calorieBarClass = calorieClipping ? 'bg-red-500/70' : 'bg-yellow-500/80'
  const calorieStatusLabel = calorieClipping ? 'Acima da meta' : 'Dentro da meta'
  const calorieStatusClass = calorieClipping
    ? 'text-red-200 bg-red-500/10 border-red-500/20'
    : 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20'

  useEffect(() => {
    setTotals({
      calories: safeNumber(initialTotals?.calories),
      protein: safeNumber(initialTotals?.protein),
      carbs: safeNumber(initialTotals?.carbs),
      fat: safeNumber(initialTotals?.fat),
    })
  }, [initialTotals?.calories, initialTotals?.protein, initialTotals?.carbs, initialTotals?.fat])

  useEffect(() => {
    const next = {
      calories: safeNumber(goals?.calories),
      protein: safeNumber(goals?.protein),
      carbs: safeNumber(goals?.carbs),
      fat: safeNumber(goals?.fat),
    }
    setGoalsState(next)
    setGoalsDraft(next)
  }, [goals?.calories, goals?.protein, goals?.carbs, goals?.fat])

  useEffect(() => {
    if (schemaMissing) {
      setEntries([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        setEntriesLoading(true)
        setEntriesError('')
        const { data, error } = await supabase
          .from('nutrition_meal_entries')
          .select('id, created_at, food_name, calories, protein, carbs, fat')
          .eq('date', dateKey)
          .order('created_at', { ascending: false })
          .limit(20)
        if (cancelled) return
        if (error) throw error
        const list = Array.isArray(data) ? data : []
        const mapped = list
          .map((r: any) => ({
            id: String(r?.id || '').trim(),
            created_at: String(r?.created_at || '').trim(),
            food_name: String(r?.food_name || '').trim(),
            calories: safeNumber(r?.calories),
            protein: safeNumber(r?.protein),
            carbs: safeNumber(r?.carbs),
            fat: safeNumber(r?.fat),
          }))
          .filter((r: MealEntry) => Boolean(r.id))
        setEntries(mapped)
      } catch {
        if (!cancelled) setEntriesError('Falha ao carregar lançamentos.')
      } finally {
        if (!cancelled) setEntriesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dateKey, entriesTick, schemaMissing, supabase])

  const saveGoals = async () => {
    if (goalsSaving) return
    setGoalsSaving(true)
    setGoalsError('')
    try {
      const { data: auth } = await supabase.auth.getUser()
      const userId = String(auth?.user?.id || '').trim()
      if (!userId) {
        setGoalsError('Você precisa estar logado.')
        return
      }
      const { data: latest } = await supabase
        .from('nutrition_goals')
        .select('id')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const payload = {
        user_id: userId,
        calories: safeNumber(goalsDraft.calories),
        protein: safeNumber(goalsDraft.protein),
        carbs: safeNumber(goalsDraft.carbs),
        fat: safeNumber(goalsDraft.fat),
        updated_at: new Date().toISOString(),
      }
      if (latest?.id) {
        const { error } = await supabase.from('nutrition_goals').update(payload).eq('id', latest.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('nutrition_goals').insert(payload)
        if (error) throw error
      }
      setGoalsState({
        calories: safeNumber(goalsDraft.calories),
        protein: safeNumber(goalsDraft.protein),
        carbs: safeNumber(goalsDraft.carbs),
        fat: safeNumber(goalsDraft.fat),
      })
      setGoalsOpen(false)
    } catch (e) {
      setGoalsError(e?.message ? String(e.message) : 'Falha ao salvar metas.')
    } finally {
      setGoalsSaving(false)
    }
  }

  const handleSubmit = () => {
    const text = input.trim()
    if (!text) return

    setError(null)
    startTransition(async () => {
      try {
        const res = await logMealAction(text, dateKey)
        if (!res?.ok) {
          setError(String((res as Record<string, unknown>)?.error || 'Falha ao processar a refeição.'))
          return
        }

        const meal = (res as Record<string, unknown>).meal as MealLog | undefined
        const entry = (res as Record<string, unknown>).entry as any
        if (!meal) {
          setError('Falha ao processar a refeição.')
          return
        }

        if (entry && typeof entry === 'object') {
          const nextTotals = {
            calories: safeNumber(entry?.totals_calories),
            protein: safeNumber(entry?.totals_protein),
            carbs: safeNumber(entry?.totals_carbs),
            fat: safeNumber(entry?.totals_fat),
          }
          if (nextTotals.calories || nextTotals.protein || nextTotals.carbs || nextTotals.fat) setTotals(nextTotals)

          const entryId = String(entry?.entry_id || entry?.id || '').trim()
          const entryCreatedAt = String(entry?.created_at || new Date().toISOString()).trim()
          const entryFoodName = String(entry?.food_name || meal.foodName || 'Refeição').trim()
          const nextEntry: MealEntry = {
            id: entryId || `${Date.now()}`,
            created_at: entryCreatedAt,
            food_name: entryFoodName,
            calories: safeNumber(entry?.calories ?? meal.calories),
            protein: safeNumber(entry?.protein ?? meal.protein),
            carbs: safeNumber(entry?.carbs ?? meal.carbs),
            fat: safeNumber(entry?.fat ?? meal.fat),
          }
          setEntries((prev) => [nextEntry, ...(Array.isArray(prev) ? prev : [])].slice(0, 20))
        } else {
          setTotals((prev) => ({
            calories: safeNumber(prev?.calories) + safeNumber(meal.calories),
            protein: safeNumber(prev?.protein) + safeNumber(meal.protein),
            carbs: safeNumber(prev?.carbs) + safeNumber(meal.carbs),
            fat: safeNumber(prev?.fat) + safeNumber(meal.fat),
          }))
        }

        setInput('')
        try {
          if (typeof queueMicrotask === 'function') queueMicrotask(() => inputRef.current?.focus())
          else setTimeout(() => inputRef.current?.focus(), 0)
        } catch {}
      } catch (e) {
        setError(e?.message || 'Falha ao processar a refeição.')
      }
    })
  }

  const deleteEntry = async (id: string) => {
    const entryId = String(id || '').trim()
    if (!entryId) return
    if (entryBusyId) return
    const ok = typeof window !== 'undefined' ? window.confirm('Remover este lançamento?') : false
    if (!ok) return
    setEntryBusyId(entryId)
    setError(null)
    try {
      const { data, error } = await supabase.rpc('nutrition_delete_meal_entry', { p_entry_id: entryId })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : null
      if (row && typeof row === 'object') {
        setTotals({
          calories: safeNumber((row as any)?.totals_calories),
          protein: safeNumber((row as any)?.totals_protein),
          carbs: safeNumber((row as any)?.totals_carbs),
          fat: safeNumber((row as any)?.totals_fat),
        })
      }
      setEntries((prev) => (Array.isArray(prev) ? prev : []).filter((x) => x.id !== entryId))
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Falha ao remover lançamento.')
    } finally {
      setEntryBusyId('')
    }
  }

  const submitOrFocus = () => {
    const t = input.trim()
    if (t && !isPending && !schemaMissing) {
      handleSubmit()
      return
    }
    try {
      inputRef.current?.focus()
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch {}
  }

  const estimateWithAi = async () => {
    const text = input.trim()
    if (!text) return
    if (schemaMissing) return
    if (aiBusy) return
    setAiBusy(true)
    setAiUpgrade(false)
    setError(null)
    try {
      const res = await fetch('/api/ai/nutrition-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, dateKey }),
      })
      const json = await res.json().catch((): any => null)
      if (!json?.ok) {
        const needsUpgrade = !!json?.upgradeRequired || String(json?.error || '') === 'vip_required'
        setAiUpgrade(needsUpgrade)
        setError(needsUpgrade ? 'Disponível para assinantes VIP Pro.' : String(json?.error || 'Falha ao estimar com IA.'))
        return
      }
      const row = json?.row
      if (row && typeof row === 'object') {
        setTotals({
          calories: safeNumber(row?.totals_calories),
          protein: safeNumber(row?.totals_protein),
          carbs: safeNumber(row?.totals_carbs),
          fat: safeNumber(row?.totals_fat),
        })
        const nextEntry: MealEntry = {
          id: String(row?.entry_id || row?.id || `${Date.now()}`),
          created_at: String(row?.created_at || new Date().toISOString()),
          food_name: String(row?.food_name || 'Refeição'),
          calories: safeNumber(row?.calories),
          protein: safeNumber(row?.protein),
          carbs: safeNumber(row?.carbs),
          fat: safeNumber(row?.fat),
        }
        setEntries((prev) => [nextEntry, ...(Array.isArray(prev) ? prev : [])].slice(0, 20))
      }
      setInput('')
      try {
        inputRef.current?.focus()
      } catch {}
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Falha ao estimar com IA.')
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-neutral-900/90 border border-neutral-800 shadow-[0_22px_60px_rgba(0,0,0,0.55)] p-5 relative overflow-hidden ring-1 ring-neutral-800/70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(234,179,8,0.12),transparent_60%)] opacity-60" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.24em] text-neutral-400">Hoje</div>
            <div className="mt-2 text-4xl font-semibold tracking-tight">
              <span className={calorieClipping ? 'text-red-200' : 'text-white'}>{Math.round(totals.calories)}</span>
              <span className="text-neutral-500"> kcal</span>
            </div>
            <div className="mt-1 text-sm text-neutral-400">
              Meta diária: <span className="text-neutral-200 font-semibold">{Math.round(safeGoals.calories)} kcal</span>
            </div>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] border ${calorieStatusClass}`}>
            {calorieStatusLabel}
          </div>
        </div>

        <div className="mt-4 relative">
          <div className="flex items-center justify-between text-[11px] text-neutral-400">
            <span>Progresso da meta</span>
            <span className="inline-flex items-center rounded-full bg-neutral-900/80 border border-neutral-800/80 px-2 py-0.5 text-[10px] font-semibold text-neutral-200">
              {caloriePct}%
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-neutral-800/70 overflow-hidden">
            <div className={`h-full ${calorieBarClass}`} style={{ width: `${caloriePct}%` }} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {canViewMacros ? (
            <>
              <Meter label="Proteína" unit="g" value={totals.protein} goal={safeGoals.protein} />
              <Meter label="Carbo" unit="g" value={totals.carbs} goal={safeGoals.carbs} />
              <Meter label="Gordura" unit="g" value={totals.fat} goal={safeGoals.fat} />
            </>
          ) : (
            <div className="col-span-3 rounded-2xl bg-neutral-900/60 border border-neutral-800 p-4 ring-1 ring-neutral-800/70">
              <div className="text-sm font-semibold text-white">Macros no plano Pro</div>
              <div className="mt-1 text-xs text-neutral-400">Ative para ver proteína, carbo e gordura detalhados.</div>
              {!hideVipCtas ? (
                <button
                  type="button"
                  onClick={() => (window.location.href = '/marketplace')}
                  className="mt-3 inline-flex items-center justify-center rounded-xl bg-yellow-500 text-black font-semibold px-4 py-2 shadow-lg shadow-yellow-500/20 active:scale-95 transition duration-300"
                >
                  Ver planos
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl bg-neutral-900/85 border border-neutral-800 shadow-[0_18px_45px_rgba(0,0,0,0.5)] p-5 relative overflow-hidden ring-1 ring-neutral-800/70">
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent" />
        <div className="text-[10px] uppercase tracking-[0.24em] text-neutral-400">Adicionar refeição</div>
        <div className="mt-2 text-sm font-semibold text-white">Descreva sua refeição</div>
        <div className="mt-1 text-xs text-neutral-400">Ex.: 150g frango + 100g arroz</div>
        <div className="mt-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if ((e as any).shiftKey) return
                e.preventDefault()
                if (!isPending && !schemaMissing) handleSubmit()
              }
            }}
            disabled={isPending || !!schemaMissing}
            rows={3}
            className="w-full rounded-2xl bg-neutral-950/70 border border-neutral-800 px-4 py-3 text-sm font-semibold text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/40 resize-none shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
            placeholder={schemaMissing ? 'Nutrição não configurada no banco.' : 'Digite sua refeição...'}
          />
        </div>

        {schemaMissing ? (
          <div className="mt-3 rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-4 text-sm text-yellow-100">
            Aplique as migrations <span className="font-semibold">20251227120000_nutrition_core.sql</span> e{' '}
            <span className="font-semibold">20260217190000_nutrition_meal_entries.sql</span> no Supabase.
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200 ring-1 ring-red-500/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">{error}</div>
              {aiUpgrade ? (
                <button
                  type="button"
                  onClick={() => (window.location.href = '/marketplace')}
                  className="shrink-0 rounded-xl bg-yellow-500 px-3 py-2 text-xs font-semibold text-black hover:bg-yellow-400"
                >
                  Ver planos
                </button>
              ) : null}
            </div>
            {String(error).startsWith('Não reconheci:') && !aiUpgrade ? (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={estimateWithAi}
                  disabled={aiBusy}
                  className="rounded-xl bg-neutral-950/60 border border-neutral-800/60 px-3 py-2 text-xs font-semibold text-neutral-100 hover:bg-neutral-950 disabled:opacity-60"
                >
                  {aiBusy ? 'Estimando...' : 'Estimar com IA'}
                </button>
                {!hideVipCtas ? <div className="text-xs text-neutral-300">VIP Pro</div> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl bg-neutral-900/85 border border-neutral-800 shadow-[0_18px_45px_rgba(0,0,0,0.5)] p-5 ring-1 ring-neutral-800/70">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.24em] text-neutral-400">Lançamentos</div>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setEntriesTick((v) => v + 1)} className="text-xs text-yellow-400 hover:text-yellow-300 transition">
              Atualizar
            </button>
            <button type="button" onClick={() => setGoalsOpen((v) => !v)} className="text-xs text-neutral-300 hover:text-white transition">
              {goalsOpen ? 'Fechar metas' : 'Metas'}
            </button>
          </div>
        </div>

        {goalsOpen ? (
          <div className="mt-4 rounded-2xl bg-neutral-950/80 border border-neutral-800 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)] ring-1 ring-neutral-800/80">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Calorias (kcal)</div>
                <input
                  value={String(goalsDraft.calories)}
                  onChange={(e) => setGoalsDraft((p) => ({ ...p, calories: safeNumber(e.target.value) }))}
                  inputMode="numeric"
                  className="w-full rounded-2xl bg-neutral-900/90 border border-neutral-800 px-3 py-3 text-neutral-100 font-semibold"
                  placeholder="2000"
                  aria-label="Meta de calorias"
                />
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Proteína (g)</div>
                <input
                  value={String(goalsDraft.protein)}
                  onChange={(e) => setGoalsDraft((p) => ({ ...p, protein: safeNumber(e.target.value) }))}
                  inputMode="numeric"
                  className="w-full rounded-2xl bg-neutral-900/90 border border-neutral-800 px-3 py-3 text-neutral-100 font-semibold"
                  placeholder="150"
                  aria-label="Meta de proteína"
                  disabled={!canViewMacros}
                />
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Carboidratos (g)</div>
                <input
                  value={String(goalsDraft.carbs)}
                  onChange={(e) => setGoalsDraft((p) => ({ ...p, carbs: safeNumber(e.target.value) }))}
                  inputMode="numeric"
                  className="w-full rounded-2xl bg-neutral-900/90 border border-neutral-800 px-3 py-3 text-neutral-100 font-semibold"
                  placeholder="200"
                  aria-label="Meta de carboidratos"
                  disabled={!canViewMacros}
                />
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Gordura (g)</div>
                <input
                  value={String(goalsDraft.fat)}
                  onChange={(e) => setGoalsDraft((p) => ({ ...p, fat: safeNumber(e.target.value) }))}
                  inputMode="numeric"
                  className="w-full rounded-2xl bg-neutral-900/90 border border-neutral-800 px-3 py-3 text-neutral-100 font-semibold"
                  placeholder="60"
                  aria-label="Meta de gordura"
                  disabled={!canViewMacros}
                />
              </div>
            </div>
            {goalsError ? <div className="mt-3 text-sm text-red-200">{goalsError}</div> : null}
            {!canViewMacros && !hideVipCtas ? <div className="mt-3 text-xs text-neutral-400">Macros liberado no VIP Pro.</div> : null}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setGoalsOpen(false)} className="rounded-2xl bg-neutral-900/90 border border-neutral-800 px-4 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition">
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveGoals}
                disabled={goalsSaving}
                className="rounded-2xl bg-yellow-500 px-4 py-2 text-xs font-semibold text-black hover:bg-yellow-400 disabled:opacity-60 shadow-lg shadow-yellow-500/20 active:scale-95 transition duration-300"
              >
                {goalsSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        ) : null}

        {entriesError ? (
          <div className="mt-3 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200 flex items-center justify-between gap-3 ring-1 ring-red-500/10">
            <div className="min-w-0">{entriesError}</div>
            <button
              type="button"
              onClick={() => setEntriesTick((v) => v + 1)}
              className="shrink-0 rounded-xl bg-neutral-900/60 border border-neutral-800/60 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {entriesLoading ? (
            <div className="rounded-2xl bg-neutral-950/70 border border-neutral-800 p-5 ring-1 ring-neutral-800/70">
              <div className="h-4 w-32 rounded bg-neutral-800/70 animate-pulse" />
              <div className="mt-3 h-3 w-56 rounded bg-neutral-800/60 animate-pulse" />
              <div className="mt-5 h-12 rounded-2xl bg-neutral-800/40 border border-neutral-800/60 animate-pulse" />
            </div>
          ) : safeEntries.length === 0 ? (
            <div className="rounded-2xl bg-neutral-950/70 border border-neutral-800 p-5 text-center ring-1 ring-neutral-800/70">
              <div className="text-sm font-semibold text-white">Sem refeições hoje</div>
              <div className="mt-1 text-xs text-neutral-400">Adicione um lançamento para começar.</div>
              <button
                type="button"
                onClick={submitOrFocus}
                className="mt-4 inline-flex items-center justify-center rounded-2xl bg-neutral-900/80 border border-neutral-800 text-white font-semibold px-4 py-2 hover:bg-neutral-900 active:scale-95 transition duration-300"
              >
                Adicionar refeição
              </button>
            </div>
          ) : (
            safeEntries.map((item) => (
              <div key={item.id} className="rounded-2xl bg-neutral-950/70 border border-neutral-800 p-4 ring-1 ring-neutral-800/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{item.food_name}</div>
                    <div className="mt-1 text-xs text-neutral-400">
                      {formatClock(item.created_at)} · P {Math.round(item.protein)}g · C {Math.round(item.carbs)}g · G {Math.round(item.fat)}g
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-neutral-200 whitespace-nowrap">{Math.round(item.calories)} kcal</div>
                    <button
                      type="button"
                      disabled={entryBusyId === item.id}
                      onClick={() => deleteEntry(item.id)}
                      className="h-9 px-3 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
                    >
                      {entryBusyId === item.id ? '...' : 'Remover'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {shouldShowBottomCta ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/85 backdrop-blur border-t border-neutral-800/60">
          <div className="mx-auto max-w-md px-4 py-3">
            <button
              type="button"
              onClick={submitOrFocus}
              disabled={!!schemaMissing}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-yellow-400 to-yellow-500 text-black font-semibold shadow-lg shadow-yellow-500/30 hover:from-yellow-300 hover:to-yellow-400 active:scale-95 transition duration-300 disabled:opacity-60 tracking-wide"
            >
              {isPending ? 'Processando...' : input.trim() ? 'Lançar refeição' : 'Adicionar refeição'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
