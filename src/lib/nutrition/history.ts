/**
 * Histórico de nutrição — os dias com lançamento, agregados.
 *
 * ⚠️ A fonte é `nutrition_meal_entries`, NUNCA `daily_nutrition_logs`.
 * O agregado diário existe e parece o caminho óbvio (kcal e macros já somados,
 * uma linha por dia), mas ele DIVERGE do que a tela do dia mostra — medido na
 * conta do dono em 16/08/2026, 3 dias em 61:
 *
 *   • 11/07 — 1050 kcal no agregado e ZERO refeições (as refeições foram
 *     apagadas e o agregado ficou para trás);
 *   • 06/07 — agregado 1701 × soma real 2126 (o agregado parou às 15:12, a
 *     última refeição entrou às 22:08);
 *   • 14/06 — agregado 1166 × soma real 729.
 *
 * Ou seja: ele é escrito em alguns caminhos e não em todos. A tela do dia soma
 * os ENTRIES — é o número que o usuário viu. Um histórico que discordasse dela
 * seria a mesma classe de defeito das 744 × 698 kcal entre relatório e
 * nutrição: duas superfícies, dois números, nenhuma forma de o usuário saber
 * qual vale.
 *
 * ⚠️ E nunca selecione `items`: é o jsonb com a refeição inteira quebrada em
 * alimentos. Trazê-lo para uma LISTA serve centenas de KB para desenhar um
 * total — o mesmo engorda-payload que o `slimHistoryRow` desfez no histórico
 * de treino.
 */

/** Um dia com pelo menos um lançamento. Dia sem lançamento não entra na lista. */
export type NutritionHistoryDay = {
  /** YYYY-MM-DD, o mesmo `date` da tabela (dia BRT gravado pelo app). */
  date: string
  calories: number
  protein: number
  carbs: number
  fat: number
  /** Quantas refeições foram lançadas naquele dia. */
  meals: number
}

export type NutritionHistoryEntryRow = {
  date?: string | null
  calories?: number | string | null
  protein?: number | string | null
  carbs?: number | string | null
  fat?: number | string | null
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/**
 * Agrega as linhas cruas por dia, do mais recente para o mais antigo.
 * Função pura: é ela que os testes exercitam.
 */
export function aggregateEntriesByDay(rows: NutritionHistoryEntryRow[] | null | undefined): NutritionHistoryDay[] {
  const porDia = new Map<string, NutritionHistoryDay>()
  for (const r of Array.isArray(rows) ? rows : []) {
    const date = String(r?.date || '').slice(0, 10)
    if (!date) continue
    const acc = porDia.get(date) ?? { date, calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 }
    acc.calories += num(r?.calories)
    acc.protein += num(r?.protein)
    acc.carbs += num(r?.carbs)
    acc.fat += num(r?.fat)
    acc.meals += 1
    porDia.set(date, acc)
  }
  return Array.from(porDia.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export type NutritionHistorySummary = {
  /** Dias COM lançamento na janela que ENTRAM na conta (já sem os marcados). */
  loggedDays: number
  /**
   * Dias que o usuário marcou como registro incompleto e que por isso saíram
   * das médias E do denominador.
   *
   * Sai junto com o resto porque a tela precisa DIZER que excluiu: uma média
   * que muda sem explicação é pior que a média contaminada — o usuário perde a
   * confiança nos dois números. Medido na base do dono (24/08/2026): 11 dos 68
   * dias eram registro parcial, e a média ia de 2.199 para 2.493.
   */
  excludedDays: number
  /** Tamanho da janela em dias — o denominador honesto da cobertura. */
  windowDays: number
  /** Médias sobre os dias REGISTRADOS (ver abaixo). 0 quando não há nenhum. */
  avgCalories: number
  avgProtein: number
  avgCarbs: number
  avgFat: number
  /**
   * SOMA da janela — o que a pessoa comeu no período inteiro.
   *
   * Existe porque "MÊS: 2.208 kcal" lia como o dia de hoje para quem abriu o
   * story (relato do dono, 19/08/2026): a média é a métrica comparável com a
   * meta diária, mas sozinha ela não parece um mês. O total sai daqui, e não
   * de `avg × loggedDays` no consumidor — duas contas para o mesmo número é
   * como nasce divergência entre a tela e o que foi postado.
   */
  totalCalories: number
  totalProtein: number
  totalCarbs: number
  totalFat: number
}

/**
 * Resumo da janela.
 *
 * A média divide pelos dias REGISTRADOS, não pelo tamanho da janela — e a
 * cobertura (`loggedDays` de `windowDays`) viaja junto para quem exibe.
 *
 * A diferença não é detalhe: no treino, dia sem sessão significa descanso; na
 * nutrição, dia sem lançamento significa que a pessoa esqueceu de lançar.
 * Dividir 12 dias de comida por 30 devolveria ~950 kcal/dia para quem come
 * 2400 — um número inventado com cara de medição, que é exatamente o defeito
 * do `workout_calories: 300` que já saiu do heatmap.
 */
export function summarizeHistory(
  days: NutritionHistoryDay[] | null | undefined,
  windowDays: number,
  /**
   * Dias marcados como registro incompleto (`nutrition_day_flags`). Saem da
   * média E do denominador — um dia em que a pessoa lançou só o café não é um
   * dia de 580 kcal, é um dia sem dado.
   *
   * Parâmetro opcional de propósito: o story e outros chamadores continuam
   * funcionando sem saber que isto existe, e quem passa o conjunto recebe o
   * número limpo pela MESMA função. Duas contas para a mesma média é como
   * nasce divergência entre a tela e o que foi exportado.
   */
  excluded?: ReadonlySet<string> | null,
): NutritionHistorySummary {
  const todos = Array.isArray(days) ? days : []
  const lista = excluded?.size ? todos.filter((d) => !excluded.has(d.date)) : todos
  const excludedDays = todos.length - lista.length
  const loggedDays = lista.length
  if (!loggedDays) {
    return {
      loggedDays: 0, excludedDays, windowDays,
      avgCalories: 0, avgProtein: 0, avgCarbs: 0, avgFat: 0,
      totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0,
    }
  }
  const soma = (pega: (d: NutritionHistoryDay) => number) =>
    Math.round(lista.reduce((a, d) => a + num(pega(d)), 0))
  // A média sai da MESMA soma — sem uma segunda varredura que pudesse divergir
  // por arredondamento.
  const media = (total: number) => Math.round(total / loggedDays)

  const totalCalories = soma((d) => d.calories)
  const totalProtein = soma((d) => d.protein)
  const totalCarbs = soma((d) => d.carbs)
  const totalFat = soma((d) => d.fat)

  return {
    loggedDays,
    excludedDays,
    windowDays,
    avgCalories: media(totalCalories),
    avgProtein: media(totalProtein),
    avgCarbs: media(totalCarbs),
    avgFat: media(totalFat),
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
  }
}

/**
 * Nome do período pela janela. "Semana" e "Mês" são o que o usuário chama de
 * 7 e 30 dias; fora disso, a contagem crua — inventar nome para 45 dias seria
 * pior que dizer "45 dias".
 */
export function periodLabel(windowDays: number): string {
  if (windowDays === 7) return 'Semana'
  if (windowDays === 30) return 'Mês'
  return `${Math.max(1, Math.floor(windowDays))} dias`
}

/** "10 – 16 de ago." — o intervalo que o período cobre, para o story. */
export function periodRangeText(endDate: string, windowDays: number): string {
  const fim = new Date(`${endDate}T12:00:00`)
  const ini = new Date(`${windowStartDate(endDate, windowDays)}T12:00:00`)
  try {
    const mesIni = ini.toLocaleDateString('pt-BR', { month: 'short' })
    const mesFim = fim.toLocaleDateString('pt-BR', { month: 'short' })
    // Mesmo mês: o nome aparece uma vez só ("10 – 16 de ago.").
    return mesIni === mesFim
      ? `${ini.getDate()} – ${fim.getDate()} de ${mesFim}`
      : `${ini.getDate()} de ${mesIni} – ${fim.getDate()} de ${mesFim}`
  } catch {
    return `${windowStartDate(endDate, windowDays)} – ${endDate}`
  }
}

/** Primeiro dia da janela (YYYY-MM-DD), contando `days` dias até `endDate` inclusive. */
export function windowStartDate(endDate: string, days: number): string {
  const d = new Date(`${endDate}T12:00:00`)
  d.setDate(d.getDate() - (Math.max(1, Math.floor(days)) - 1))
  return d.toISOString().slice(0, 10)
}
