/**
 * Dossiê do aluno — semana ou mês, com treinos, dieta, exames e avaliações.
 *
 * Função pura sobre dados já carregados: quem busca é `useDossier`, quem
 * desenha é `buildDossierHtml`. A regra que este módulo carrega é a do dono
 * (02/09/2026): **se não houver registro NO período, o dossiê pega o ÚLTIMO
 * de qualquer data, com a data e um aviso de "fora do período"; sem nenhum
 * registrado, a seção diz isso** — nunca some em silêncio.
 */

import type { PeriodStats } from '@/types/workout'
import type { PeriodSessionDetail } from '@/utils/report/periodSessionDetails'
import type { NutritionHistorySummary, NutritionHistoryDay } from '@/lib/nutrition/history'
import { brtDateKey } from '@/utils/cron/dateBrt'
import { somarDias } from '@/lib/nutrition/historyPeriod'

export type DossierTipo = 'week' | 'month'

export const DOSSIER_DIAS: Record<DossierTipo, number> = { week: 7, month: 30 }

export interface DossierPeriodo {
  tipo: DossierTipo
  dias: number
  /** YYYY-MM-DD (BRT), inclusivo. */
  inicio: string
  fim: string
}

/** Período que termina HOJE (BRT) e cobre `dias` dias, hoje incluso. */
export function periodoDoDossier(tipo: DossierTipo, hoje: string = brtDateKey()): DossierPeriodo {
  const dias = DOSSIER_DIAS[tipo]
  return { tipo, dias, inicio: somarDias(hoje, -(dias - 1)), fim: hoje }
}

export interface RegistroResolvido<T> {
  registro: T
  /** YYYY-MM-DD do registro. */
  data: string
  /** true quando o registro é anterior ao período (fallback "o último de qualquer data"). */
  foraDoPeriodo: boolean
}

const dataValida = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)

/**
 * O registro mais recente DENTRO do período; sem nenhum, o mais recente de
 * qualquer data, marcado como fora do período. `null` só quando não há
 * registro algum.
 */
export function escolherRegistro<T>(
  rows: readonly T[] | null | undefined,
  dataDe: (r: T) => unknown,
  periodo: Pick<DossierPeriodo, 'inicio' | 'fim'>,
): RegistroResolvido<T> | null {
  const lista = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ r, d: dataDe(r) }))
    .filter((x): x is { r: T; d: string } => dataValida(x.d))
    .map((x) => ({ r: x.r, d: x.d.slice(0, 10) }))
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0))
  if (!lista.length) return null
  const dentro = lista.find((x) => x.d >= periodo.inicio && x.d <= periodo.fim)
  if (dentro) return { registro: dentro.r, data: dentro.d, foraDoPeriodo: false }
  const ultimo = lista[0]
  return { registro: ultimo.r, data: ultimo.d, foraDoPeriodo: true }
}

export type Registro = Record<string, unknown>

export interface DossierInput {
  periodo: DossierPeriodo
  aluno: string
  /** ISO de quando foi gerado. */
  geradoEm: string
  treino: { stats: PeriodStats; sessions: PeriodSessionDetail[] } | null
  /** `null` quando não houve lançamento no período. */
  nutricao: NutritionHistorySummary | null
  nutricaoDias: NutritionHistoryDay[]
  /** Meta do dia (kcal), se houver, para o leitor comparar. */
  metaKcal: number | null
  exame: RegistroResolvido<Registro> | null
  avaliacaoFisica: RegistroResolvido<Registro> | null
  avaliacaoFoto: RegistroResolvido<Registro> | null
}

export interface DossierFontes {
  exames: Registro[]
  avaliacoes: Registro[]
  fotos: Registro[]
}

/**
 * Monta o input do dossiê a partir das listas cruas (já filtradas por status
 * "done" por quem buscou). Existe para o hook e o teste chamarem a MESMA
 * resolução de "no período ou o último".
 */
export function montarDossier(
  base: Omit<DossierInput, 'exame' | 'avaliacaoFisica' | 'avaliacaoFoto'>,
  fontes: DossierFontes,
): DossierInput {
  const p = base.periodo
  return {
    ...base,
    exame: escolherRegistro(fontes.exames, (r) => r.exam_date, p),
    avaliacaoFisica: escolherRegistro(fontes.avaliacoes, (r) => r.assessment_date ?? r.date, p),
    avaliacaoFoto: escolherRegistro(fontes.fotos, (r) => r.assessment_date, p),
  }
}

/** Frase padrão do aviso — uma só, para tela e PDF não divergirem. */
export function avisoForaDoPeriodo(data: string): string {
  return `Nenhum registro no período — mostrando o último, de ${formatarDataBr(data)} (fora do período).`
}

export const SEM_REGISTRO = 'Nenhum registro até hoje.'

export function formatarDataBr(yyyyMmDd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(yyyyMmDd || ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(yyyyMmDd || '')
}
