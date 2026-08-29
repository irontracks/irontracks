'use client'

import { useEffect, useMemo, useRef, useState, useTransition, useCallback } from 'react'
import { logMealAction, logBarcodeAction, updateWaterAction, deleteMealAction, editMealAction, resolveFoodItemsAction, estimateFoodAction } from '@/app/(app)/dashboard/nutrition/actions'
import type { MealLog } from '@/lib/nutrition/engine'
import type { UserStats } from '@/lib/nutrition/goals'
import { computeGoalsForPhase, type NutritionPhase } from '@/lib/nutrition/phase'
import { saveNutritionPhase } from '@/actions/nutrition-actions'
import PhaseSelector from './PhaseSelector'
import { analyzeMeal } from '@/lib/nutrition/parser'
import { projectMeal, type MacroKey } from '@/lib/nutrition/chatProjection'
import { Sparkles, SlidersHorizontal, X, Camera, Library, Droplet, Plus, Bot, UtensilsCrossed, ScanBarcode, Moon, Flame, Clapperboard, Mic, Square, ClipboardPaste } from 'lucide-react'
import { useSpeechToText } from '@/hooks/useSpeechToText'
import { juntarDitado, suportaDitado } from '@/lib/nutrition/ditado'
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
import MacroBar, { MACRO_COLORS } from './MacroBar'

// ── Lazy sub-components ────────────────────────────────────────────────────────
/** Macros exibidos na projeção do preview. Calorias saem à parte (têm linha própria). */
const PREVIEW_MACROS: ReadonlyArray<{ key: MacroKey; label: string }> = [
  { key: 'protein', label: 'P' },
  { key: 'carbs', label: 'C' },
  { key: 'fat', label: 'G' },
]

const NutritionChat = dynamic(() => import('./NutritionChat'), { ssr: false })
const NutritionDayScore = dynamic(() => import('./NutritionDayScore'), { ssr: false })
const NutritionEntryCard = dynamic(() => import('./NutritionEntryCard'), { ssr: false })
const WaterTracker = dynamic(() => import('./WaterTracker'), { ssr: false })
const DietGenerator = dynamic(() => import('./DietGenerator'), { ssr: false })
const DietJsonImportModal = dynamic(() => import('./DietJsonImportModal'), { ssr: false })
const PrescribedDietPlan = dynamic(() => import('./PrescribedDietPlan'), { ssr: false })
const MyDietPlan = dynamic(() => import('./MyDietPlan'), { ssr: false })
const DateNavigator = dynamic(() => import('./DateNavigator'), { ssr: false })
const NutritionHistoryModal = dynamic(() => import('./NutritionHistoryModal'), { ssr: false })
const CustomFoodScanner = dynamic(() => import('./CustomFoodScanner'), { ssr: false })
const CustomFoodLibrary = dynamic(() => import('./CustomFoodLibrary'), { ssr: false })
const NutritionWorkoutCorrelation = dynamic(() => import('./NutritionWorkoutCorrelation'), { ssr: false })
const BarcodeScanner = dynamic(() => import('./BarcodeScanner'), { ssr: false })
const NutritionStoryComposer = dynamic(() => import('@/components/NutritionStoryComposer'), { ssr: false })

// ── Hooks ──────────────────────────────────────────────────────────────────────
import { useCustomFoods, customFoodsToExtraFoods, type CustomFood } from './useCustomFoods'
import { properNameFieldProps } from '@/utils/ui/textFieldProps'
import { useDialog } from '@/contexts/DialogContext'

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
/**
 * Atalho de painel (Scanner / Biblioteca / Água).
 *
 * O ícone é COMPONENTE lucide, não string de emoji: 📷 renderizava a câmera
 * vintage marrom da Apple no meio de uma paleta gold/dark, com desenho e peso
 * decididos pelo sistema operacional, não pelo app. Terceira reincidência do
 * mesmo problema (já caíram o ⚙ do botão METAS e o ⚡ do heatmap) — por isso
 * agora o TIPO proíbe a string.
 *
 * `min-h-11` porque 44pt é o alvo mínimo da HIG, e este app se usa com a mão
 * suada no meio da série.
 */
function QuickAction({ icon: Icon, label, onClick, active }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full min-h-11 flex flex-col items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl transition-all duration-200 active:scale-95
        ${active
          ? 'bg-yellow-500/15 border border-yellow-500/30 shadow-[0_0_12px_rgba(250,204,21,0.1)]'
          : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06]'
        }`}
    >
      <Icon size={18} className={active ? 'text-yellow-300' : 'text-neutral-300'} />
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
  profileStats,
  currentPhase,
  phaseIsExplicit,
  openHistoryOnMount,
  onHistoryOpened,
}: {
  dateKey: string
  initialTotals: Totals
  goals: Totals
  schemaMissing?: boolean
  canViewMacros?: boolean
  workoutCaloriesToday?: number
  goalsSource?: 'saved' | 'profile' | 'default'
  restDayReduction?: number
  /** Abre a aba já com o histórico de refeições na tela (entrada pelo menu). */
  openHistoryOnMount?: boolean
  /** Avisa o pai que o pedido foi atendido, para ele poder pedir de novo. */
  onHistoryOpened?: () => void
  /** Perfil (peso/altura/idade/sexo/frequência) p/ o seletor recalcular a meta. Null = incompleto. */
  profileStats?: UserStats | null
  /** Fase em vigor: a escolhida, ou a derivada do objetivo de treino. */
  currentPhase?: NutritionPhase
  /** false = a fase acima foi DERIVADA, o usuário nunca escolheu. Muda o texto de apoio. */
  phaseIsExplicit?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const { prompt } = useDialog()
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

  // ── Ditar a refeição ────────────────────────────────────────────────────
  // Digitar "150g de arroz, 200g de patinho e uma banana" no celular, comendo,
  // é o pior momento possível para teclado. O texto ditado ENTRA NO CAMPO em
  // vez de lançar direto: o parser já mostra a simulação com kcal e macros
  // enquanto se digita, e o usuário confere (ou corrige "duzentos" que virou
  // "200g") antes de gravar. Ditado que lança sozinho tiraria essa conferência
  // justamente de quem não estava olhando a tela.
  // `suportaDitado` lê o `window`; em estado, para o primeiro HTML (servidor)
  // não decidir "não suporta" e apagar o botão.
  const [podeDitar, setPodeDitar] = useState(false)
  useEffect(() => { setPodeDitar(suportaDitado()) }, [])

  const ditado = useSpeechToText({
    onFinal: (texto) => {
      setInput((atual) => juntarDitado(atual, texto))
      try { inputRef.current?.focus() } catch { }
    },
  })
  const [mealName, setMealName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [entriesTick, setEntriesTick] = useState(0)
  const [chatOpen, setChatOpen] = useState(false)
  /** Gerador de dieta aberto dentro do card de refeição (antes era um card à parte). */
  const [dietOpen, setDietOpen] = useState(false)
  // Offline REATIVO: isOffline() é lido no render e não re-renderiza sozinho quando
  // a rede cai. O chat depende do servidor, então o campo precisa sumir de verdade.
  const [chatOffline, setChatOffline] = useState(false)
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

  // ── Fase nutricional (Cutting / Manutenção / Off) ──────────────────────────
  // O clique só PREENCHE os campos abaixo com a meta recalculada do TDEE — nada é
  // gravado até o usuário conferir e apertar Salvar. É o que evita apagar em
  // silêncio um ajuste manual de macros que ele tenha feito antes.
  const [phaseDraft, setPhaseDraft] = useState<NutritionPhase>(currentPhase ?? 'MAINTAIN')
  const [phaseTouched, setPhaseTouched] = useState(false)
  // Perfil sem peso/altura/idade/sexo não produz TDEE — sem isso o seletor não tem
  // o que calcular, então some e o painel segue 100% manual.
  const canUsePhases = !!profileStats

  const selectPhase = useCallback((phase: NutritionPhase) => {
    setPhaseDraft(phase)
    setPhaseTouched(true)
    setGoalsError('')
    const next = computeGoalsForPhase(profileStats, phase)
    if (next) setGoalsDraft(next)
  }, [profileStats])

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

  // ── Ações de IA do card de refeição ──────────────────────────────────────
  // Mesmos gates de antes, só nomeados: eram condições inline em dois lugares
  // diferentes da tela e agora as duas ações moram no mesmo card.
  const canChat = !!canViewMacros && isToday && !chatOffline
  const canGenerateDiet = !!canViewMacros && isToday && safeGoals.calories > 0
  // Importar é GRÁTIS (parsing local, sem IA) e por isso o gate é mais frouxo
  // que o de gerar: não exige meta salva nem que seja o dia de hoje — nenhum
  // dos dois muda o que um JSON de dieta contém.
  const canImportDiet = !!canViewMacros
  const [importOpen, setImportOpen] = useState(false)

  // Nomeado porque agora decide DUAS coisas: o atributo `disabled` e a cor do
  // botão. Como expressão inline repetida, as duas divergiriam no primeiro
  // ajuste — um botão clicável com cara de inativo, ou o contrário.
  const podeLancar = !!input.trim() && !isPending && !aiBusy && !schemaMissing

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
  /**
   * Saldo CRU — pode ser negativo, e é justamente aí que mora a informação.
   *
   * Antes existia só `remaining = Math.max(0, meta - consumido)`. O clamp faz
   * sentido para "quanto ainda cabe" (não existe "−172 restantes"), mas o ramo
   * de ESTOURO lia a mesma variável: com a meta ultrapassada o clamp já tinha
   * apagado o número, e a tela mostrava "+0 kcal acima" — reportado com print
   * da conta do dono em 11/08/2026 (2848 consumidos, meta 2676, ou seja 172
   * acima).
   *
   * O sinal de que eram duas contas divergentes estava à vista: quem decidia o
   * RÓTULO era `calorieOver` (via `calorieRatio`), e quem dava o NÚMERO era o
   * `remaining` clampado. Agora as duas leituras saem do mesmo saldo.
   */
  const saldoCalorico = safeGoals.calories - safeNumber(totals?.calories)
  const remaining = Math.max(0, saldoCalorico)
  const excedenteCalorico = Math.max(0, -saldoCalorico)

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

  // Impacto da simulação nas metas do dia (consumido + preview), nos QUATRO macros.
  // A conta vive em projectMeal (puro, testado) — a mesma função que o chat de nutrição
  // usa pra responder "se eu comer X, pra quanto vai?". Um cálculo, dois lugares.
  const previewProjection = useMemo(() => {
    if (!mealPreview || mealPreview.items.length === 0) return null
    return projectMeal(totals, safeGoals, mealPreview.meal)
  }, [mealPreview, totals, safeGoals])

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
    const syncChatOffline = () => setChatOffline(isOffline())
    syncChatOffline()
    const onOnline = () => { syncChatOffline(); window.setTimeout(() => setEntriesTick((v) => v + 1), 4000) }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', syncChatOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', syncChatOffline)
    }
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

      // Registra a fase escolhida junto da meta. Falhar aqui NÃO invalida o save: os
      // números — que é o que o usuário veio ajustar — já estão gravados. A fase é
      // metadado da intenção (usada quando não há meta salva e no contexto da IA);
      // perdê-la custa um reclique, desfazer a meta custa o trabalho dele.
      let phaseWarning = ''
      if (phaseTouched) {
        const res = await saveNutritionPhase(phaseDraft)
        if (!res.ok) phaseWarning = 'Meta salva, mas a fase não foi registrada. Tente de novo.'
      }

      setGoalsState({ calories: safeNumber(goalsDraft.calories), protein: safeNumber(goalsDraft.protein), carbs: safeNumber(goalsDraft.carbs), fat: safeNumber(goalsDraft.fat) })

      // Painel fica ABERTO quando só a fase falhou — fechar esconderia o aviso e o
      // usuário sairia achando que registrou a fase.
      if (phaseWarning) { setGoalsError(phaseWarning); return }
      setPhaseTouched(false)
      setGoalsOpen(false)
    } catch (e: unknown) { setGoalsError(getErrorMessage(e) || 'Falha ao salvar metas.') }
    finally { setGoalsSaving(false) }
  }

  const handleFavoriteSelect = useCallback((mealText: string) => { setInput(mealText); try { inputRef.current?.focus() } catch {} }, [])
  const handleDateChange = useCallback((d: string) => { setCurrentDateKey(d); setEntries([]); setTotals({ calories: 0, protein: 0, carbs: 0, fat: 0 }); setEntriesTick(v => v + 1) }, [])

  /**
   * Abre o editor de um lançamento (expande o card e semeia o rascunho).
   *
   * Saiu do JSX para poder ser chamada de fora do toque do usuário — é o que
   * o "Abrir o dia para editar" do histórico precisa fazer sozinho.
   */
  const abrirEditorDaEntry = useCallback((entry: MealEntry) => {
    setExpandedEntryId(entry.id)
    setEditingEntryId(entry.id)
    const existing = Array.isArray(entry.items) ? entry.items : []
    // Refeições antigas sem detalhamento: semeia 1 item com os macros atuais.
    const seeded: MealItemView[] = existing.length > 0
      ? existing.map(it => ({ label: String(it.label || ''), grams: safeNumber(it.grams), calories: safeNumber(it.calories), protein: safeNumber(it.protein), carbs: safeNumber(it.carbs), fat: safeNumber(it.fat) }))
      : [{ label: entry.food_name || 'Refeição', grams: 0, calories: safeNumber(entry.calories), protein: safeNumber(entry.protein), carbs: safeNumber(entry.carbs), fat: safeNumber(entry.fat) }]
    setEditDraft({ food_name: entry.food_name, items: seeded })
  }, [])

  const entriesAnchorRef = useRef<HTMLDivElement | null>(null)
  // Contador, não booleano: pedir o MESMO dia duas vezes precisa rolar as duas.
  const [levarAosLancamentos, setLevarAosLancamentos] = useState(0)

  /**
   * "Abrir o dia para editar", vindo do histórico.
   *
   * Trocar a data não bastava: a aba abre no topo (hero de calorias, macros,
   * scanner…) e a lista de lançamentos — a única superfície onde se edita ou
   * apaga uma refeição — fica lá embaixo. Escolhendo HOJE, que é o caso comum,
   * a tela não mudava nada e o botão parecia quebrado.
   *
   * As setas do `DateNavigator` continuam SEM rolar: ali o usuário está
   * navegando pelos dias e olhando o resumo do topo; arrastar a tela a cada
   * seta seria sequestrar o gesto dele.
   */
  /**
   * Pedido de edição que só pode ser atendido DEPOIS que os lançamentos do dia
   * chegarem do servidor: no instante do toque a lista ainda é a do dia
   * anterior (`handleDateChange` a esvazia). `id` = a refeição tocada no
   * histórico; `null` = veio do botão do dia.
   */
  const [editarAoCarregar, setEditarAoCarregar] = useState<{ id: string | null; ticket: number } | null>(null)

  const handlePickFromHistory = useCallback((d: string, mealId?: string) => {
    handleDateChange(d)
    setLevarAosLancamentos((n) => n + 1)
    setEditarAoCarregar((prev) => ({ id: mealId || null, ticket: (prev?.ticket ?? 0) + 1 }))
  }, [handleDateChange])

  useEffect(() => {
    if (!editarAoCarregar) return
    const lista = Array.isArray(entries) ? entries : []
    if (lista.length === 0) return
    // Com id, a refeição tocada. Sem id (botão do dia), a PRIMEIRA da lista —
    // que é a mais recente (`order created_at desc`), a que costuma precisar
    // de ajuste. Escolher a mais antiga seria arbitrário do mesmo jeito e
    // ainda erraria mais.
    const alvo = editarAoCarregar.id
      ? lista.find((e) => e.id === editarAoCarregar.id)
      : lista[0]
    // Refeição apagada em outro aparelho: some o pedido, não trava a tela.
    if (alvo) abrirEditorDaEntry(alvo)
    setEditarAoCarregar(null)
  }, [editarAoCarregar, entries, abrirEditorDaEntry])

  useEffect(() => {
    if (!levarAosLancamentos) return
    // O modal fecha no MESMO gesto: sem esperar o quadro seguinte, a rolagem
    // acontece com a folha ainda por cima e não se vê nada acontecer.
    const id = requestAnimationFrame(() => {
      try {
        entriesAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } catch {
        // WebView antiga sem `behavior: smooth` no contrato do objeto.
        entriesAnchorRef.current?.scrollIntoView(true)
      }
    })
    return () => cancelAnimationFrame(id)
  }, [levarAosLancamentos])
  // `openHistoryOnMount`: o menu do avatar abre a aba JÁ no histórico — é de lá
  // que o dono foi procurar (é onde mora o histórico de treinos).
  //
  // ⚠️ O valor inicial do `useState` só vale na PRIMEIRA montagem, e com a aba
  // de nutrição JÁ ABERTA este componente não remonta: o item do menu virava
  // um botão morto (relatado no iPhone em 25/08/2026 — "clico e não aparece
  // nada"). Parecia z-index, e não era; o modal nunca chegava a ser pedido.
  // Por isso o efeito abaixo, que reage à PROP em vez de só ao nascimento.
  const [historyOpen, setHistoryOpen] = useState(Boolean(openHistoryOnMount))
  useEffect(() => {
    if (!openHistoryOnMount) return
    setHistoryOpen(true)
    // O pedido é CONSUMIDO aqui. Sem isso a flag ficaria presa em `true` e o
    // segundo clique no item do menu não mudaria nada — o efeito só reage à
    // troca de valor, e o botão voltaria a ser morto a partir da segunda vez.
    onHistoryOpened?.()
  }, [openHistoryOnMount, onHistoryOpened])

  const handleBarcodeResult = useCallback(async (ean: string) => {
    setShowBarcodeScanner(false)
    // Era `window.prompt`: o diálogo do SISTEMA, sem a identidade do app, e que
    // no WKWebView bloqueia a thread. O do DialogContext é o mesmo que o resto
    // do app usa.
    const gramsStr = await prompt('Quantas gramas você consumiu?', `Produto escaneado (EAN ${ean})`, '100')
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
  }, [prompt, currentDateKey])

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4 pb-24">

      {/* ── Date Navigator ──────────────────────────────────────────────── */}
      <DateNavigator currentDate={currentDateKey} todayDate={todayDate} onDateChange={handleDateChange} onOpenHistory={() => setHistoryOpen(true)} />

      {/* ── Histórico (lista de dias) ───────────────────────────────────── */}
      <NutritionHistoryModal
        open={historyOpen}
        userId={userId}
        todayDate={todayDate}
        goals={safeGoals}
        onPickDate={handlePickFromHistory}
        onClose={() => setHistoryOpen(false)}
      />

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

          {/* Summary.
              O badge de percentual SAIU: ele repetia, em selo dourado, o que o
              anel ao lado já desenha — e ficava com mais destaque que o número
              que o usuário realmente procura no meio do dia. Agora o dominante
              é QUANTO AINDA CABE; o consumido continua no centro do anel e a
              meta vira contexto, em cinza. Mesma inversão feita nos macros
              ("faltam 97 g"). */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div>
              {calorieOver ? (
                <div className="text-2xl font-black tabular-nums leading-none text-red-400">
                  +{Math.round(excedenteCalorico)}
                  <span className="ml-1 text-sm font-bold text-red-300/80">kcal acima</span>
                </div>
              ) : remaining > 0 ? (
                <div className="text-2xl font-black tabular-nums leading-none text-white">
                  {Math.round(remaining)}
                  <span className="ml-1 text-sm font-bold text-neutral-400">kcal restantes</span>
                </div>
              ) : (
                <div className="text-2xl font-black leading-none text-green-400">Meta batida</div>
              )}
            </div>
            <div className="text-xs text-neutral-400 tabular-nums">
              de {Math.round(safeGoals.calories)} kcal
            </div>

          </div>
        </div>

        {/* Notas do dia — descanso e treino.
            Viviam DENTRO da coluna da direita, com ~200px de largura: doze
            palavras de explicação num badge de 10px quebravam em duas linhas e
            empurravam o resto. São notas de rodapé; ficam abaixo, na largura
            inteira do card, onde cabem numa linha só. */}
        {isToday && safeNumber(restDayReduction) > 0 && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-sky-500/15 bg-sky-500/[0.06] px-2.5 py-1.5">
            <Moon size={12} className="shrink-0 text-sky-300" aria-hidden="true" />
            <span className="text-[10px] leading-tight text-sky-300">
              Dia de descanso: meta ajustada <span className="font-semibold">−{Math.round(safeNumber(restDayReduction))} kcal</span>
              <span className="text-neutral-400"> · proteína mantida</span>
            </span>
          </div>
        )}

        {/* Gasto do treino — informativo apenas. NÃO entra na meta de propósito:
            "comer de volta" um gasto estimado sabota o déficit do cutting. */}
        {isToday && safeNumber(workoutCaloriesToday) > 0 && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-orange-500/15 bg-orange-500/[0.06] px-2.5 py-1.5">
            <Flame size={12} className="shrink-0 text-orange-300" aria-hidden="true" />
            <span className="text-[10px] leading-tight text-orange-300">
              Treino hoje: <span className="font-semibold">~{Math.round(safeNumber(workoutCaloriesToday))} kcal</span>
              <span className="text-neutral-400"> · estimativa, não muda a meta</span>
            </span>
          </div>
        )}

        {goalsSource === 'profile' && (
          /* "Ajustar" é um link de 10px com ~14px de altura de alvo — o
             `before:-inset-3` leva o toque a 44px sem inflar a linha. */
          <div className="mt-3 text-[10px] text-neutral-400 text-center">
            Meta via TDEE do perfil •{' '}
            <button
              type="button"
              onClick={() => setGoalsOpen(true)}
              className="relative font-semibold text-yellow-500 hover:text-yellow-400 before:absolute before:-inset-3 before:content-['']"
            >
              Ajustar
            </button>
          </div>
        )}

        {safeEntries.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex justify-center">
            <button
              type="button"
              onClick={() => setStory({ mode: 'day', content: dayToContent(totals, safeGoals, currentDateKey) })}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-yellow-200 text-xs font-bold uppercase tracking-wider hover:bg-yellow-500/25 active:scale-[0.98] transition"
            >
              <Clapperboard size={14} aria-hidden="true" />
              Compartilhar dia
            </button>
          </div>
        )}
      </Card>

      {/* O gatilho do chat MUDOU de lugar: agora vive dentro do card "Adicionar
          refeição", junto do "Gerar dieta". As três ações de comida (lançar,
          perguntar, gerar) ficam num lugar só em vez de espalhadas pela tela.
          A folha em si continua montada aqui, no nível de cima. */}
      <NutritionChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        dateKey={currentDateKey}
        goals={{ ...safeGoals, source: goalsSource ?? 'default' }}
        onLogged={() => setEntriesTick((v) => v + 1)}
      />

      {/* ══ MACROS ═══════════════════════════════════════════════════════ */}
      {canViewMacros ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-semibold">Macronutrientes</span>

            {/* Antes era TEXTO, não botão: 10px, sem borda, sem fundo, sem padding —
                nada dizia que aquilo era tocável, e o alvo tinha ~12px de altura
                (a HIG da Apple e o WCAG 2.5.5 pedem 44pt) num app que se usa com a
                mão suada no meio do treino. O emoji ⚙ ainda renderizava cinza pelo
                sistema, brigando com o amarelo do rótulo.

                Vira o pill de badge do design system, com ícone lucide como os
                componentes irmãos. O rótulo NÃO muda ao abrir — trocar "Metas" por
                "Fechar" quebrava a permanência do objeto; agora só o ícone e o
                preenchimento mudam, e o estado vai no aria-expanded.

                `before:-inset-2` estende a área de toque para ~44px sem inflar o
                layout do cabeçalho. */}
            <button
              type="button"
              onClick={() => setGoalsOpen(v => !v)}
              aria-expanded={goalsOpen}
              aria-label={goalsOpen ? 'Fechar edição de metas' : 'Editar metas de macronutrientes'}
              className={`relative inline-flex items-center gap-1.5 tap-44 h-9 px-3 rounded-full border text-[11px] font-bold uppercase tracking-[0.12em] transition-all duration-200 active:scale-95 touch-manipulation
                before:absolute before:-inset-2 before:content-['']
                ${goalsOpen
                  ? 'bg-yellow-500 border-yellow-500 text-black'
                  : 'bg-yellow-500/10 border-yellow-500/25 text-yellow-400 hover:bg-yellow-500/20 hover:border-yellow-500/40'
                }`}
            >
              {goalsOpen ? <X size={13} strokeWidth={2.5} /> : <SlidersHorizontal size={13} strokeWidth={2.5} />}
              Metas
            </button>
          </div>
          {/* Cores de CATEGORIA, todas da paleta do app e mutuamente distinguíveis.
              O vermelho não aparece aqui: ficou reservado para estouro de meta.

              `space-y-4` (16px) entre macros contra os 6px que separam rótulo e
              barra DENTRO de cada um: o par precisa estar mais junto que os
              vizinhos, senão a lei de proximidade agrupa errado. Visto no
              simulador em ago/2026 com `space-y-3` (12px), depois que a legenda
              lateral saiu da linha da barra: cada trilho parecia pertencer ao
              macro de BAIXO.

              `pt-2` em cima dos 12px do card: o pill METAS tem 36px de altura e
              termina praticamente encostado no "faltam X g" do primeiro macro —
              dois elementos de peso alto, empilhados na MESMA coluna da direita,
              a 11px um do outro. O cabeçalho precisa de ar próprio para não ler
              como parte da linha da proteína. */}
          <div className="pt-2 space-y-4">
            <MacroBar label="Proteína" value={totals.protein} goal={safeGoals.protein} color={MACRO_COLORS.protein} />
            <MacroBar label="Carboidratos" value={totals.carbs} goal={safeGoals.carbs} color={MACRO_COLORS.carbs} />
            <MacroBar label="Gordura" value={totals.fat} goal={safeGoals.fat} color={MACRO_COLORS.fat} />
          </div>

          {/* Goals editor inline */}
          {goalsOpen && (
            <div className="mt-2 pt-3 border-t border-white/[0.06] space-y-3">

              {/* ── Fase da dieta ─────────────────────────────────────────── */}
              {canUsePhases && (
                <PhaseSelector
                  value={phaseDraft}
                  onSelect={selectPhase}
                  isExplicit={phaseIsExplicit}
                  touched={phaseTouched}
                />
              )}

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
              {/* `null` = sabemos que o perfil está incompleto. `undefined` = não
                  sabemos (overlay servido do cache offline) — aí não sugerimos nada. */}
              {profileStats === null && (
                <p className="text-[10px] leading-snug text-neutral-400">
                  Informe peso, altura, idade e sexo no perfil para escolher a fase (cutting, manutenção ou off) e calcular a meta automaticamente.
                </p>
              )}
              {goalsError && <div className="text-xs text-red-400">{goalsError}</div>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setGoalsOpen(false)} className="tap-44 h-10 px-3 rounded-lg text-xs text-neutral-400 hover:text-white transition">Cancelar</button>
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
            <button type="button" onClick={() => (window.location.href = '/marketplace')} className="mt-3 tap-44 h-9 px-4 rounded-lg bg-yellow-500 text-black text-xs font-bold hover:bg-yellow-400 active:scale-95 transition">
              Ver planos
            </button>
          )}
        </Card>
      )}

      {/* ══ DAY SCORE ════════════════════════════════════════════════════ */}
      {canViewMacros && safeEntries.length > 0 && (
        <Card className="p-3"><NutritionDayScore totals={totals} goals={safeGoals} diaEncerrado={!isToday} /></Card>
      )}

      {/* ══ TREINO × NUTRIÇÃO CORRELATION ════════════════════════════════ */}
      <NutritionWorkoutCorrelation />

      {/* ══ QUICK ACTIONS ════════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-2">
        <QuickAction icon={Camera} label="Scanner" onClick={() => togglePanel('scanner')} active={activePanel === 'scanner'} />
        <QuickAction icon={Library} label="Biblioteca" onClick={() => togglePanel('library')} active={activePanel === 'library'} />
        <QuickAction icon={Droplet} label="Água" onClick={() => togglePanel('water')} active={activePanel === 'water'} />
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

      {/* ══ PLANO PRESCRITO PELO PROFESSOR ═══════════════════════════════ */}
      {/* NÃO gatear por canViewMacros: o plano é uma ENTREGA do professor (não um recurso VIP
          self-service), e o aluno pode ser FREE. O componente já se auto-protege — só
          renderiza se existir plano ativo (senão retorna null). Gatear pelo VIP do aluno
          escondia a dieta prescrita de alunos sem assinatura própria (achado da revisão). */}
      <PrescribedDietPlan
        dateKey={currentDateKey}
        canApply={isToday}
        onApplied={() => setEntriesTick(v => v + 1)}
      />

      {/* ══ MINHA DIETA (salva pelo próprio usuário) ══════════════════════ */}
      {/* Mesma regra do prescrito: sem gate de VIP aqui — o componente só renderiza
          se existir plano salvo, e quem gatear a GERAÇÃO é o DietGenerator. Esconder
          a dieta já salva de quem perdeu o VIP seria tirar dele um dado próprio. */}
      <MyDietPlan
        dateKey={currentDateKey}
        canApply={isToday}
        onApplied={() => setEntriesTick(v => v + 1)}
      />

      {/* O gerador de dieta saiu daqui — virou uma ação dentro do card
          "Adicionar refeição" (ver AÇÕES DE IA logo abaixo). */}

      {/* ══ MEAL INPUT ═══════════════════════════════════════════════════ */}
      {!isFutureDate && (
        <Card glow="bg-[linear-gradient(180deg,rgba(250,204,21,0.04)_0%,transparent_50%)]" className="p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-semibold">
            Adicionar refeição{!isToday && ` — ${currentDateKey}`}
          </div>
          {/* O exemplo saiu daqui e virou o placeholder do campo: ele é a
              instrução que ENSINA o parser ("150g frango + arroz + salada") e
              estava a dois campos de distância de onde se digita, enquanto o
              placeholder do textarea ("O que você comeu?") não ensinava nada. */}
          <input {...properNameFieldProps}
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
            placeholder={schemaMissing ? 'Nutrição não configurada.' : 'Ex.: 150g frango + arroz branco + salada'}
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
                        <span className="min-w-0 truncate text-neutral-200">
                          {it.label}
                          {/* Peso assumido, sempre à vista. Quando o alimento não vem da
                              base local (TACO/Open Food Facts/customizado), não existe
                              peso por unidade e o parser precisa chutar — aqui o chute
                              deixa de ser silencioso e o usuário corrige com "200g de X". */}
                          {it.grams > 0 && <span className="ml-1 text-neutral-400">· {it.grams}g</span>}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-neutral-400">
                          <span className="font-semibold text-neutral-100">{it.calories}</span> kcal
                          <span className="ml-2 text-[10px] text-neutral-400">P{it.protein} C{it.carbs} G{it.fat}</span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-neutral-400">
                    Total: P {mealPreview.meal.protein} · C {mealPreview.meal.carbs} · G {mealPreview.meal.fat} g
                  </div>

                  {previewProjection && previewProjection.calories.remaining !== null && (
                    <div className={`mt-1 text-xs font-medium ${previewProjection.calories.over ? 'text-red-300' : 'text-emerald-300'}`}>
                      {previewProjection.calories.over
                        ? `Passa a meta em ${Math.abs(previewProjection.calories.remaining)} kcal (${previewProjection.calories.projected}/${previewProjection.calories.goal})`
                        : `Sobram ${previewProjection.calories.remaining} kcal na meta (${previewProjection.calories.projected}/${previewProjection.calories.goal})`}
                    </div>
                  )}

                  {/* Onde os macros FICAM se lançar. Antes só as kcal eram projetadas —
                      dava pra caber na meta de calorias e estourar a gordura sem aviso. */}
                  {previewProjection && (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-400">
                      {PREVIEW_MACROS.map(({ key, label }) => {
                        const m = previewProjection[key]
                        if (m.remaining === null) return null
                        return (
                          <span key={key}>
                            {label}{' '}
                            <span className={m.over ? 'font-semibold text-red-300' : 'font-semibold text-neutral-200'}>
                              {m.projected}
                            </span>
                            /{m.goal}g
                          </span>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {mealPreview.unknownLines.length > 0 && (
                <div className={`${mealPreview.items.length > 0 ? 'mt-2' : 'mt-1'} text-[11px] text-neutral-400`}>
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

          {/* Submit row — a ação primária da tela.

              O botão era `bg-gradient-to-r from-yellow-400 to-amber-500`, e o
              app inteiro usa `bg-yellow-500` sólido no CTA (TREINAR AGORA, VER
              PERFIL, Salvar): trocado por consistência. Altura de 40 para 44px,
              o mínimo da HIG para toque, que o card errava nos três botões.

              CORREÇÃO de diagnóstico: o tom "marrom" que o dono viu no aparelho
              NÃO vinha do gradiente — vinha do estado desabilitado, tratado
              logo abaixo. Verificado no simulador: com texto digitado, o botão
              sempre foi amarelo. */}
          <div className="mt-3 flex items-center gap-2">
            {/* Desabilitado é CINZA, não amarelo a 40%.
                `disabled:opacity-40` sobre `bg-yellow-500` num fundo #0a0a0a
                compõe um marrom-oliva — e foi exatamente assim que o dono
                enxergou o botão no aparelho: não como "desativado", mas como
                cor errada, um botão quebrado. Estado inativo tem que ler como
                inativo. */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!podeLancar}
              className={`flex-1 h-11 inline-flex items-center justify-center gap-1.5 rounded-xl font-black text-sm transition ${
                podeLancar
                  ? 'bg-yellow-500 text-black hover:bg-yellow-400 active:scale-[0.98]'
                  : 'bg-white/[0.06] text-neutral-400'
              }`}
            >
              {aiBusy
                ? <><Bot size={15} aria-hidden="true" />Calculando…</>
                : isPending
                  ? 'Processando…'
                  : <><Plus size={15} strokeWidth={3} aria-hidden="true" />Lançar</>}
            </button>
            {podeDitar && !schemaMissing && (
              /* Ditar a refeição. Mesma anatomia do scanner ao lado: são as
                 duas formas de NÃO digitar, e ficam juntas.
                 Gravando, o botão vira "parar" e ganha o dourado da ação em
                 curso — sem vermelho, que neste app é erro e estouro de meta. */
              <button
                type="button"
                onClick={() => (ditado.gravando ? ditado.parar() : ditado.iniciar())}
                aria-label={ditado.gravando ? 'Parar de ditar' : 'Ditar a refeição'}
                aria-pressed={ditado.gravando}
                className={`flex size-11 shrink-0 items-center justify-center rounded-xl border transition active:scale-95 ${
                  ditado.gravando
                    ? 'border-yellow-500/50 bg-yellow-500/15 text-yellow-300 animate-pulse'
                    : 'border-white/[0.08] bg-white/[0.03] text-neutral-300 hover:border-yellow-500/30 hover:text-white'
                }`}
              >
                {ditado.gravando ? <Square size={16} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
              </button>
            )}
            {isNative && (
              /* Ícone órfão de 36px num cinza mudo — agora com a mesma altura e
                 a mesma linguagem de borda dos secundários, e alvo de 44px. */
              <button
                type="button"
                onClick={() => setShowBarcodeScanner(true)}
                aria-label="Escanear código de barras"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-300 transition hover:border-yellow-500/30 hover:text-white active:scale-95"
              >
                <ScanBarcode size={18} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Ouvindo. O parcial fica à vista para o usuário saber que o
              aparelho o entendeu ANTES de o texto cair no campo — sem isso,
              ditar é falar para um ícone e esperar. */}
          {ditado.gravando && (
            <div
              className="mt-2 flex items-start gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.06] px-3 py-2.5"
              role="status"
              aria-live="polite"
            >
              <Mic size={14} className="mt-0.5 shrink-0 animate-pulse text-yellow-400" aria-hidden="true" />
              <span className="min-w-0 text-xs text-yellow-100/90">
                {ditado.parcial || 'Ouvindo… fale o que você comeu.'}
              </span>
            </div>
          )}

          {ditado.erro && !ditado.gravando && (
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
              <span className="min-w-0 text-xs text-neutral-300">{ditado.erro}</span>
              <button
                type="button"
                onClick={ditado.limparErro}
                aria-label="Dispensar aviso do ditado"
                className="ml-auto shrink-0 text-neutral-400 transition hover:text-white"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* ══ AÇÕES DE IA ═══════════════════════════════════════════════
              "Perguntar" e "Gerar dieta" viviam soltos na tela — um acima dos
              macros, outro num card próprio. Como os três são a mesma intenção
              ("resolver a comida de agora"), moram juntos aqui embaixo do Lançar.
              Gates preservados um a um:
              - canViewMacros: recurso Pro (mesma cota das rotas de nutrição).
              - isToday: a aba navega por datas; simular/gerar "agora" sobre um
                dia fechado gravaria no passado sem avisar.
              - !chatOffline: o Mixer tem refeições otimistas que ainda não estão
                no banco — offline, o chat contradiria o anel da própria tela.
              - goals.calories > 0: sem meta não há dieta a gerar. */}
          {(canChat || canGenerateDiet || canImportDiet) && (
            <div className="mt-2 flex items-center gap-2">
              {canChat && (
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs font-semibold text-neutral-300 transition hover:border-yellow-500/30 hover:text-white active:scale-[0.98]"
                >
                  <Sparkles size={14} className="text-yellow-500" aria-hidden="true" />
                  Perguntar
                </button>
              )}
              {canGenerateDiet && (
                <button
                  type="button"
                  onClick={() => setDietOpen(v => !v)}
                  aria-expanded={dietOpen}
                  className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition active:scale-[0.98] ${
                    dietOpen
                      ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
                      : 'border-white/[0.08] bg-white/[0.03] text-neutral-300 hover:border-yellow-500/30 hover:text-white'
                  }`}
                >
                  <UtensilsCrossed size={14} className={dietOpen ? 'text-yellow-300' : 'text-yellow-500'} aria-hidden="true" />
                  {dietOpen ? 'Fechar dieta' : 'Gerar dieta'}
                </button>
              )}
              {canImportDiet && (
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs font-semibold text-neutral-300 transition hover:border-yellow-500/30 hover:text-white active:scale-[0.98]"
                >
                  <ClipboardPaste size={14} className="text-yellow-500" aria-hidden="true" />
                  Importar
                </button>
              )}
            </div>
          )}

          {canImportDiet && (
            <DietJsonImportModal
              open={importOpen}
              onClose={() => setImportOpen(false)}
              onImported={() => setEntriesTick(v => v + 1)}
            />
          )}

          {canGenerateDiet && dietOpen && (
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              <DietGenerator
                embedded
                goals={safeGoals}
                dateKey={currentDateKey}
                hideVipCtas={hideVipCtas}
                onApplied={() => setEntriesTick(v => v + 1)}
              />
            </div>
          )}

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
              {String(error).startsWith('Não reconheci') && !aiUpgrade && (
                <button type="button" onClick={estimateWithAi} disabled={aiBusy} className="mt-2 inline-flex h-11 items-center gap-1.5 px-3 rounded-lg bg-white/[0.06] border border-white/[0.08] text-xs font-semibold text-white hover:bg-white/[0.1] disabled:opacity-50 transition">
                  {aiBusy ? 'Estimando...' : <><Bot size={14} aria-hidden="true" />Estimar com IA</>}
                </button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ══ ENTRIES LIST ═════════════════════════════════════════════════ */}
      {/* Âncora do "Abrir o dia para editar" (histórico). Sem ela o botão
          trocava a data e deixava o usuário no TOPO da aba — os lançamentos
          ficam no fim da página, e para quem já estava no dia de hoje nada
          mudava na tela: "clico e ele só abre a aba de nutrição". */}
      <div ref={entriesAnchorRef} className="scroll-mt-4">
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
              <UtensilsCrossed size={28} className="mx-auto mb-2 text-neutral-600" aria-hidden="true" />
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
                onStartEdit={abrirEditorDaEntry}
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
      </div>

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
