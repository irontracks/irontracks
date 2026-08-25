/**
 * As REFEIÇÕES de um dia — o que o histórico mostra ao abrir um card.
 *
 * Até 25/08/2026 o histórico só sabia os agregados (`date, calories, protein,
 * carbs, fat`) e o PDF dizia "5 refeições" sem dizer QUAIS. Tocar num dia
 * fechava o modal e trocava a data da aba, que abre no topo — as refeições
 * ficam no fim da página, então "abrir o dia" nunca mostrava o dia.
 *
 * Tudo aqui é função PURA sobre as linhas de `nutrition_meal_entries`. As duas
 * regras que valem a pena guardar:
 *
 * 1. **O dia é a coluna `date`, nunca derivado de `created_at`.** A coluna já é
 *    o dia BRT que o app gravou; `created_at` é timestamptz. Um lançamento das
 *    22h30 em São Paulo tem `created_at` no dia SEGUINTE em UTC — a mesma
 *    classe de defeito que já pôs o treino das 22h no dia errado do heatmap e
 *    errou o streak em 36 de 633 sessões.
 * 2. **A HORA vem de `created_at`, e em BRT explícito.** Sem `timeZone`, o
 *    horário sai no fuso de quem abre — o relatório impresso num servidor em
 *    UTC diria que o café da manhã foi às 11h.
 */

/** Linha crua de `nutrition_meal_entries`, como o PostgREST devolve. */
export type NutritionMealRow = {
  id?: unknown
  date?: unknown
  created_at?: unknown
  food_name?: unknown
  calories?: unknown
  protein?: unknown
  carbs?: unknown
  fat?: unknown
  items?: unknown
}

/** Um alimento dentro da refeição ("150g arroz"), como o parser já gravou. */
export type NutritionMealItem = {
  label: string
  grams: number
}

export type NutritionMeal = {
  id: string
  /** Dia BRT `YYYY-MM-DD` — a coluna `date`, não o `created_at`. */
  date: string
  /** "07:34" em BRT, ou string vazia quando não dá para saber. */
  hora: string
  nome: string
  calories: number
  protein: number
  carbs: number
  fat: number
  itens: NutritionMealItem[]
}

/**
 * Teto do detalhe de refeições no PDF.
 *
 * Não é limite técnico: 90 dias × 5 refeições são ~450 linhas, e um documento
 * assim deixa de ser lido e vira despejo — o mesmo raciocínio do
 * `MAX_DIAS_PERIODO`. Acima disso o relatório sai só com os totais e **diz na
 * cara** que omitiu, na tela e no papel. Silêncio aqui seria pior que o corte.
 */
export const MAX_DIAS_DETALHE_REFEICOES = 31

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const FUSO = 'America/Sao_Paulo'

/** "07:34" no fuso do Brasil. String vazia quando o carimbo não presta. */
export function horaBrt(iso: unknown): string {
  const raw = String(iso ?? '')
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: FUSO,
    }).format(d)
  } catch {
    return ''
  }
}

function parseItens(raw: unknown): NutritionMealItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
    .map((it) => ({ label: String(it.label ?? '').trim(), grams: num(it.grams) }))
    .filter((it) => it.label)
}

/**
 * Linhas cruas → refeições, na ordem em que foram lançadas.
 *
 * Ordena por `created_at` crescente (a manhã antes da noite). Linha sem `date`
 * é descartada: sem o dia, ela não pertence a card nenhum.
 */
export function normalizeMealRows(rows: NutritionMealRow[] | null | undefined): NutritionMeal[] {
  const lista = Array.isArray(rows) ? rows : []
  return lista
    .map((r, i) => {
      const date = String(r?.date ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
      const criadoEm = String(r?.created_at ?? '')
      return {
        meal: {
          id: String(r?.id ?? `${date}-${i}`),
          date,
          hora: horaBrt(criadoEm),
          nome: String(r?.food_name ?? '').trim() || 'Refeição',
          calories: num(r?.calories),
          protein: num(r?.protein),
          carbs: num(r?.carbs),
          fat: num(r?.fat),
          itens: parseItens(r?.items),
        } satisfies NutritionMeal,
        ordem: new Date(criadoEm).getTime(),
      }
    })
    .filter((x): x is { meal: NutritionMeal; ordem: number } => x !== null)
    .sort((a, b) => {
      // Carimbo ruim vai para o fim, mas NÃO some — a refeição existe.
      const ta = Number.isFinite(a.ordem) ? a.ordem : Number.POSITIVE_INFINITY
      const tb = Number.isFinite(b.ordem) ? b.ordem : Number.POSITIVE_INFINITY
      return ta - tb
    })
    .map((x) => x.meal)
}

/** Refeições agrupadas pelo dia BRT, prontas para o card e para o relatório. */
export function groupMealsByDay(meals: NutritionMeal[] | null | undefined): Map<string, NutritionMeal[]> {
  const out = new Map<string, NutritionMeal[]>()
  for (const m of Array.isArray(meals) ? meals : []) {
    const atual = out.get(m.date)
    if (atual) atual.push(m)
    else out.set(m.date, [m])
  }
  return out
}

/** "150g arroz · 200g patinho" — o que a refeição tinha dentro, em uma linha. */
export function resumoItens(meal: NutritionMeal, maxItens = 4): string {
  if (!meal.itens.length) return ''
  const mostrados = meal.itens.slice(0, maxItens).map((it) => it.label)
  const resto = meal.itens.length - mostrados.length
  return resto > 0 ? `${mostrados.join(' · ')} +${resto}` : mostrados.join(' · ')
}
