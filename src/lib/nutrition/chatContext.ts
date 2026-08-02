/**
 * Snapshot de nutrição — o retrato que o chat recebe pra responder com precisão.
 *
 * ── Regra que dá nome ao arquivo ───────────────────────────────────────────────
 * TODO número que uma resposta possa citar já sai daqui PRONTO e arredondado. O
 * modelo nunca soma, subtrai nem divide: "quanto de proteína comi essa semana" é
 * LOOKUP de `week.sum.protein`, não uma conta do LLM. Sem isto, os alcances de
 * histórico/sugestão ficariam vibe-based mesmo com o de simulação sendo exato.
 *
 * ── Fatos vêm do servidor, metas vêm da tela ───────────────────────────────────
 * `today.totals` é a soma CRUA das entries (não o `daily_nutrition_logs`, que já
 * está arredondado): é o que dá paridade exata com o diário depois de lançar —
 * ver chatProjection.ts.
 * As METAS, ao contrário, chegam de quem chama (a tela). Não é desleixo: a meta
 * exibida já vem ajustada pelo modo dia-de-descanso (NutritionOverlay.tsx:213), e
 * recalculá-la aqui faria o chat dizer "meta 2900" com o anel ao lado dizendo
 * 2650. Meta é o alvo declarado do próprio usuário — não é fato a ser conferido, e
 * não há o que explorar em "mentir" o próprio alvo. Consistência com a tela vale
 * mais. Quem chama valida/clampa (Zod na rota).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SnapshotTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface SnapshotGoals extends SnapshotTotals {
  /** 'saved' = definida pelo usuário · 'profile' = derivada do TDEE · 'default' = NÃO tem meta. */
  source: 'saved' | 'profile' | 'default'
}

export interface SnapshotMeal {
  /** HH:MM em America/Sao_Paulo. */
  time: string
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface SnapshotWindow {
  days: number
  /** Dias com lançamento. Sem isto o modelo diz "sua média é 1.100 kcal" de quem lançou 3 de 7. */
  loggedDays: number
  sum: SnapshotTotals
  /** Média sobre os dias LANÇADOS (não sobre a janela) — senão pune quem não lançou. */
  avg: SnapshotTotals
}

export interface SnapshotRepertoireItem {
  name: string
  count: number
  avgCalories: number
  avgProtein: number
}

export interface NutritionSnapshot {
  today: {
    dateKey: string
    totals: SnapshotTotals
    waterMl: number
    meals: SnapshotMeal[]
  }
  goals: SnapshotGoals
  /** meta − consumido. Negativo = estourou. `null` no macro sem meta. */
  remaining: Record<keyof SnapshotTotals, number | null>
  week: SnapshotWindow
  month: SnapshotWindow
  trends: {
    /** Média 7d − média 30d. Positivo = comendo mais que o mês. `null` sem base. */
    kcalAvg7vs30: number | null
    proteinAvg7vs30: number | null
  }
  repertoire: SnapshotRepertoireItem[]
}

const MAX_MEALS = 12
const MAX_REPERTOIRE = 10
const WEEK_DAYS = 7
const MONTH_DAYS = 30
const TZ = 'America/Sao_Paulo'

const ZERO: SnapshotTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
const TOTAL_KEYS = ['calories', 'protein', 'carbs', 'fat'] as const

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Desloca uma dateKey YYYY-MM-DD por N dias, em UTC (a chave não tem hora). */
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = String(dateKey).split('-').map(Number)
  if (!y || !m || !d) return dateKey
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return dt.toISOString().slice(0, 10)
}

function hhmm(iso: unknown): string {
  try {
    const d = new Date(String(iso ?? ''))
    if (Number.isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return ''
  }
}

type DayRow = Record<string, unknown>

/** Agrega uma janela de dias já filtrada. Média sobre os dias LANÇADOS. */
function aggregate(rows: DayRow[], days: number): SnapshotWindow {
  const sum = { ...ZERO }
  let loggedDays = 0
  for (const r of rows) {
    const kcal = num(r.calories)
    const p = num(r.protein)
    const c = num(r.carbs)
    const f = num(r.fat)
    // Dia com linha mas tudo zerado não conta como lançado.
    if (kcal <= 0 && p <= 0 && c <= 0 && f <= 0) continue
    loggedDays += 1
    sum.calories += kcal
    sum.protein += p
    sum.carbs += c
    sum.fat += f
  }
  const avg = { ...ZERO }
  if (loggedDays > 0) {
    for (const k of TOTAL_KEYS) avg[k] = Math.round(sum[k] / loggedDays)
  }
  for (const k of TOTAL_KEYS) sum[k] = Math.round(sum[k])
  return { days, loggedDays, sum, avg }
}

/**
 * Monta o snapshot. Uma query por fonte, todas em paralelo.
 *
 * @param goals Metas EXIBIDAS na tela (ver o cabeçalho do arquivo).
 */
export async function buildNutritionSnapshot(
  supabase: SupabaseClient,
  userId: string,
  dateKey: string,
  goals: SnapshotGoals,
): Promise<NutritionSnapshot> {
  const monthStart = shiftDateKey(dateKey, -(MONTH_DAYS - 1))
  const weekStart = shiftDateKey(dateKey, -(WEEK_DAYS - 1))

  const [entriesRes, daysRes, repertoireRes] = await Promise.all([
    // Entries CRUAS de hoje → totais com paridade exata com o diário.
    supabase
      .from('nutrition_meal_entries')
      .select('created_at, food_name, calories, protein, carbs, fat')
      .eq('user_id', userId)
      .eq('date', dateKey)
      .order('created_at', { ascending: true }),
    supabase
      .from('daily_nutrition_logs')
      .select('date, calories, protein, carbs, fat, water_ml')
      .eq('user_id', userId)
      .gte('date', monthStart)
      .lte('date', dateKey),
    supabase
      .from('nutrition_meal_entries')
      .select('food_name, calories, protein')
      .eq('user_id', userId)
      .gte('date', monthStart)
      .lte('date', dateKey),
  ])

  // ── Hoje ────────────────────────────────────────────────────────────────────
  const entries = Array.isArray(entriesRes.data) ? (entriesRes.data as DayRow[]) : []
  const totals = { ...ZERO }
  for (const e of entries) {
    totals.calories += num(e.calories)
    totals.protein += num(e.protein)
    totals.carbs += num(e.carbs)
    totals.fat += num(e.fat)
  }
  const meals: SnapshotMeal[] = entries.slice(0, MAX_MEALS).map((e) => ({
    time: hhmm(e.created_at),
    name: String(e.food_name ?? '').slice(0, 80),
    calories: Math.round(num(e.calories)),
    protein: Math.round(num(e.protein)),
    carbs: Math.round(num(e.carbs)),
    fat: Math.round(num(e.fat)),
  }))

  // ── Janelas ─────────────────────────────────────────────────────────────────
  const dayRows = Array.isArray(daysRes.data) ? (daysRes.data as DayRow[]) : []
  const month = aggregate(dayRows, MONTH_DAYS)
  const week = aggregate(
    dayRows.filter((r) => String(r.date ?? '') >= weekStart),
    WEEK_DAYS,
  )
  const waterMl = Math.round(
    num(dayRows.find((r) => String(r.date ?? '') === dateKey)?.water_ml),
  )

  // ── Repertório ──────────────────────────────────────────────────────────────
  // O que impede a sugestão de salmão selvagem pra quem come ovo e arroz.
  const byName = new Map<string, { count: number; kcal: number; protein: number }>()
  for (const r of Array.isArray(repertoireRes.data) ? (repertoireRes.data as DayRow[]) : []) {
    const name = String(r.food_name ?? '').trim().slice(0, 80)
    if (!name) continue
    const key = name.toLowerCase()
    const prev = byName.get(key) ?? { count: 0, kcal: 0, protein: 0 }
    byName.set(key, {
      count: prev.count + 1,
      kcal: prev.kcal + num(r.calories),
      protein: prev.protein + num(r.protein),
    })
  }
  const repertoire: SnapshotRepertoireItem[] = [...byName.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, MAX_REPERTOIRE)
    .map(([name, v]) => ({
      name,
      count: v.count,
      avgCalories: Math.round(v.kcal / v.count),
      avgProtein: Math.round(v.protein / v.count),
    }))

  // ── Derivados ───────────────────────────────────────────────────────────────
  const roundedTotals = { ...ZERO }
  for (const k of TOTAL_KEYS) roundedTotals[k] = Math.round(totals[k])

  const remaining = {} as Record<keyof SnapshotTotals, number | null>
  for (const k of TOTAL_KEYS) {
    const goal = num(goals?.[k])
    remaining[k] = goal > 0 ? goal - roundedTotals[k] : null
  }

  const hasBoth = week.loggedDays > 0 && month.loggedDays > 0
  return {
    today: { dateKey, totals: roundedTotals, waterMl, meals },
    goals,
    remaining,
    week,
    month,
    trends: {
      kcalAvg7vs30: hasBoth ? week.avg.calories - month.avg.calories : null,
      proteinAvg7vs30: hasBoth ? week.avg.protein - month.avg.protein : null,
    },
    repertoire,
  }
}

/**
 * Serializa o snapshot pro prompt. Só números já prontos — nunca ids, e-mail ou
 * qualquer PII: o modelo não precisa e o que não vai no prompt não vaza.
 */
export function formatSnapshotForPrompt(snap: NutritionSnapshot): string {
  const t = snap.today.totals
  const g = snap.goals
  const r = snap.remaining
  const fmtRemaining = (k: keyof SnapshotTotals, unit: string) =>
    r[k] === null ? 'sem meta' : `${r[k]}${unit}`

  const lines: string[] = [
    `HOJE (${snap.today.dateKey})`,
    `- Consumido: ${t.calories} kcal · P ${t.protein}g · C ${t.carbs}g · G ${t.fat}g · água ${snap.today.waterMl}ml`,
    g.source === 'default'
      ? '- Meta: o usuário NÃO definiu meta (não fale como se ele tivesse escolhido uma).'
      : `- Meta: ${g.calories} kcal · P ${g.protein}g · C ${g.carbs}g · G ${g.fat}g`,
    `- Falta pra meta: ${fmtRemaining('calories', ' kcal')} · P ${fmtRemaining('protein', 'g')} · C ${fmtRemaining('carbs', 'g')} · G ${fmtRemaining('fat', 'g')} (negativo = já passou)`,
  ]

  lines.push(
    snap.today.meals.length
      ? `- Refeições de hoje:\n${snap.today.meals.map((m) => `  · ${m.time} ${m.name} — ${m.calories} kcal · P${m.protein} C${m.carbs} G${m.fat}`).join('\n')}`
      : '- Refeições de hoje: nenhuma lançada.',
  )

  const win = (label: string, w: SnapshotWindow) =>
    w.loggedDays === 0
      ? `${label}: nenhum dia lançado.`
      : `${label}: ${w.loggedDays} de ${w.days} dias lançados · total ${w.sum.calories} kcal / P ${w.sum.protein}g · média por dia lançado ${w.avg.calories} kcal · P ${w.avg.protein}g · C ${w.avg.carbs}g · G ${w.avg.fat}g`

  lines.push('', 'HISTÓRICO', `- ${win('Últimos 7 dias', snap.week)}`, `- ${win('Últimos 30 dias', snap.month)}`)

  if (snap.trends.kcalAvg7vs30 !== null) {
    lines.push(
      `- Tendência (média 7d vs 30d): ${snap.trends.kcalAvg7vs30 >= 0 ? '+' : ''}${snap.trends.kcalAvg7vs30} kcal/dia · ${snap.trends.proteinAvg7vs30! >= 0 ? '+' : ''}${snap.trends.proteinAvg7vs30}g de proteína/dia`,
    )
  }

  if (snap.repertoire.length) {
    lines.push(
      '',
      'O QUE ELE MAIS COME (30 dias — use isto pra sugerir comida que ele realmente come)',
      ...snap.repertoire.map((f) => `- ${f.name} (${f.count}×, ~${f.avgCalories} kcal · P${f.avgProtein})`),
    )
  }

  return lines.join('\n')
}
