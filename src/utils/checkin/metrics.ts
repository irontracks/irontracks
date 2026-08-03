/**
 * metrics — leitura e média dos campos de `workout_checkins`.
 *
 * Fonte única porque as MESMAS duas armadilhas já produziram números errados em
 * várias telas ao mesmo tempo (resumo VIP, inbox do professor, painel do aluno):
 *
 * 1. `Number(null) === 0`, e 0 passa no `Number.isFinite`. Toda média que
 *    convertia primeiro e filtrava depois contava campo AUSENTE como zero. Caso
 *    real medido em 03/08/2026: 11 check-ins na semana, só 6 com energia; a média
 *    verdadeira era 5,0 e a tela mostrava 2,7 (= 30 ÷ 11). O sono, 6,0 h, virava
 *    3,3 h pela mesma conta. Aqui a conversão devolve `null` para ausente e o
 *    denominador conta só o que existe de fato.
 *
 * 2. A coluna `mood` NUNCA é gravada — 0 de 1.003 linhas em produção. O check-in
 *    pré grava o humor como TEXTO em `answers.mood` ('great'|'normal'|'tired',
 *    já convertido em `energy`), e a satisfação do pós vive em
 *    `answers.satisfaction`. Quem lia a coluna exibia vazio ou 0 para sempre.
 *    `readCheckinSatisfaction` lê o lugar certo e mantém a coluna só como
 *    fallback legado.
 *
 * As escalas divergem entre campos e NÃO são todas 0–10 — rotular errado foi o
 * terceiro bug da mesma tela ("Energia 2.7/10" quando o máximo coletável é 5).
 */

export const CHECKIN_SCALES = {
  /** 'Como se sente?' → great=5 | normal=3 | tired=1 (DashboardModals + useWorkoutCrud). */
  energy: 5,
  /** Dor muscular 0–10 (CheckinScale no pré; mesmo range no pós). */
  soreness: 10,
  /** Satisfação do pós-treino 0–5 (buildPostCheckinRow). */
  satisfaction: 5,
  /** RPE da sessão 0–10. */
  rpe: 10,
} as const

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Converte um campo de check-in para número, tratando AUSENTE como `null` — nunca 0.
 * Aceita vírgula decimal (o app é pt-BR e alguns campos chegam como string).
 */
export const toCheckinNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || typeof v === 'boolean') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const raw = String(v).trim()
  if (!raw) return null
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const answersOf = (row: unknown): Record<string, unknown> => {
  if (!isRecord(row)) return {}
  return isRecord(row.answers) ? row.answers : {}
}

/** Energia do check-in pré (escala 1–5). O pós não coleta energia. */
export const readCheckinEnergy = (row: unknown): number | null =>
  toCheckinNumber(isRecord(row) ? row.energy : null)

/** Dor/fadiga (escala 0–10). Coletada nos dois tipos de check-in. */
export const readCheckinSoreness = (row: unknown): number | null => {
  const col = toCheckinNumber(isRecord(row) ? row.soreness : null)
  return col ?? toCheckinNumber(answersOf(row).soreness)
}

/** Horas de sono da última noite (só no pré). */
export const readCheckinSleepHours = (row: unknown): number | null =>
  toCheckinNumber(isRecord(row) ? row.sleep_hours : null)

/**
 * Satisfação do pós-treino (escala 0–5). Mora em `answers.satisfaction`;
 * a coluna `mood` é fallback legado e está vazia em toda a base atual.
 */
export const readCheckinSatisfaction = (row: unknown): number | null => {
  const fromAnswers = toCheckinNumber(answersOf(row).satisfaction)
  if (fromAnswers !== null) return fromAnswers
  return toCheckinNumber(isRecord(row) ? row.mood : null)
}

/** RPE da sessão (escala 0–10), gravado em `answers.rpe` no check-in pós. */
export const readCheckinRpe = (row: unknown): number | null =>
  toCheckinNumber(answersOf(row).rpe)

/**
 * Média que ignora ausentes de verdade: o denominador é a quantidade de valores
 * PRESENTES, não o total de linhas. Devolve `null` quando ninguém respondeu —
 * assim a UI omite a linha em vez de mostrar um zero inventado.
 */
export const averageCheckinValues = (values: unknown[], decimals = 1): number | null => {
  const present = (Array.isArray(values) ? values : [])
    .map((v) => toCheckinNumber(v))
    .filter((n): n is number => n !== null)
  if (!present.length) return null
  const factor = 10 ** Math.max(0, Math.trunc(decimals))
  return Math.round((present.reduce((a, b) => a + b, 0) / present.length) * factor) / factor
}

/** Filtra linhas por `kind` ('pre' | 'post') de forma defensiva. */
export const checkinsOfKind = <T>(rows: T[], kind: 'pre' | 'post'): T[] =>
  (Array.isArray(rows) ? rows : []).filter((r) => String((r as Record<string, unknown>)?.kind ?? '').trim() === kind)
