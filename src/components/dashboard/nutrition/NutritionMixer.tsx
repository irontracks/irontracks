'use client'

import { useEffect, useMemo, useRef, useState, useTransition, useCallback } from 'react'
import { logMealAction } from '@/app/(app)/dashboard/nutrition/actions'
import type { MealLog } from '@/lib/nutrition/engine'
import { useIsIosNative } from '@/hooks/useIsIosNative'
import { createClient } from '@/utils/supabase/client'
import { getErrorMessage } from '@/utils/errorMessage'
import dynamic from 'next/dynamic'

// ── Lazy sub-components ────────────────────────────────────────────────────────
const CalorieTimeline = dynamic(() => import('./CalorieTimeline'), { ssr: false })
const MacroPieChart = dynamic(() => import('./MacroPieChart'), { ssr: false })
const NutritionDayScore = dynamic(() => import('./NutritionDayScore'), { ssr: false })
const NutritionEntryCard = dynamic(() => import('./NutritionEntryCard'), { ssr: false })
const WaterTracker = dynamic(() => import('./WaterTracker'), { ssr: false })
const FavoriteMeals = dynamic(() => import('./FavoriteMeals'), { ssr: false })
const SmartSuggestions = dynamic(() => import('./SmartSuggestions'), { ssr: false })
const DateNavigator = dynamic(() => import('./DateNavigator'), { ssr: false })
const CustomFoodScanner = dynamic(() => import('./CustomFoodScanner'), { ssr: false })
const CustomFoodLibrary = dynamic(() => import('./CustomFoodLibrary'), { ssr: false })
const NutritionWorkoutCorrelation = dynamic(() => import('./NutritionWorkoutCorrelation'), { ssr: false })

// ── Hooks ──────────────────────────────────────────────────────────────────────
import { useFavoriteMeals } from './useFavoriteMeals'
import { useCustomFoods } from './useCustomFoods'

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

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

// ── Animated ring SVG ──────────────────────────────────────────────────────────
function CalorieRing({ pct, size = 140, strokeWidth = 10 }: { pct: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - clamp01(pct / 100))
  const over = pct > 100

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={over ? '#ef4444' : 'url(#calorieGrad)'}
        strokeWidth={strokeWidth}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700 ease-out"
      />
      <defs>
        <linearGradient id="calorieGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// ── Compact Macro Bar ──────────────────────────────────────────────────────────
function MacroBar({ label, value, goal, color, accent }: { label: string; value: number; goal: number; color: string; accent: string }) {
  const sVal = safeNumber(value)
  const sGoal = Math.max(1, safeNumber(goal))
  const pct = Math.round(clamp01(sVal / sGoal) * 100)
  const over = sVal > sGoal

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{label}</span>
        <span className={`text-xs font-bold tabular-nums ${over ? 'text-red-400' : accent}`}>
          {Math.round(sVal)}<span className="text-neutral-600">/{Math.round(sGoal)}g</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: over ? '#ef4444' : color }}
        />
      </div>
    </div>
  )
}

// ── Section Card wrapper ───────────────────────────────────────────────────────
function Card({ children, className = '', glow }: { children: React.ReactNode; className?: string; glow?: string }) {
  return (
    <div className={`relative rounded-2xl bg-neutral-900/80 border border-white/[0.06] backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden ${className}`}>
      {glow && <div className={`absolute inset-0 pointer-events-none ${glow}`} />}
      <div className="relative">{children}</div>
    </div>
  )
}

// ── Quick Action Button ────────────────────────────────────────────────────────
function QuickAction({ icon, label, onClick, active }: { icon: string; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl transition-all duration-200 active:scale-95 min-w-[64px]
        ${active
          ? 'bg-yellow-500/15 border border-yellow-500/30 shadow-[0_0_12px_rgba(250,204,21,0.1)]'
          : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06]'
        }`}
    >
      <span className="text-lg">{icon}</span>
      <span className={`text-[9px] uppercase tracking-[0.15em] font-semibold ${active ? 'text-yellow-300' : 'text-neutral-500'}`}>{label}</span>
    </button>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════════
export default function NutritionMixer({
  dateKey,
  initialTotals,
  goals,
  schemaMissing,
  canViewMacros,
  workoutCaloriesToday,
  goalsSource,
}: {
  dateKey: string
  initialTotals: Totals
  goals: Totals
  schemaMissing?: boolean
  canViewMacros?: boolean
  workoutCaloriesToday?: number
  goalsSource?: 'saved' | 'profile' | 'default'
}) {
  const supabase = useMemo(() => createClient(), [])
  const hideVipCtas = useIsIosNative()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | undefined>()
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) setUserId(data.user.id)
    }).catch(() => {})
  }, [supabase])

  // ── Core state ────────────────────────────────────────────────────────────
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
  const safeGoals = useMemo(() => ({
    calories: safeNumber(goalsState?.calories),
    protein: safeNumber(goalsState?.protein),
    carbs: safeNumber(goalsState?.carbs),
    fat: safeNumber(goalsState?.fat),
  }), [goalsState?.calories, goalsState?.protein, goalsState?.carbs, goalsState?.fat])

  const [entries, setEntries] = useState<MealEntry[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [entriesTick, setEntriesTick] = useState(0)
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [entriesError, setEntriesError] = useState('')
  const [entryBusyId, setEntryBusyId] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiUpgrade, setAiUpgrade] = useState(false)

  // Entry detail state
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ food_name: string; calories: number; protein: number; carbs: number; fat: number } | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Goals editor
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [goalsDraft, setGoalsDraft] = useState<Totals>(() => ({
    calories: safeNumber(goals?.calories), protein: safeNumber(goals?.protein),
    carbs: safeNumber(goals?.carbs), fat: safeNumber(goals?.fat),
  }))
  const [goalsSaving, setGoalsSaving] = useState(false)
  const [goalsError, setGoalsError] = useState('')

  // ── Date navigation ───────────────────────────────────────────────────────
  const [currentDateKey, setCurrentDateKey] = useState(dateKey)
  const todayDate = useMemo(() => {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
    catch { return new Date().toISOString().slice(0, 10) }
  }, [])
  const isToday = currentDateKey === todayDate

  // ── Panel toggles ────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<'none' | 'scanner' | 'library' | 'favorites' | 'water'>('none')
  const togglePanel = useCallback((p: typeof activePanel) => setActivePanel(prev => prev === p ? 'none' : p), [])

  // ── Hooks ────────────────────────────────────────────────────────────────
  const { favorites, loading: favoritesLoading, deleteFavorite, saveFavorite } = useFavoriteMeals(userId)
  const { foods: customFoods, loading: customFoodsLoading, saving: scannerSaving, saveFood: scannerSaveFood, deleteFood: deleteCustomFood } = useCustomFoods(userId)

  // ── Derived ──────────────────────────────────────────────────────────────
  const safeEntries = Array.isArray(entries) ? entries : []
  const calorieRatio = safeGoals.calories > 0 ? safeNumber(totals?.calories) / safeGoals.calories : 0
  const caloriePct = Math.round(clamp01(calorieRatio) * PERCENT_SCALE)
  const calorieOver = safeGoals.calories > 0 && calorieRatio > 1
  const remaining = Math.max(0, safeGoals.calories - safeNumber(totals?.calories))

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setTotals({ calories: safeNumber(initialTotals?.calories), protein: safeNumber(initialTotals?.protein), carbs: safeNumber(initialTotals?.carbs), fat: safeNumber(initialTotals?.fat) })
  }, [initialTotals?.calories, initialTotals?.protein, initialTotals?.carbs, initialTotals?.fat])

  useEffect(() => {
    const next = { calories: safeNumber(goals?.calories), protein: safeNumber(goals?.protein), carbs: safeNumber(goals?.carbs), fat: safeNumber(goals?.fat) }
    setGoalsState(next); setGoalsDraft(next)
  }, [goals?.calories, goals?.protein, goals?.carbs, goals?.fat])

  // Midnight auto-reset (São Paulo)
  useEffect(() => {
    const iv = setInterval(() => {
      try {
        const now = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
        if (now !== currentDateKey) {
          setCurrentDateKey(now); setEntries([]); setTotals({ calories: 0, protein: 0, carbs: 0, fat: 0 }); setEntriesTick(v => v + 1)
        }
      } catch {}
    }, 60_000)
    return () => clearInterval(iv)
  }, [currentDateKey])

  // Fetch entries
  useEffect(() => {
    if (schemaMissing) { setEntries([]); return }
    let cancelled = false
    ;(async () => {
      try {
        setEntriesLoading(true); setEntriesError('')
        const { data, error } = await supabase
          .from('nutrition_meal_entries')
          .select('id, created_at, food_name, calories, protein, carbs, fat')
          .eq('date', currentDateKey)
          .order('created_at', { ascending: false })
          .limit(30)
        if (cancelled) return
        if (error) throw error
        const mapped = (Array.isArray(data) ? data : [])
          .map((r: Record<string, unknown>) => ({
            id: String(r?.id || ''), created_at: String(r?.created_at || ''),
            food_name: String(r?.food_name || ''),
            calories: safeNumber(r?.calories), protein: safeNumber(r?.protein),
            carbs: safeNumber(r?.carbs), fat: safeNumber(r?.fat),
          }))
          .filter((r: MealEntry) => Boolean(r.id))
        setEntries(mapped)
        if (mapped.length > 0) {
          setTotals(mapped.reduce((a, e) => ({ calories: a.calories + e.calories, protein: a.protein + e.protein, carbs: a.carbs + e.carbs, fat: a.fat + e.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 }))
        }
      } catch { if (!cancelled) setEntriesError('Falha ao carregar lançamentos.') }
      finally { if (!cancelled) setEntriesLoading(false) }
    })()
    return () => { cancelled = true }
  }, [currentDateKey, entriesTick, schemaMissing, supabase])

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    const text = input.trim()
    if (!text) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await logMealAction(text, currentDateKey)
        if (!res?.ok) { setError(String((res as Record<string, unknown>)?.error || 'Falha ao processar.')); return }
        const meal = (res as Record<string, unknown>).meal as MealLog | undefined
        const entry = (res as Record<string, unknown>).entry as unknown
        if (!meal) { setError('Falha ao processar.'); return }
        if (entry && typeof entry === 'object') {
          const e = entry as Record<string, unknown>
          const nt = { calories: safeNumber(e?.totals_calories), protein: safeNumber(e?.totals_protein), carbs: safeNumber(e?.totals_carbs), fat: safeNumber(e?.totals_fat) }
          if (nt.calories || nt.protein || nt.carbs || nt.fat) setTotals(nt)
          setEntries(prev => [{ id: String(e?.entry_id || e?.id || Date.now()), created_at: String(e?.created_at || new Date().toISOString()), food_name: String(e?.food_name || meal.foodName || 'Refeição'), calories: safeNumber(e?.calories ?? meal.calories), protein: safeNumber(e?.protein ?? meal.protein), carbs: safeNumber(e?.carbs ?? meal.carbs), fat: safeNumber(e?.fat ?? meal.fat) }, ...(Array.isArray(prev) ? prev : [])].slice(0, 30))
        } else {
          setTotals(prev => ({ calories: safeNumber(prev?.calories) + safeNumber(meal.calories), protein: safeNumber(prev?.protein) + safeNumber(meal.protein), carbs: safeNumber(prev?.carbs) + safeNumber(meal.carbs), fat: safeNumber(prev?.fat) + safeNumber(meal.fat) }))
        }
        setInput('')
        try { queueMicrotask(() => inputRef.current?.focus()) } catch {}
      } catch (e: unknown) { setError(getErrorMessage(e) || 'Falha ao processar.') }
    })
  }

  const deleteEntry = async (id: string) => {
    if (!id || entryBusyId) return
    setEntryBusyId(id); setError(null)
    try {
      const { data, error } = await supabase.rpc('nutrition_delete_meal_entry', { p_entry_id: id })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : null
      if (row && typeof row === 'object') {
        setTotals({ calories: safeNumber((row as Record<string, unknown>)?.totals_calories), protein: safeNumber((row as Record<string, unknown>)?.totals_protein), carbs: safeNumber((row as Record<string, unknown>)?.totals_carbs), fat: safeNumber((row as Record<string, unknown>)?.totals_fat) })
      }
      setEntries(prev => prev.filter(x => x.id !== id))
    } catch (e: unknown) { setError(getErrorMessage(e) || 'Falha ao remover.') }
    finally { setEntryBusyId('') }
  }

  const estimateWithAi = async () => {
    const text = input.trim()
    if (!text || schemaMissing || aiBusy) return
    setAiBusy(true); setAiUpgrade(false); setError(null)
    try {
      const res = await fetch('/api/ai/nutrition-estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, dateKey: currentDateKey }) })
      const json = await res.json().catch((): null => null)
      if (!json?.ok) {
        const up = !!json?.upgradeRequired || String(json?.error || '') === 'vip_required'
        setAiUpgrade(up); setError(up ? 'Disponível para assinantes VIP Pro.' : String(json?.error || 'Falha ao estimar com IA.')); return
      }
      const row = json?.row
      if (row && typeof row === 'object') {
        setTotals({ calories: safeNumber(row?.totals_calories), protein: safeNumber(row?.totals_protein), carbs: safeNumber(row?.totals_carbs), fat: safeNumber(row?.totals_fat) })
        setEntries(prev => [{ id: String(row?.entry_id || row?.id || Date.now()), created_at: String(row?.created_at || new Date().toISOString()), food_name: String(row?.food_name || 'Refeição'), calories: safeNumber(row?.calories), protein: safeNumber(row?.protein), carbs: safeNumber(row?.carbs), fat: safeNumber(row?.fat) }, ...(Array.isArray(prev) ? prev : [])].slice(0, 30))
      }
      setInput(''); try { inputRef.current?.focus() } catch {}
    } catch (e: unknown) { setError(getErrorMessage(e) || 'Falha ao estimar com IA.') }
    finally { setAiBusy(false) }
  }

  const saveGoals = async () => {
    if (goalsSaving) return
    setGoalsSaving(true); setGoalsError('')
    try {
      const { data: auth } = await supabase.auth.getUser()
      const uid = String(auth?.user?.id || '')
      if (!uid) { setGoalsError('Não logado.'); return }
      const { data: latest } = await supabase.from('nutrition_goals').select('id').eq('user_id', uid).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      const payload = { user_id: uid, calories: safeNumber(goalsDraft.calories), protein: safeNumber(goalsDraft.protein), carbs: safeNumber(goalsDraft.carbs), fat: safeNumber(goalsDraft.fat), updated_at: new Date().toISOString() }
      if (latest?.id) { const { error } = await supabase.from('nutrition_goals').update(payload).eq('id', latest.id); if (error) throw error }
      else { const { error } = await supabase.from('nutrition_goals').insert(payload); if (error) throw error }
      setGoalsState({ calories: safeNumber(goalsDraft.calories), protein: safeNumber(goalsDraft.protein), carbs: safeNumber(goalsDraft.carbs), fat: safeNumber(goalsDraft.fat) })
      setGoalsOpen(false)
    } catch (e: unknown) { setGoalsError(getErrorMessage(e) || 'Falha ao salvar metas.') }
    finally { setGoalsSaving(false) }
  }

  const handleFavoriteSelect = useCallback((mealText: string) => { setInput(mealText); try { inputRef.current?.focus() } catch {} }, [])
  const handleDateChange = useCallback((d: string) => { setCurrentDateKey(d); setEntries([]); setTotals({ calories: 0, protein: 0, carbs: 0, fat: 0 }); setEntriesTick(v => v + 1) }, [])

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4 pb-24">

      {/* ── Date Navigator ──────────────────────────────────────────────── */}
      <DateNavigator currentDate={currentDateKey} todayDate={todayDate} onDateChange={handleDateChange} />

      {/* ══ HERO — Calorie Ring + Summary ════════════════════════════════ */}
      <Card glow="bg-[radial-gradient(ellipse_at_top,_rgba(250,204,21,0.08),transparent_60%)]" className="p-5">
        <div className="flex items-center gap-5">
          {/* Ring */}
          <div className="relative">
            <CalorieRing pct={caloriePct} size={120} strokeWidth={8} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-bold tabular-nums ${calorieOver ? 'text-red-400' : 'text-white'}`}>
                {Math.round(totals.calories)}
              </span>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">kcal</span>
            </div>
          </div>

          {/* Summary */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded-full border ${calorieOver ? 'text-red-300 bg-red-500/10 border-red-500/20' : 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20'}`}>
                {calorieOver ? 'Acima da meta' : `${caloriePct}%`}
              </span>
            </div>
            <div className="text-xs text-neutral-400">
              Meta: <span className="text-neutral-200 font-semibold">{Math.round(safeGoals.calories)} kcal</span>
            </div>
            {!calorieOver && remaining > 0 && (
              <div className="text-xs text-neutral-500">
                Restam <span className="text-emerald-400 font-semibold">{Math.round(remaining)}</span> kcal
              </div>
            )}

            {/* Workout burn */}
            {safeNumber(workoutCaloriesToday) > 0 && (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-orange-400">🔥 -{Math.round(safeNumber(workoutCaloriesToday))} kcal treino</span>
                <span className="text-[10px] text-blue-400">⚖ {Math.round(safeNumber(totals?.calories) - safeNumber(workoutCaloriesToday))} líquido</span>
              </div>
            )}
          </div>
        </div>

        {goalsSource === 'profile' && (
          <div className="mt-3 text-[10px] text-neutral-600 text-center">Meta via TDEE do perfil • <button type="button" onClick={() => setGoalsOpen(true)} className="text-yellow-500 hover:text-yellow-400">Ajustar</button></div>
        )}
      </Card>

      {/* ══ MACROS ═══════════════════════════════════════════════════════ */}
      {canViewMacros ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-semibold">Macronutrientes</span>
            <button type="button" onClick={() => setGoalsOpen(v => !v)} className="text-[10px] text-yellow-500 hover:text-yellow-400 uppercase tracking-wider font-bold">
              {goalsOpen ? '✕ Fechar' : '⚙ Metas'}
            </button>
          </div>
          <MacroBar label="Proteína" value={totals.protein} goal={safeGoals.protein} color="#3b82f6" accent="text-blue-400" />
          <MacroBar label="Carboidratos" value={totals.carbs} goal={safeGoals.carbs} color="#f59e0b" accent="text-amber-400" />
          <MacroBar label="Gordura" value={totals.fat} goal={safeGoals.fat} color="#ef4444" accent="text-red-400" />

          {/* Goals editor inline */}
          {goalsOpen && (
            <div className="mt-2 pt-3 border-t border-white/[0.06] space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {(['calories', 'protein', 'carbs', 'fat'] as const).map(f => (
                  <div key={f} className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">
                      {f === 'calories' ? 'Calorias (kcal)' : f === 'protein' ? 'Proteína (g)' : f === 'carbs' ? 'Carboidratos (g)' : 'Gordura (g)'}
                    </label>
                    <input
                      value={String(goalsDraft[f])}
                      aria-label={f === 'calories' ? 'Calorias (kcal)' : f === 'protein' ? 'Proteína (g)' : f === 'carbs' ? 'Carboidratos (g)' : 'Gordura (g)'}
                      onChange={e => setGoalsDraft(p => ({ ...p, [f]: safeNumber(e.target.value) }))}
                      inputMode="numeric"
                      disabled={f !== 'calories' && !canViewMacros}
                      className="w-full h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 text-sm text-white font-semibold focus:border-yellow-500/40 focus:outline-none transition disabled:opacity-40"
                    />
                  </div>
                ))}
              </div>
              {goalsError && <div className="text-xs text-red-400">{goalsError}</div>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setGoalsOpen(false)} className="h-8 px-3 rounded-lg text-xs text-neutral-400 hover:text-white transition">Cancelar</button>
                <button type="button" onClick={saveGoals} disabled={goalsSaving} className="h-8 px-4 rounded-lg bg-yellow-500 text-black text-xs font-bold hover:bg-yellow-400 disabled:opacity-50 active:scale-95 transition">
                  {goalsSaving ? '...' : 'Salvar'}
                </button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-4">
          <div className="text-sm font-semibold text-white">Macros no plano Pro</div>
          <div className="mt-1 text-xs text-neutral-500">Ative para acompanhar proteína, carbo e gordura.</div>
          {!hideVipCtas && (
            <button type="button" onClick={() => (window.location.href = '/marketplace')} className="mt-3 h-9 px-4 rounded-lg bg-yellow-500 text-black text-xs font-bold hover:bg-yellow-400 active:scale-95 transition">
              Ver planos
            </button>
          )}
        </Card>
      )}

      {/* ══ CHARTS ROW (Day Score + Pie) ═════════════════════════════════ */}
      {canViewMacros && safeEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3"><NutritionDayScore totals={totals} goals={safeGoals} /></Card>
          <Card className="p-3"><MacroPieChart protein={totals.protein} carbs={totals.carbs} fat={totals.fat} /></Card>
        </div>
      )}

      {/* ══ CALORIE TIMELINE ═════════════════════════════════════════════ */}
      {safeEntries.length > 0 && (
        <Card className="p-4"><CalorieTimeline entries={safeEntries} /></Card>
      )}

      {/* ══ TREINO × NUTRIÇÃO CORRELATION ════════════════════════════════ */}
      <NutritionWorkoutCorrelation />

      {/* ══ QUICK ACTIONS ════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
        <QuickAction icon="📷" label="Scanner" onClick={() => togglePanel('scanner')} active={activePanel === 'scanner'} />
        <QuickAction icon="📚" label="Biblioteca" onClick={() => togglePanel('library')} active={activePanel === 'library'} />
        <QuickAction icon="⭐" label="Favoritos" onClick={() => togglePanel('favorites')} active={activePanel === 'favorites'} />
        <QuickAction icon="💧" label="Água" onClick={() => togglePanel('water')} active={activePanel === 'water'} />
      </div>

      {/* ── Scanner Panel ─────────────────────────────────────────────── */}
      {activePanel === 'scanner' && (
        <CustomFoodScanner
          saving={scannerSaving}
          onSave={scannerSaveFood}
          onClose={() => setActivePanel('none')}
        />
      )}

      {/* ── Library Panel ─────────────────────────────────────────────── */}
      {activePanel === 'library' && (
        <Card className="p-4">
          <CustomFoodLibrary
            foods={customFoods}
            loading={customFoodsLoading}
            onUse={handleFavoriteSelect}
            onDelete={deleteCustomFood}
            onScan={() => setActivePanel('scanner')}
          />
        </Card>
      )}

      {/* ── Favorites Panel ───────────────────────────────────────────── */}
      {activePanel === 'favorites' && (
        <Card className="p-4">
          <FavoriteMeals
            favorites={favorites}
            loading={favoritesLoading}
            onSelect={handleFavoriteSelect}
            onDelete={deleteFavorite}
            onSave={saveFavorite}
            currentInput={input}
          />
        </Card>
      )}

      {/* ── Water Panel ───────────────────────────────────────────────── */}
      {activePanel === 'water' && (
        <Card className="p-4">
          <WaterTracker initialMl={0} onUpdate={() => {}} />
        </Card>
      )}

      {/* ══ AI SUGGESTIONS ═══════════════════════════════════════════════ */}
      {safeGoals.calories > 0 && isToday && (
        <SmartSuggestions goals={safeGoals} consumed={totals} onSelect={handleFavoriteSelect} />
      )}

      {/* ══ MEAL INPUT ═══════════════════════════════════════════════════ */}
      {isToday && (
        <Card glow="bg-[linear-gradient(180deg,rgba(250,204,21,0.04)_0%,transparent_50%)]" className="p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-semibold">Adicionar refeição</div>
          <div className="mt-1 text-xs text-neutral-600">Ex.: 150g frango + arroz branco + salada</div>
          <textarea
            ref={inputRef}
            aria-label="Adicionar refeição"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isPending && !schemaMissing) handleSubmit() } }}
            disabled={isPending || !!schemaMissing}
            rows={2}
            className="mt-3 w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-yellow-500/30 focus:ring-1 focus:ring-yellow-500/20 resize-none transition"
            placeholder={schemaMissing ? 'Nutrição não configurada.' : 'O que você comeu?'}
          />

          {/* Submit row */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!input.trim() || isPending || !!schemaMissing}
              className="flex-1 h-10 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-bold text-sm shadow-lg shadow-yellow-500/20 hover:from-yellow-300 hover:to-amber-400 active:scale-[0.98] transition disabled:opacity-40 disabled:shadow-none"
            >
              {isPending ? 'Processando...' : '✚ Lançar'}
            </button>
          </div>

          {/* Schema missing */}
          {schemaMissing && (
            <div className="mt-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-200">
              Aplique as migrations do Supabase.
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
              <div className="flex items-start justify-between gap-2">
                <span>{error}</span>
                {aiUpgrade && !hideVipCtas && (
                  <button type="button" onClick={() => (window.location.href = '/marketplace')} className="shrink-0 text-[10px] font-bold text-yellow-400 hover:text-yellow-300">VIP Pro →</button>
                )}
              </div>
              {String(error).startsWith('Não reconheci:') && !aiUpgrade && (
                <button type="button" onClick={estimateWithAi} disabled={aiBusy} className="mt-2 h-8 px-3 rounded-lg bg-white/[0.06] border border-white/[0.08] text-xs font-semibold text-white hover:bg-white/[0.1] disabled:opacity-50 transition">
                  {aiBusy ? 'Estimando...' : '🤖 Estimar com IA'}
                </button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ══ ENTRIES LIST ═════════════════════════════════════════════════ */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-semibold">
            Lançamentos {!isToday && `• ${currentDateKey}`}
          </span>
          <button type="button" onClick={() => setEntriesTick(v => v + 1)} className="text-[10px] text-yellow-500 hover:text-yellow-400 uppercase tracking-wider font-bold">
            ↻ Atualizar
          </button>
        </div>

        {entriesError && (
          <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300 flex items-center justify-between gap-2">
            <span>{entriesError}</span>
            <button type="button" onClick={() => setEntriesTick(v => v + 1)} className="text-[10px] text-neutral-300 hover:text-white font-bold">Retry</button>
          </div>
        )}

        <div className="space-y-2">
          {entriesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4 animate-pulse">
                  <div className="h-4 w-32 rounded bg-white/[0.06]" />
                  <div className="mt-2 h-3 w-48 rounded bg-white/[0.04]" />
                </div>
              ))}
            </div>
          ) : safeEntries.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🍽️</div>
              <div className="text-sm text-neutral-400 font-medium">Nenhuma refeição {isToday ? 'hoje' : 'neste dia'}</div>
              <div className="text-xs text-neutral-600 mt-1">Adicione um lançamento para começar</div>
            </div>
          ) : (
            safeEntries.map(item => (
              <NutritionEntryCard
                key={item.id}
                item={item}
                isExpanded={expandedEntryId === item.id}
                onToggleExpand={(id: string) => setExpandedEntryId(id || null)}
                editingId={editingEntryId || ''}
                editDraft={editDraft || { food_name: '', calories: 0, protein: 0, carbs: 0, fat: 0 }}
                editBusy={editBusy}
                onStartEdit={(entry) => { setEditingEntryId(entry.id); setEditDraft({ food_name: entry.food_name, calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat }) }}
                onCancelEdit={() => { setEditingEntryId(null); setEditDraft(null) }}
                onSaveEdit={async () => {
                  if (!editingEntryId || !editDraft) return
                  setEditBusy(true)
                  try {
                    const { error } = await supabase.from('nutrition_meal_entries').update({ food_name: editDraft.food_name, calories: editDraft.calories, protein: editDraft.protein, carbs: editDraft.carbs, fat: editDraft.fat }).eq('id', editingEntryId)
                    if (error) throw error
                    setEditingEntryId(null); setEditDraft(null); setEntriesTick(v => v + 1)
                  } catch (e: unknown) { setError(getErrorMessage(e) || 'Falha ao editar.') }
                  finally { setEditBusy(false) }
                }}
                onEditDraftChange={(updater) => setEditDraft(prev => prev ? updater(prev) : prev)}
                confirmDeleteId={confirmDeleteId || ''}
                entryBusyId={entryBusyId}
                onConfirmDelete={(id: string) => setConfirmDeleteId(id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onDelete={(id: string) => { setConfirmDeleteId(null); deleteEntry(id) }}
              />
            ))
          )}
        </div>
      </Card>

      {/* ══ FLOATING CTA ═════════════════════════════════════════════════ */}
      {isToday && (input.trim() || isPending) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/90 backdrop-blur-lg border-t border-white/[0.06]">
          <div className="mx-auto max-w-md px-4 py-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!!schemaMissing || !input.trim()}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-bold shadow-[0_0_24px_rgba(250,204,21,0.2)] hover:from-yellow-300 hover:to-amber-400 active:scale-[0.98] transition disabled:opacity-40"
            >
              {isPending ? 'Processando...' : '✚ Lançar refeição'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
