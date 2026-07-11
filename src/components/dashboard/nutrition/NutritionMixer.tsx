'use client'

import { useEffect, useMemo, useRef, useState, useTransition, useCallback } from 'react'
import { logMealAction, logBarcodeAction, updateWaterAction, deleteMealAction, editMealAction, resolveFoodItemsAction, estimateFoodAction } from '@/app/(app)/dashboard/nutrition/actions'
import type { MealLog } from '@/lib/nutrition/engine'
import { analyzeMeal } from '@/lib/nutrition/parser'
import { useIsIosNative } from '@/hooks/useIsIosNative'
import { createClient } from '@/utils/supabase/client'
import { getErrorMessage } from '@/utils/errorMessage'
import dynamic from 'next/dynamic'
import { queueGetAll, queueDelete as cancelQueuedJob } from '@/lib/offline/idb'
import { queueNutritionLog, queueNutritionDelete, queueNutritionEdit, queueNutritionWater } from '@/lib/offline/offlineSync'
import {
  getNutritionMealsCache,
  setNutritionMealsCache,
  setCustomFoodsCache,
  getCustomFoodsCache,
} from '@/lib/offline/nutritionCache'
import { mealToContent, dayToContent, type NutritionStoryContent } from '@/components/stories/nutritionStory'

// ── Lazy sub-components ────────────────────────────────────────────────────────
const NutritionDayScore = dynamic(() => import('./NutritionDayScore'), { ssr: false })
const NutritionEntryCard = dynamic(() => import('./NutritionEntryCard'), { ssr: false })
const WaterTracker = dynamic(() => import('./WaterTracker'), { ssr: false })
const SmartSuggestions = dynamic(() => import('./SmartSuggestions'), { ssr: false })
const DietGenerator = dynamic(() => import('./DietGenerator'), { ssr: false })
const DateNavigator = dynamic(() => import('./DateNavigator'), { ssr: false })
const CustomFoodScanner = dynamic(() => import('./CustomFoodScanner'), { ssr: false })
const CustomFoodLibrary = dynamic(() => import('./CustomFoodLibrary'), { ssr: false })
const NutritionWorkoutCorrelation = dynamic(() => import('./NutritionWorkoutCorrelation'), { ssr: false })
const BarcodeScanner = dynamic(() => import('./BarcodeScanner'), { ssr: false })
const NutritionStoryComposer = dynamic(() => import('@/components/NutritionStoryComposer'), { ssr: false })

// ── Hooks ──────────────────────────────────────────────────────────────────────
import { useCustomFoods, customFoodsToExtraFoods, type CustomFood } from './useCustomFoods'

type Totals = { calories: number; protein: number; carbs: number; fat: number }

type MealItemView = { label: string; grams: number; calories: number; protein: number; carbs: number; fat: number }

type MealEntry = {
  id: string
  created_at: string
  food_name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  items?: MealItemView[] | null
  /** Lançado offline e ainda não sincronizado (id = clientId do job na fila). */
  pending?: boolean
}

/** Verdadeiro só quando o navegador reporta explicitamente que está offline. */
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** id otimista de uma entry lançada offline; vira o id do job na fila. */
const newClientId = () => `co_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`

function parseItems(raw: unknown): MealItemView[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const items = raw
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
    .map((it) => ({
      label: String(it.label ?? ''),
      grams: Number(it.grams) || 0,
      calories: Number(it.calories) || 0,
      protein: Number(it.protein) || 0,
      carbs: Number(it.carbs) || 0,
      fat: Number(it.fat) || 0,
    }))
    .filter((it) => it.label)
  return items.length > 0 ? items : null
}

const PERCENT_SCALE = 100

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Soma os macros de uma lista de entries (usado pro estado otimista offline). */
function sumTotals(list: MealEntry[]): Totals {
  return (Array.isArray(list) ? list : []).reduce(
    (a, e) => ({
      calories: a.calories + safeNumber(e?.calories),
      protein: a.protein + safeNumber(e?.protein),
      carbs: a.carbs + safeNumber(e?.carbs),
      fat: a.fat + safeNumber(e?.fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
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
        <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">{label}</span>
        <span className={`text-xs font-bold tabular-nums ${over ? 'text-red-400' : accent}`}>
          {Math.round(sVal)}<span className="text-neutral-400">/{Math.round(sGoal)}g</span>
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
      className={`w-full flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl transition-all duration-200 active:scale-95
        ${active
          ? 'bg-yellow-500/15 border border-yellow-500/30 shadow-[0_0_12px_rgba(250,204,21,0.1)]'
          : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06]'
        }`}
    >
      <span className="text-lg">{icon}</span>
      <span className={`text-[9px] uppercase tracking-[0.15em] font-semibold ${active ? 'text-yellow-300' : 'text-neutral-400'}`}>{label}</span>
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
  restDayReduction,
}: {
  dateKey: string
  initialTotals: Totals
  goals: Totals
  schemaMissing?: boolean
  canViewMacros?: boolean
  workoutCaloriesToday?: number
  goalsSource?: 'saved' | 'profile' | 'default'
  restDayReduction?: number
}) {
  const supabase = useMemo(() => createClient(), [])
  const isIosNative = useIsIosNative()
  const hideVipCtas = isIosNative
  const [isAndroidNative, setIsAndroidNative] = useState(false)
  useEffect(() => {
    import('@/utils/platform').then(({ isAndroidNative: check }) => setIsAndroidNative(check()))
  }, [])
  const isNative = isIosNative || isAndroidNative

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | undefined>()
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // getUser() valida no servidor (falha offline) → cai pra getSession() local.
      try {
        const { data } = await supabase.auth.getUser()
        if (data?.user?.id) { if (!cancelled) setUserId(data.user.id); return }
      } catch { /* offline → sessão local */ }
      try {
        const { data } = await supabase.auth.getSession()
        if (data?.session?.user?.id && !cancelled) setUserId(data.session.user.id)
      } catch { /* sem sessão legível */ }
    })()
    return () => { cancelled = true }
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
  const entriesRef = useRef<MealEntry[]>([])
  useEffect(() => { entriesRef.current = entries }, [entries])
  const [input, setInput] = useState('')
  const [mealName, setMealName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [entriesTick, setEntriesTick] = useState(0)
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [entriesError, setEntriesError] = useState('')
  const [entryBusyId, setEntryBusyId] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiUpgrade, setAiUpgrade] = useState(false)
  const [waterMl, setWaterMl] = useState(0)
  // Biblioteca (custom foods) vinda do cache, pro parser reconhecer alimentos
  // salvos quando offline (o hook useCustomFoods busca do Supabase e falha sem rede).
  const [cachedCustomFoods, setCachedCustomFoods] = useState<CustomFood[]>([])
  // Composer de Story de nutrição (refeição ou resumo do dia)
  const [story, setStory] = useState<{ mode: 'meal' | 'day'; content: NutritionStoryContent } | null>(null)

  // Entry detail state
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ food_name: string; items: MealItemView[] } | null>(null)
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
  // Lançamento manual é permitido em qualquer dia passado (esqueceu de registrar
  // no dia) — só datas futuras ficam de fora, já que não dá pra ter comido algo
  // que ainda não aconteceu. DateNavigator já trava navegação pro futuro, isso
  // aqui é só a segunda camada de defesa.
  const isFutureDate = currentDateKey > todayDate

  // ── Panel toggles ────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<'none' | 'scanner' | 'library' | 'water'>('none')
  const togglePanel = useCallback((p: typeof activePanel) => setActivePanel(prev => prev === p ? 'none' : p), [])
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  // EAN lido cujo produto não foi encontrado — abre o scanner de tabela
  // nutricional pra cadastrar o produto já associado a esse código.
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null)

  // ── Hooks ────────────────────────────────────────────────────────────────
  const { foods: customFoods, loading: customFoodsLoading, saving: scannerSaving, saveFood: scannerSaveFood, updateFood: updateCustomFood, deleteFood: deleteCustomFood } = useCustomFoods(userId)

  // Espelha a biblioteca no cache quando ela carrega (online); quando vier vazia
  // (offline), restaura do cache pro parser reconhecer os alimentos salvos.
  useEffect(() => {
    const uid = userId ? String(userId) : ''
    if (!uid) return
    if (Array.isArray(customFoods) && customFoods.length > 0) {
      void setCustomFoodsCache(uid, customFoods)
    } else {
      let cancelled = false
      getCustomFoodsCache(uid).then((f) => { if (!cancelled && f.length) setCachedCustomFoods(f as unknown as CustomFood[]) })
      return () => { cancelled = true }
    }
  }, [userId, customFoods])

  // Base efetiva do parser: a biblioteca online quando disponível, senão o cache.
  const effectiveCustomFoods = useMemo(
    () => (Array.isArray(customFoods) && customFoods.length > 0 ? customFoods : cachedCustomFoods),
    [customFoods, cachedCustomFoods],
  )

  // Escreve o cache de leitura (entries + água) do dia visível. Chamado SÓ em
  // pontos com dado autoritativo (fetch ok / mutação otimista) — nunca no estado
  // vazio transitório de troca de data, pra não clobberar o cache.
  const cacheDay = useCallback(
    (nextEntries: MealEntry[], waterOverride?: number) => {
      const uid = userId ? String(userId) : ''
      if (!uid || schemaMissing) return
      void setNutritionMealsCache(uid, currentDateKey, {
        entries: Array.isArray(nextEntries) ? nextEntries : [],
        water_ml: waterOverride !== undefined ? safeNumber(waterOverride) : safeNumber(waterMl),
      })
    },
    [userId, schemaMissing, currentDateKey, waterMl],
  )

  // Resolve um texto de alimento → item(s) pro editor de refeição:
  // parser local (base + biblioteca) → resolveFood (TACO/OFF) → IA (VIP).
  // Offline usa só o parser local.
  const resolveFoodForEditor = useCallback(async (
    text: string,
  ): Promise<{ ok: true; items: MealItemView[] } | { ok: false; error?: string; needsAi?: boolean }> => {
    const t = String(text || '').trim()
    if (!t) return { ok: false, error: 'Digite um alimento.' }

    // 1. parser local (instantâneo)
    try {
      const extra = customFoodsToExtraFoods(Array.isArray(effectiveCustomFoods) ? effectiveCustomFoods : [])
      const a = analyzeMeal(t, extra)
      if (a.items.length > 0 && a.unknownLines.length === 0) {
        return { ok: true, items: a.items.map((it) => ({ label: it.label, grams: it.grams, calories: it.calories, protein: it.protein, carbs: it.carbs, fat: it.fat })) }
      }
    } catch { /* cai pro servidor */ }

    if (isOffline()) return { ok: false, error: 'Sem internet pra reconhecer esse alimento.' }

    // 2. servidor: resolveFood (base/TACO/learned/custom/OFF)
    try {
      const res = await resolveFoodItemsAction(t)
      if (res?.ok && Array.isArray(res.items) && res.items.length > 0) {
        return { ok: true, items: res.items as MealItemView[] }
      }
      if (!(res as Record<string, unknown>)?.needsAi) {
        return { ok: false, error: String((res as Record<string, unknown>)?.error || 'Não reconheci esse alimento.') }
      }
    } catch { /* tenta IA */ }

    // 3. IA (VIP)
    try {
      const ai = await estimateFoodAction(t)
      const aiObj = ai as Record<string, unknown>
      if (ai?.ok && aiObj?.item) {
        return { ok: true, items: [aiObj.item as MealItemView] }
      }
      const upgrade = Boolean(aiObj?.upgradeRequired) || String(aiObj?.error || '') === 'vip_required'
      return { ok: false, error: upgrade ? 'Estimativa por IA é do plano VIP.' : 'Não reconheci esse alimento.' }
    } catch {
      return { ok: false, error: 'Falha ao adicionar.' }
    }
  }, [effectiveCustomFoods])

  // ── Derived ──────────────────────────────────────────────────────────────
  const safeEntries = Array.isArray(entries) ? entries : []
  const calorieRatio = safeGoals.calories > 0 ? safeNumber(totals?.calories) / safeGoals.calories : 0
  const caloriePct = Math.round(clamp01(calorieRatio) * PERCENT_SCALE)
  const calorieOver = safeGoals.calories > 0 && calorieRatio > 1
  const remaining = Math.max(0, safeGoals.calories - safeNumber(totals?.calories))

  // ── Simulação ao vivo — parser local (base + repertório do usuário), zero
  // latência. Mostra os macros parciais da refeição ENQUANTO o usuário digita,
  // sem precisar lançar, pra ele simular se cabe na meta antes de comer.
  const mealPreview = useMemo(() => {
    const text = input.trim()
    if (!text) return null
    try {
      const extra = customFoodsToExtraFoods(Array.isArray(effectiveCustomFoods) ? effectiveCustomFoods : [])
      const a = analyzeMeal(input, extra)
      if (a.items.length === 0) return a.unknownLines.length > 0 ? a : null
      return a
    } catch {
      return null
    }
  }, [input, effectiveCustomFoods])

  // Impacto da simulação na meta de calorias do dia (consumido + preview).
  const previewImpact = useMemo(() => {
    if (!mealPreview || mealPreview.items.length === 0) return null
    const consumed = safeNumber(totals?.calories)
    const add = mealPreview.meal.calories
    const goal = safeGoals.calories
    const projected = consumed + add
    const left = goal - projected
    return { add, projected, goal, left, over: goal > 0 && projected > goal }
  }, [mealPreview, totals?.calories, safeGoals.calories])

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
    const uid = userId ? String(userId) : ''

    const serveFromCache = async (): Promise<boolean> => {
      if (!uid) return false
      const c = await getNutritionMealsCache(uid, currentDateKey)
      if (!c || cancelled) return false
      const cached = Array.isArray(c.entries) ? (c.entries as MealEntry[]) : []
      setEntries(cached)
      setTotals(sumTotals(cached))
      return true
    }

    ;(async () => {
      // Offline → serve do cache na hora (inclui os lançamentos pendentes).
      if (isOffline()) {
        setEntriesLoading(true); setEntriesError('')
        await serveFromCache()
        if (!cancelled) setEntriesLoading(false)
        return
      }
      try {
        setEntriesLoading(true); setEntriesError('')
        const { data, error } = await supabase
          .from('nutrition_meal_entries')
          .select('id, created_at, food_name, calories, protein, carbs, fat, items')
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
            items: parseItems(r?.items),
          }))
          .filter((r: MealEntry) => Boolean(r.id))

        // Reconciliação: preserva os lançamentos pendentes cujo job AINDA está na
        // fila (não sincronizou). Quando o job some (sincronizou), o item real já
        // veio em `mapped` e o pendente é descartado. ids de clientId nunca
        // colidem com os do servidor.
        let queuedIds = new Set<string>()
        try {
          const all = await queueGetAll()
          queuedIds = new Set((Array.isArray(all) ? all : []).map((j) => String((j as Record<string, unknown>)?.id || '')))
        } catch { /* sem fila acessível */ }
        if (cancelled) return

        const stillPending = entriesRef.current.filter((e) => e.pending && queuedIds.has(e.id))
        const merged = [...stillPending, ...mapped].slice(0, 30)
        setEntries(merged)
        setTotals(sumTotals(merged))
        cacheDay(merged)
      } catch {
        // Falha de rede: tenta o cache antes de mostrar erro.
        if (await serveFromCache()) { if (!cancelled) setEntriesLoading(false); return }
        if (!cancelled) setEntriesError('Falha ao carregar lançamentos.')
      }
      finally { if (!cancelled) setEntriesLoading(false) }
    })()
    return () => { cancelled = true }
  }, [currentDateKey, entriesTick, schemaMissing, supabase, userId, cacheDay])

  // Water intake for the day
  useEffect(() => {
    if (schemaMissing) { setWaterMl(0); return }
    let cancelled = false
    const uid = userId ? String(userId) : ''
    ;(async () => {
      if (isOffline()) {
        if (!uid) return
        const c = await getNutritionMealsCache(uid, currentDateKey)
        if (!cancelled && c) setWaterMl(safeNumber(c.water_ml))
        return
      }
      try {
        const { data } = await supabase.from('daily_nutrition_logs').select('water_ml').eq('date', currentDateKey).maybeSingle()
        if (cancelled) return
        const ml = safeNumber((data as Record<string, unknown> | null)?.water_ml)
        setWaterMl(ml)
        cacheDay(entriesRef.current, ml)
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [currentDateKey, entriesTick, schemaMissing, supabase, userId, cacheDay])

  // ── Reconciliação online ──────────────────────────────────────────────────
  // A fila global (useOfflineSync) sincroniza os jobs ao voltar a rede; aqui só
  // forçamos refetch do dia visível pra trocar os pendentes pelas entries reais.
  const hasPending = (Array.isArray(entries) ? entries : []).some((e) => e.pending)
  useEffect(() => {
    const onOnline = () => { window.setTimeout(() => setEntriesTick((v) => v + 1), 4000) }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
  useEffect(() => {
    if (!hasPending) return
    const iv = setInterval(() => { if (!isOffline()) setEntriesTick((v) => v + 1) }, 8000)
    return () => clearInterval(iv)
  }, [hasPending])

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleSubmitOffline = (text: string) => {
    try {
      const extra = customFoodsToExtraFoods(Array.isArray(effectiveCustomFoods) ? effectiveCustomFoods : [])
      const a = analyzeMeal(text, extra)
      const customName = mealName.trim()
      const cid = newClientId()
      const resolved = a.items.length > 0 && a.unknownLines.length === 0

      if (resolved) {
        const foodName = (customName || a.items.map((i) => i.label).join(', ') || 'Refeição').slice(0, 120)
        const items = a.items.map((it) => ({ label: it.label, grams: it.grams, calories: it.calories, protein: it.protein, carbs: it.carbs, fat: it.fat }))
        const newEntry: MealEntry = {
          id: cid, created_at: new Date().toISOString(), food_name: foodName,
          calories: a.meal.calories, protein: a.meal.protein, carbs: a.meal.carbs, fat: a.meal.fat,
          items, pending: true,
        }
        const next = [newEntry, ...(Array.isArray(entries) ? entries : [])].slice(0, 30)
        setEntries(next); setTotals(sumTotals(next)); cacheDay(next)
        void queueNutritionLog(cid, { foodName, calories: a.meal.calories, protein: a.meal.protein, carbs: a.meal.carbs, fat: a.meal.fat, items, dateKey: currentDateKey, clientId: cid }, false)
        setInput(''); setMealName('')
      } else {
        // Fora da base local: fica pendente sem macros; a IA calcula no sync.
        const label = (customName || text).slice(0, 120)
        const newEntry: MealEntry = {
          id: cid, created_at: new Date().toISOString(), food_name: label,
          calories: 0, protein: 0, carbs: 0, fat: 0, items: null, pending: true,
        }
        const next = [newEntry, ...(Array.isArray(entries) ? entries : [])].slice(0, 30)
        setEntries(next); cacheDay(next)
        void queueNutritionLog(cid, { text, dateKey: currentDateKey, mealName: customName || undefined, clientId: cid }, true)
        setInput(''); setMealName('')
        setError('Sem internet: vou calcular os macros e salvar quando a conexão voltar.')
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Falha ao lançar offline.')
    }
  }

  const handleSubmit = () => {
    const text = input.trim()
    if (!text) return
    setError(null)
    // Sem internet: resolve local (ou enfileira pra IA) e otimista. NUNCA chama a
    // Server Action offline (é RPC de rede).
    if (isOffline()) { handleSubmitOffline(text); return }
    startTransition(async () => {
      try {
        const customName = mealName.trim()
        const res = await logMealAction(text, currentDateKey, customName || undefined)
        if (!res?.ok) {
          if ((res as Record<string, unknown>)?.needsAi) { void estimateWithAi(); return }
          setError(String((res as Record<string, unknown>)?.error || 'Falha ao processar.')); return
        }
        const meal = (res as Record<string, unknown>).meal as MealLog | undefined
        const entry = (res as Record<string, unknown>).entry as unknown
        if (!meal) { setError('Falha ao processar.'); return }
        if (entry && typeof entry === 'object') {
          const e = entry as Record<string, unknown>
          const nt = { calories: safeNumber(e?.totals_calories), protein: safeNumber(e?.totals_protein), carbs: safeNumber(e?.totals_carbs), fat: safeNumber(e?.totals_fat) }
          if (nt.calories || nt.protein || nt.carbs || nt.fat) setTotals(nt)
          const newEntry: MealEntry = { id: String(e?.entry_id || e?.id || Date.now()), created_at: String(e?.created_at || new Date().toISOString()), food_name: String(e?.food_name || meal.foodName || 'Refeição'), calories: safeNumber(e?.calories ?? meal.calories), protein: safeNumber(e?.protein ?? meal.protein), carbs: safeNumber(e?.carbs ?? meal.carbs), fat: safeNumber(e?.fat ?? meal.fat), items: parseItems(e?.items) }
          const next = [newEntry, ...(Array.isArray(entries) ? entries : [])].slice(0, 30)
          setEntries(next); cacheDay(next)
        } else {
          setTotals(prev => ({ calories: safeNumber(prev?.calories) + safeNumber(meal.calories), protein: safeNumber(prev?.protein) + safeNumber(meal.protein), carbs: safeNumber(prev?.carbs) + safeNumber(meal.carbs), fat: safeNumber(prev?.fat) + safeNumber(meal.fat) }))
        }
        setInput(''); setMealName('')
        try { queueMicrotask(() => inputRef.current?.focus()) } catch {}
      } catch (e: unknown) { setError(getErrorMessage(e) || 'Falha ao processar.') }
    })
  }

  const deleteEntry = async (id: string) => {
    if (!id || entryBusyId) return
    setError(null)

    if (isOffline()) {
      const list = Array.isArray(entries) ? entries : []
      const target = list.find(x => x.id === id)
      const next = list.filter(x => x.id !== id)
      setEntries(next); setTotals(sumTotals(next)); cacheDay(next)
      // Pendente (ainda na fila) → cancela o job de criação; senão enfileira a exclusão.
      if (target?.pending) void cancelQueuedJob(id)
      else void queueNutritionDelete({ entryId: id })
      return
    }

    setEntryBusyId(id)
    try {
      // Usa a server action (delete + recálculo via supabase-js). A antiga RPC
      // nutrition_delete_meal_entry tem "column reference user_id is ambiguous".
      const res = await deleteMealAction(id)
      if (!res?.ok) throw new Error(String((res as Record<string, unknown>)?.error || 'Falha ao remover.'))
      const totals = (res as Record<string, unknown>)?.totals as Record<string, unknown> | null
      if (totals) {
        setTotals({ calories: safeNumber(totals.calories), protein: safeNumber(totals.protein), carbs: safeNumber(totals.carbs), fat: safeNumber(totals.fat) })
      }
      const next = (Array.isArray(entries) ? entries : []).filter(x => x.id !== id)
      setEntries(next); cacheDay(next)
    } catch (e: unknown) { setError(getErrorMessage(e) || 'Falha ao remover.') }
    finally { setEntryBusyId('') }
  }

  const estimateWithAi = async () => {
    const text = input.trim()
    if (!text || schemaMissing || aiBusy) return
    setAiBusy(true); setAiUpgrade(false); setError(null)
    try {
      const customName = mealName.trim()
      const res = await fetch('/api/ai/nutrition-estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, dateKey: currentDateKey, mealName: customName || undefined }) })
      const json = await res.json().catch((): null => null)
      if (!json?.ok) {
        const up = !!json?.upgradeRequired || String(json?.error || '') === 'vip_required'
        setAiUpgrade(up); setError(up ? 'Disponível para assinantes VIP Pro.' : String(json?.error || 'Falha ao estimar com IA.')); return
      }
      const row = json?.row
      if (row && typeof row === 'object') {
        setTotals({ calories: safeNumber(row?.totals_calories), protein: safeNumber(row?.totals_protein), carbs: safeNumber(row?.totals_carbs), fat: safeNumber(row?.totals_fat) })
        setEntries(prev => [{ id: String(row?.entry_id || row?.id || Date.now()), created_at: String(row?.created_at || new Date().toISOString()), food_name: String(row?.food_name || 'Refeição'), calories: safeNumber(row?.calories), protein: safeNumber(row?.protein), carbs: safeNumber(row?.carbs), fat: safeNumber(row?.fat), items: parseItems(row?.items) }, ...(Array.isArray(prev) ? prev : [])].slice(0, 30))
      }
      setInput(''); setMealName(''); try { inputRef.current?.focus() } catch {}
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

  const handleBarcodeResult = useCallback(async (ean: string) => {
    setShowBarcodeScanner(false)
    const gramsStr = window.prompt(`Produto escaneado (EAN: ${ean})\nQuantidade em gramas:`, '100')
    const grams = Number(gramsStr)
    if (!grams || grams <= 0) return

    setError(null)
    try {
      const result = await logBarcodeAction(ean, grams, currentDateKey)
      if (result.ok && result.meal) {
        const meal = result.meal
        const entry = result.entry
        if (entry && typeof entry === 'object') {
          const e = entry as Record<string, unknown>
          const nt = { calories: safeNumber(e?.totals_calories), protein: safeNumber(e?.totals_protein), carbs: safeNumber(e?.totals_carbs), fat: safeNumber(e?.totals_fat) }
          if (nt.calories || nt.protein || nt.carbs || nt.fat) setTotals(nt)
          setEntries(prev => [{ id: String(e?.entry_id || e?.id || Date.now()), created_at: String(e?.created_at || new Date().toISOString()), food_name: String(e?.food_name || meal.foodName || 'Produto'), calories: safeNumber(e?.calories ?? meal.calories), protein: safeNumber(e?.protein ?? meal.protein), carbs: safeNumber(e?.carbs ?? meal.carbs), fat: safeNumber(e?.fat ?? meal.fat), items: parseItems(e?.items) }, ...(Array.isArray(prev) ? prev : [])].slice(0, 30))
        } else {
          setTotals(prev => ({ calories: safeNumber(prev?.calories) + safeNumber(meal.calories), protein: safeNumber(prev?.protein) + safeNumber(meal.protein), carbs: safeNumber(prev?.carbs) + safeNumber(meal.carbs), fat: safeNumber(prev?.fat) + safeNumber(meal.fat) }))
          setEntriesTick(v => v + 1)
        }
      } else if ((result as Record<string, unknown>)?.notFound) {
        // Produto fora do OFF → abre o scanner da tabela nutricional já vinculado
        // ao código. Ao salvar, o produto entra na biblioteca com o EAN.
        setPendingBarcode(String((result as Record<string, unknown>)?.ean || ean))
        setActivePanel('scanner')
      } else {
        setError(result.error ?? 'Produto não encontrado.')
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Erro ao adicionar produto.')
    }
  }, [currentDateKey])

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
              <span className="text-[10px] text-neutral-400 uppercase tracking-wider">kcal</span>
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
              <div className="text-xs text-neutral-400">
                Restam <span className="text-emerald-400 font-semibold">{Math.round(remaining)}</span> kcal
              </div>
            )}

            {/* Dia de descanso — meta reduzida por decisão do usuário na pergunta
                matinal. Mostra o quanto foi descontado (transparência). Só em HOJE:
                restDayReduction/workoutCaloriesToday são valores do dia corrente; ao
                navegar para um dia passado (backdate) eles não se aplicam. */}
            {isToday && safeNumber(restDayReduction) > 0 && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-sky-500/15 bg-sky-500/[0.06] px-2 py-1">
                <span className="text-[11px] leading-none">😴</span>
                <span className="text-[10px] leading-tight text-sky-300">
                  Dia de descanso: meta ajustada <span className="font-semibold">−{Math.round(safeNumber(restDayReduction))} kcal</span>
                  <span className="text-neutral-500"> · proteína mantida</span>
                </span>
              </div>
            )}

            {/* Gasto do treino — informativo apenas. NÃO entra na meta de propósito:
                "comer de volta" um gasto estimado sabota o déficit do cutting. */}
            {isToday && safeNumber(workoutCaloriesToday) > 0 && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-orange-500/15 bg-orange-500/[0.06] px-2 py-1">
                <span className="text-[11px] leading-none">🔥</span>
                <span className="text-[10px] leading-tight text-orange-300">
                  Treino hoje: <span className="font-semibold">~{Math.round(safeNumber(workoutCaloriesToday))} kcal</span>
                  <span className="text-neutral-500"> · estimativa, não muda a meta</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {goalsSource === 'profile' && (
          <div className="mt-3 text-[10px] text-neutral-400 text-center">Meta via TDEE do perfil • <button type="button" onClick={() => setGoalsOpen(true)} className="text-yellow-500 hover:text-yellow-400">Ajustar</button></div>
        )}

        {safeEntries.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex justify-center">
            <button
              type="button"
              onClick={() => setStory({ mode: 'day', content: dayToContent(totals, safeGoals, currentDateKey) })}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-yellow-200 text-xs font-bold uppercase tracking-wider hover:bg-yellow-500/25 active:scale-[0.98] transition"
            >
              🎬 Compartilhar dia
            </button>
          </div>
        )}
      </Card>

      {/* ══ MACROS ═══════════════════════════════════════════════════════ */}
      {canViewMacros ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-semibold">Macronutrientes</span>
            <button type="button" onClick={() => setGoalsOpen(v => !v)} className="text-[10px] text-yellow-500 hover:text-yellow-400 uppercase tracking-wider font-bold">
              {goalsOpen ? '✕ Fechar' : '⚙ Metas'}
            </button>
          </div>
          <MacroBar label="Proteína" value={totals.protein} goal={safeGoals.protein} color="#fbbf24" accent="text-amber-300" />
          <MacroBar label="Carboidratos" value={totals.carbs} goal={safeGoals.carbs} color="#f59e0b" accent="text-amber-400" />
          <MacroBar label="Gordura" value={totals.fat} goal={safeGoals.fat} color="#ef4444" accent="text-red-400" />

          {/* Goals editor inline */}
          {goalsOpen && (
            <div className="mt-2 pt-3 border-t border-white/[0.06] space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {(['calories', 'protein', 'carbs', 'fat'] as const).map(f => (
                  <div key={f} className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold">
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
                <button type="button" onClick={() => setGoalsOpen(false)} className="h-10 px-3 rounded-lg text-xs text-neutral-400 hover:text-white transition">Cancelar</button>
                <button type="button" onClick={saveGoals} disabled={goalsSaving} className="h-11 px-4 rounded-lg bg-yellow-500 text-black text-xs font-bold hover:bg-yellow-400 disabled:opacity-50 active:scale-95 transition">
                  {goalsSaving ? '...' : 'Salvar'}
                </button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-4">
          <div className="text-sm font-semibold text-white">Macros no plano Pro</div>
          <div className="mt-1 text-xs text-neutral-400">Ative para acompanhar proteína, carbo e gordura.</div>
          {!hideVipCtas && (
            <button type="button" onClick={() => (window.location.href = '/marketplace')} className="mt-3 h-9 px-4 rounded-lg bg-yellow-500 text-black text-xs font-bold hover:bg-yellow-400 active:scale-95 transition">
              Ver planos
            </button>
          )}
        </Card>
      )}

      {/* ══ DAY SCORE ════════════════════════════════════════════════════ */}
      {canViewMacros && safeEntries.length > 0 && (
        <Card className="p-3"><NutritionDayScore totals={totals} goals={safeGoals} /></Card>
      )}

      {/* ══ TREINO × NUTRIÇÃO CORRELATION ════════════════════════════════ */}
      <NutritionWorkoutCorrelation />

      {/* ══ QUICK ACTIONS ════════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-2">
        <QuickAction icon="📷" label="Scanner" onClick={() => togglePanel('scanner')} active={activePanel === 'scanner'} />
        <QuickAction icon="📚" label="Biblioteca" onClick={() => togglePanel('library')} active={activePanel === 'library'} />
        <QuickAction icon="💧" label="Água" onClick={() => togglePanel('water')} active={activePanel === 'water'} />
      </div>

      {/* ── Scanner Panel ─────────────────────────────────────────────── */}
      {activePanel === 'scanner' && (
        <CustomFoodScanner
          saving={scannerSaving}
          onSave={scannerSaveFood}
          onClose={() => { setActivePanel('none'); setPendingBarcode(null) }}
          initialBarcode={pendingBarcode}
        />
      )}

      {/* ── Library Panel ─────────────────────────────────────────────── */}
      {activePanel === 'library' && (
        <Card className="p-4">
          <CustomFoodLibrary
            foods={customFoods}
            loading={customFoodsLoading}
            onUse={handleFavoriteSelect}
            onEdit={updateCustomFood}
            onDelete={deleteCustomFood}
            onScan={() => setActivePanel('scanner')}
          />
        </Card>
      )}


      {/* ── Water Panel ───────────────────────────────────────────────── */}
      {activePanel === 'water' && (
        <Card className="p-4">
          <WaterTracker
            key={currentDateKey}
            initialMl={waterMl}
            onUpdate={(ml) => {
              setWaterMl(ml)
              cacheDay(entriesRef.current, ml)
              if (isOffline()) void queueNutritionWater({ ml, dateKey: currentDateKey })
              else void updateWaterAction(ml, currentDateKey)
            }}
          />
        </Card>
      )}

      {/* ══ AI SUGGESTIONS ═══════════════════════════════════════════════ */}
      {safeGoals.calories > 0 && isToday && (
        <SmartSuggestions goals={safeGoals} consumed={totals} onSelect={handleFavoriteSelect} />
      )}

      {/* ══ DIET GENERATOR — memória nutricional ═════════════════════════ */}
      {canViewMacros && safeGoals.calories > 0 && isToday && (
        <DietGenerator
          goals={safeGoals}
          dateKey={currentDateKey}
          hideVipCtas={hideVipCtas}
          onApplied={() => setEntriesTick(v => v + 1)}
        />
      )}

      {/* ══ MEAL INPUT ═══════════════════════════════════════════════════ */}
      {!isFutureDate && (
        <Card glow="bg-[linear-gradient(180deg,rgba(250,204,21,0.04)_0%,transparent_50%)]" className="p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-semibold">
            Adicionar refeição{!isToday && ` — ${currentDateKey}`}
          </div>
          <div className="mt-1 text-xs text-neutral-400">Ex.: 150g frango + arroz branco + salada</div>
          <input
            type="text"
            aria-label="Nome da refeição (opcional)"
            value={mealName}
            onChange={e => setMealName(e.target.value)}
            disabled={isPending || !!schemaMissing}
            maxLength={60}
            className="mt-3 w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:border-yellow-500/30 focus:ring-1 focus:ring-yellow-500/20 transition"
            placeholder="Nome da refeição (opcional) — ex.: Almoço"
          />
          <textarea
            ref={inputRef}
            aria-label="Adicionar refeição"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isPending || !!schemaMissing}
            rows={2}
            className="mt-3 w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:border-yellow-500/30 focus:ring-1 focus:ring-yellow-500/20 resize-none transition"
            placeholder={schemaMissing ? 'Nutrição não configurada.' : 'O que você comeu?'}
          />

          {/* ══ Simulação ao vivo — macros parciais enquanto digita ═══════════ */}
          {mealPreview && (mealPreview.items.length > 0 || mealPreview.unknownLines.length > 0) && (
            <div className="mt-3 rounded-xl border border-yellow-500/15 bg-yellow-500/[0.03] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.18em] text-yellow-400/80 font-semibold">Simulação</span>
                {mealPreview.items.length > 0 && (
                  <span className="text-sm font-bold text-yellow-300">{mealPreview.meal.calories} kcal</span>
                )}
              </div>

              {mealPreview.items.length > 0 && (
                <>
                  <ul className="mt-2 space-y-1">
                    {mealPreview.items.map((it, i) => (
                      <li key={`${it.label}-${i}`} className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate text-neutral-200">{it.label}</span>
                        <span className="shrink-0 whitespace-nowrap text-neutral-400">
                          <span className="font-semibold text-neutral-100">{it.calories}</span> kcal
                          <span className="ml-2 text-[10px] text-neutral-500">P{it.protein} C{it.carbs} G{it.fat}</span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-neutral-400">
                    Total: P {mealPreview.meal.protein} · C {mealPreview.meal.carbs} · G {mealPreview.meal.fat} g
                  </div>

                  {previewImpact && previewImpact.goal > 0 && (
                    <div className={`mt-1 text-xs font-medium ${previewImpact.over ? 'text-red-300' : 'text-emerald-300'}`}>
                      {previewImpact.over
                        ? `Passa a meta em ${Math.abs(previewImpact.left)} kcal (${previewImpact.projected}/${previewImpact.goal})`
                        : `Sobram ${previewImpact.left} kcal na meta (${previewImpact.projected}/${previewImpact.goal})`}
                    </div>
                  )}
                </>
              )}

              {mealPreview.unknownLines.length > 0 && (
                <div className={`${mealPreview.items.length > 0 ? 'mt-2' : 'mt-1'} text-[11px] text-neutral-500`}>
                  Fora da base local: <span className="text-neutral-400">{mealPreview.unknownLines.join(', ')}</span>. Ao tocar em Lançar, a IA calcula os macros e salva pra próxima vez.
                </div>
              )}
            </div>
          )}

          {/* IA calculando — feedback claro pro fallback de IA (item fora da base) */}
          {aiBusy && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.06] px-3 py-2.5">
              <svg className="size-4 animate-spin text-yellow-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
              </svg>
              <span className="text-xs text-yellow-200">Calculando com IA e salvando na sua base…</span>
            </div>
          )}

          {/* Submit row */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!input.trim() || isPending || aiBusy || !!schemaMissing}
              className="flex-1 h-10 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-bold text-sm shadow-lg shadow-yellow-500/20 hover:from-yellow-300 hover:to-amber-400 active:scale-[0.98] transition disabled:opacity-40 disabled:shadow-none"
            >
              {aiBusy ? '🤖 Calculando…' : isPending ? 'Processando…' : '✚ Lançar'}
            </button>
            {isNative && (
              <button
                type="button"
                onClick={() => setShowBarcodeScanner(true)}
                aria-label="Escanear código de barras"
                className="flex size-9 items-center justify-center rounded-lg bg-white/10 text-white active:scale-95"
              >
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2v16H3V4zm4 0h1v16H7V4zm3 0h2v16h-2V4zm4 0h1v16h-1V4zm3 0h4v16h-4V4z" />
                </svg>
              </button>
            )}
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
                <button type="button" onClick={estimateWithAi} disabled={aiBusy} className="mt-2 h-11 px-3 rounded-lg bg-white/[0.06] border border-white/[0.08] text-xs font-semibold text-white hover:bg-white/[0.1] disabled:opacity-50 transition">
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
          <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-semibold">
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
              <div className="text-xs text-neutral-400 mt-1">Adicione um lançamento para começar</div>
            </div>
          ) : (
            safeEntries.map(item => (
              <div key={item.id} className="relative">
                {item.pending && (
                  <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-full border border-yellow-500/30 bg-yellow-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-yellow-300">
                    ⏳ pendente
                  </span>
                )}
                <NutritionEntryCard
                  item={item}
                  isExpanded={expandedEntryId === item.id}
                onStory={(entry) => setStory({ mode: 'meal', content: mealToContent(entry) })}
                onToggleExpand={(id: string) => setExpandedEntryId(id || null)}
                editingId={editingEntryId || ''}
                editDraft={editDraft || { food_name: '', items: [] }}
                editBusy={editBusy}
                onAddFood={resolveFoodForEditor}
                onStartEdit={(entry) => {
                  setEditingEntryId(entry.id)
                  const existing = Array.isArray(entry.items) ? entry.items : []
                  // Refeições antigas sem detalhamento: semeia 1 item com os macros atuais.
                  const seeded: MealItemView[] = existing.length > 0
                    ? existing.map(it => ({ label: String(it.label || ''), grams: safeNumber(it.grams), calories: safeNumber(it.calories), protein: safeNumber(it.protein), carbs: safeNumber(it.carbs), fat: safeNumber(it.fat) }))
                    : [{ label: entry.food_name || 'Refeição', grams: 0, calories: safeNumber(entry.calories), protein: safeNumber(entry.protein), carbs: safeNumber(entry.carbs), fat: safeNumber(entry.fat) }]
                  setEditDraft({ food_name: entry.food_name, items: seeded })
                }}
                onCancelEdit={() => { setEditingEntryId(null); setEditDraft(null) }}
                onSaveEdit={async () => {
                  if (!editingEntryId || !editDraft) return
                  const id = editingEntryId
                  const draft = editDraft
                  const items = Array.isArray(draft.items) ? draft.items : []
                  if (items.length === 0) return
                  const macros = items.reduce((a, it) => ({
                    calories: a.calories + safeNumber(it.calories),
                    protein: a.protein + safeNumber(it.protein),
                    carbs: a.carbs + safeNumber(it.carbs),
                    fat: a.fat + safeNumber(it.fat),
                  }), { calories: 0, protein: 0, carbs: 0, fat: 0 })

                  if (isOffline()) {
                    const list = Array.isArray(entries) ? entries : []
                    const target = list.find(x => x.id === id)
                    const next = list.map(x => x.id === id
                      ? { ...x, food_name: draft.food_name, calories: macros.calories, protein: macros.protein, carbs: macros.carbs, fat: macros.fat, items }
                      : x)
                    setEntries(next); setTotals(sumTotals(next)); cacheDay(next)
                    // Pendente → reescreve o job de lançamento (mesmo id); senão enfileira a edição.
                    if (target?.pending) {
                      // clientId: id é OBRIGATÓRIO — sem ele o /log-entry insere sem dedup
                      // (índice único parcial user_id+client_id) e um reenvio pós-commit
                      // DUPLICA a refeição. O id do job pendente já é o clientId original.
                      void queueNutritionLog(id, { foodName: draft.food_name, calories: macros.calories, protein: macros.protein, carbs: macros.carbs, fat: macros.fat, items, dateKey: currentDateKey, clientId: id }, false)
                    } else {
                      void queueNutritionEdit({ entryId: id, draft: { food_name: draft.food_name, items } })
                    }
                    setEditingEntryId(null); setEditDraft(null)
                    return
                  }
                  setEditBusy(true)
                  try {
                    const res = await editMealAction(id, { food_name: draft.food_name, items })
                    if (!res?.ok) throw new Error(String((res as Record<string, unknown>)?.error || 'Falha ao editar.'))
                    const totals = (res as Record<string, unknown>)?.totals as Record<string, unknown> | null
                    if (totals) setTotals({ calories: safeNumber(totals.calories), protein: safeNumber(totals.protein), carbs: safeNumber(totals.carbs), fat: safeNumber(totals.fat) })
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
              </div>
            ))
          )}
        </div>
      </Card>

      {/* ── Barcode Scanner overlay ───────────────────────────────────── */}
      {showBarcodeScanner && (
        <BarcodeScanner
          onResult={handleBarcodeResult}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}

      {/* ── Story de nutrição (refeição / dia) ──────────────────────────── */}
      {story && (
        <NutritionStoryComposer
          open={!!story}
          mode={story.mode}
          content={story.content}
          onClose={() => setStory(null)}
        />
      )}

    </div>
  )
}
