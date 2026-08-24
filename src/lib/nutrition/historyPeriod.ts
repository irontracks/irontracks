/**
 * O PERÍODO do histórico de nutrição — janelas fixas e intervalo escolhido
 * pelo usuário, resolvidos no mesmo lugar.
 *
 * Nasceu do pedido de exportar o histórico em PDF para levar ao nutricionista
 * (24/08/2026): "às vezes ele quer os 3 últimos meses". Até então a tela só
 * sabia contar N dias para trás a partir de hoje, e um intervalo como
 * "1º de maio a 31 de julho" não tinha como ser dito.
 *
 * Tudo aqui é função PURA sobre strings `YYYY-MM-DD` — o mesmo formato da
 * coluna `date` de `nutrition_meal_entries`, que já é o dia BRT gravado pelo
 * app. **Não converta para `Date` e de volta sem fixar a hora**: `new Date('2026-08-24')`
 * é meia-noite UTC, que no Brasil ainda é o dia 23 — a mesma classe de defeito
 * que já pôs o treino das 22h no dia seguinte no heatmap de nutrição e que
 * errou o streak em 36 de 633 sessões. Por isso as conversões daqui usam
 * `T12:00:00`, meio-dia local, que sobrevive a qualquer fuso do Brasil.
 */

/** Janelas de um toque. O 90 já existia na tela; 15 entrou com a exportação. */
export const JANELAS_FIXAS = [7, 15, 30, 90] as const

/**
 * Teto do intervalo personalizado.
 *
 * Não é medo de payload — a consulta traz 5 colunas numéricas por refeição, e
 * um ano são ~1.500 linhas leves. É que um PDF com mais de 366 linhas de
 * tabela deixa de ser um documento que alguém lê e vira um despejo; e o pedido
 * concreto ("3 últimos meses") cabe folgado. Quem precisar de mais exporta em
 * duas partes, com os intervalos que quiser.
 */
export const MAX_DIAS_PERIODO = 366

export type NutritionPeriod = {
  /** Primeiro dia do intervalo, inclusive (YYYY-MM-DD). */
  inicio: string
  /** Último dia do intervalo, inclusive (YYYY-MM-DD). */
  fim: string
  /** Tamanho em dias, contando as duas pontas. É o denominador da cobertura. */
  dias: number
  /** `null` num intervalo personalizado — ele não é "os últimos N dias". */
  janelaFixa: number | null
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/

/** A string é uma data-calendário válida (e não "2026-02-31")? */
export function isDataValida(s: unknown): s is string {
  const v = String(s ?? '')
  if (!RE_DATA.test(v)) return false
  const d = new Date(`${v}T12:00:00`)
  if (Number.isNaN(d.getTime())) return false
  // `new Date('2026-02-31')` não lança: ele rola para 3 de março. Só a ida e
  // volta prova que o dia existe no calendário.
  return d.toISOString().slice(0, 10) === v
}

/** Soma dias a uma data-calendário, sem passar perto da meia-noite. */
export function somarDias(date: string, delta: number): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + Math.trunc(delta))
  return d.toISOString().slice(0, 10)
}

/** Dias entre duas datas, contando as DUAS pontas (mesmo dia = 1). */
export function contarDias(inicio: string, fim: string): number {
  const a = new Date(`${inicio}T12:00:00`).getTime()
  const b = new Date(`${fim}T12:00:00`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.floor((b - a) / 86_400_000) + 1
}

/** Período de uma janela fixa: os últimos `dias` até hoje, inclusive. */
export function periodoDaJanela(hoje: string, dias: number): NutritionPeriod {
  const n = Math.max(1, Math.floor(dias))
  return { inicio: somarDias(hoje, -(n - 1)), fim: hoje, dias: n, janelaFixa: n }
}

export type ResultadoPeriodo =
  | { ok: true; periodo: NutritionPeriod }
  | { ok: false; erro: string }

/**
 * Valida e normaliza o intervalo digitado pelo usuário.
 *
 * As mensagens são as que aparecem na tela — por isso são frases, não códigos.
 * Cada recusa aqui existe para impedir um PDF que MENTE: intervalo invertido
 * geraria um relatório vazio com cara de "você não comeu nada", e um intervalo
 * que avança no futuro infla o denominador da cobertura ("12 de 90 dias") com
 * dias que ainda não aconteceram.
 */
export function resolverPeriodoPersonalizado(
  inicio: unknown,
  fim: unknown,
  hoje: string,
): ResultadoPeriodo {
  if (!isDataValida(inicio) || !isDataValida(fim)) {
    return { ok: false, erro: 'Escolha as duas datas.' }
  }
  if (inicio > fim) {
    return { ok: false, erro: 'A data inicial precisa vir antes da final.' }
  }
  if (isDataValida(hoje) && fim > hoje) {
    return { ok: false, erro: 'A data final não pode estar no futuro.' }
  }
  const dias = contarDias(inicio, fim)
  if (dias > MAX_DIAS_PERIODO) {
    return { ok: false, erro: `O período não pode passar de ${MAX_DIAS_PERIODO} dias.` }
  }
  return { ok: true, periodo: { inicio, fim, dias, janelaFixa: null } }
}

/**
 * Como o período se chama na tela e no arquivo exportado.
 *
 * Janela fixa vira o nome que o usuário usa ("Últimos 7 dias"); intervalo
 * escolhido mostra as DATAS, porque "83 dias" não diz a ninguém — e é
 * justamente esse relatório que vai para o nutricionista.
 */
export function rotuloPeriodo(p: NutritionPeriod): string {
  if (p.janelaFixa) return `Últimos ${p.janelaFixa} dias`
  return `${formatarDataCurta(p.inicio)} a ${formatarDataCurta(p.fim)}`
}

/** "24/08/2026" — a forma que o brasileiro lê num documento. */
export function formatarDataCurta(date: string): string {
  if (!isDataValida(date)) return String(date ?? '')
  const [a, m, d] = date.split('-')
  return `${d}/${m}/${a}`
}

/** Sufixo do nome do arquivo: `2026-05-01_2026-07-31`. */
export function sufixoArquivo(p: NutritionPeriod): string {
  return `${p.inicio}_${p.fim}`
}
