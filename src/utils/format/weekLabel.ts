/**
 * @module utils/format/weekLabel
 *
 * Rótulo da semana do Mapa Muscular e a frase que o card mostra quando ainda
 * não há insights — as duas puras, porque as duas erravam por motivos que só
 * aparecem no calendário.
 *
 * 1. **O rótulo saía um dia atrasado.** `weekStartDate` é um dia-calendário
 *    ('2026-08-17'), não um instante. A versão anterior fazia
 *    `new Date('2026-08-17T00:00:00.000Z')` e formatava com
 *    `toLocaleDateString('pt-BR')`, ou seja, no fuso do aparelho: em São Paulo
 *    (UTC−3) aquilo é 16/08 às 21h, e a semana inteira aparecia como
 *    "16/08–22/08". Mesmo defeito de fuso que já mordeu o heatmap de nutrição.
 *    Dia-calendário se formata cortando a string — nunca reinterpretando como
 *    timestamp.
 *
 * 2. **"Sem insights suficientes para essa semana" mentia sobre a causa.** A
 *    tela nunca pede análise à IA (chama sempre com `refreshAi: false`); quem
 *    grava é o cron `muscle-weekly-insights`, que roda domingo 22h UTC (19h
 *    BRT) sobre a semana que fechou. Logo, na semana CORRENTE a caixa estava
 *    condenada a dizer "sem dados suficientes" mesmo com 4 treinos na conta —
 *    e o dono foi perguntar por quê. Não faltam dados: falta a geração, que
 *    tem hora marcada.
 */
import { brtDateKey } from '@/utils/cron/dateBrt'

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** '2026-08-17' → '17/08'. Devolve a entrada crua se não for um dia ISO. */
export function formatIsoDayShort(iso: string): string {
  const m = ISO_DAY.exec(String(iso || '').trim())
  if (!m) return String(iso || '')
  return `${m[3]}/${m[2]}`
}

/** '2026-08-17' + '2026-08-23' → '17/08–23/08'. */
export function formatWeekRangeLabel(start: string, end: string): string {
  const s = String(start || '').trim()
  const e = String(end || '').trim()
  if (!s || !e) return 'Semana'
  return `${formatIsoDayShort(s)}–${formatIsoDayShort(e)}`
}

/**
 * O que dizer quando `insights.summary` está vazio.
 *
 * Semana ainda em curso → a análise TEM hora para chegar, e dizer isso é a
 * diferença entre "o app não conseguiu" e "ainda não é hora". Semana já
 * fechada sem análise → aí sim ela não foi gerada.
 */
export function insightsPendingMessage(weekEndDate: string, now: Date = new Date()): string {
  const end = String(weekEndDate || '').trim()
  const hoje = brtDateKey(now)
  // Sem data de fim confiável, a frase genérica é a honesta: não dá para
  // prometer domingo sem saber de que semana se está falando.
  if (!ISO_DAY.test(end) || !hoje) return 'Análise da semana ainda não gerada.'
  return hoje <= end
    ? 'A análise desta semana é gerada no domingo à noite.'
    : 'Análise não gerada para esta semana.'
}
