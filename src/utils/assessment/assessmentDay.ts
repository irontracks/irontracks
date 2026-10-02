/**
 * @module utils/assessment/assessmentDay
 *
 * O DIA de uma avaliação física — fonte única para exibir, ordenar e medir
 * intervalo.
 *
 * ⚠️ Por que existe (02/10/2026): a avaliação feita em 02/10 aparecia como
 * "01/10/2026 quinta-feira" e a de 05/06 como "04/06". As telas exibiam
 * `assessment.date || assessment.assessment_date`, e `date` é `timestamptz`:
 * nas linhas importadas ele está gravado como MEIA-NOITE UTC
 * (`2026-10-02 00:00:00+00`), que em Brasília é 21h do dia ANTERIOR. Nas linhas
 * criadas pelo app, `date` é o `now()` da inserção — às vezes dias depois da
 * avaliação (`assessment_date` 16/03, `date` 17/03 09:46). Medido no banco:
 * 13 de 15 linhas têm `date` em outro dia do calendário de Brasília;
 * `assessment_date` está preenchido em 15 de 15.
 *
 * Regra: o dia é `assessment_date` ('YYYY-MM-DD', coluna `date` do Postgres) e
 * ele NUNCA passa por `new Date(...)` + fuso local — `new Date('2026-10-02')` é
 * meia-noite UTC e `toLocaleDateString` no Brasil devolve 01/10. `date` só entra
 * como fallback (convertido para o dia de Brasília) e como desempate.
 */

import { brtDateKey } from '@/utils/cron/dateBrt'

type RowLike = { assessment_date?: unknown; date?: unknown; created_at?: unknown } | null | undefined

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDayKey(key: unknown): [number, number, number] | null {
    if (typeof key !== 'string') return null
    const m = DAY_KEY.exec(key.trim())
    if (!m) return null
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    return [y, mo, d]
}

/** 'YYYY-MM-DD' válido? */
export function isDayKey(value: unknown): value is string {
    return parseDayKey(value) != null
}

/**
 * O dia da avaliação, 'YYYY-MM-DD'. `assessment_date` manda; sem ele, o dia de
 * Brasília do timestamp `date`. `null` quando não há nenhum dos dois.
 */
export function assessmentDayKey(row: RowLike): string | null {
    const raw = row?.assessment_date
    if (typeof raw === 'string') {
        // Aceita 'YYYY-MM-DD' e também 'YYYY-MM-DDT…' (a parte de data é o dia
        // escolhido; a hora, quando vem, é artefato de serialização).
        const head = raw.trim().slice(0, 10)
        if (isDayKey(head)) return head
    }
    const ts = row?.date
    if (typeof ts === 'string' || typeof ts === 'number' || ts instanceof Date) {
        const key = brtDateKey(ts)
        if (isDayKey(key)) return key
    }
    return null
}

/** Meia-noite UTC do dia — só para ordenar e subtrair, nunca para exibir. */
export function dayKeyToUtcMs(key: unknown): number | null {
    const p = parseDayKey(key)
    if (!p) return null
    return Date.UTC(p[0], p[1] - 1, p[2])
}

/**
 * Formata um dia sem deixar o fuso decidir: a data é montada ao MEIO-DIA UTC e
 * formatada em UTC, então sai o mesmo dia em qualquer aparelho e em qualquer
 * runner. String que não é dia devolve '-'.
 */
export function formatDayKey(key: unknown, options: Intl.DateTimeFormatOptions): string {
    const p = parseDayKey(key)
    if (!p) return '-'
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12))
    return d.toLocaleDateString('pt-BR', { ...options, timeZone: 'UTC' })
}

/** Dias inteiros entre dois dias ('YYYY-MM-DD'); `null` se não for positivo. */
export function daysBetweenDayKeys(current: unknown, previous: unknown): number | null {
    const a = dayKeyToUtcMs(current)
    const b = dayKeyToUtcMs(previous)
    if (a == null || b == null) return null
    const days = Math.round((a - b) / 86_400_000)
    return days > 0 ? days : null
}

function tiebreakMs(row: RowLike): number {
    for (const raw of [row?.created_at, row?.date]) {
        if (typeof raw === 'string' || typeof raw === 'number' || raw instanceof Date) {
            const t = new Date(raw).getTime()
            if (Number.isFinite(t)) return t
        }
    }
    return 0
}

/**
 * Ordem cronológica crescente pelo DIA da avaliação. Mesmo dia → quem foi
 * gravado antes vem antes (`created_at`, depois `date`). Ordenar por `date`
 * colocava a avaliação de 16/03 (gravada em 17/03 09:46) DEPOIS da de 17/03.
 */
export function compareAssessmentsByDay(a: RowLike, b: RowLike): number {
    const da = dayKeyToUtcMs(assessmentDayKey(a)) ?? 0
    const db = dayKeyToUtcMs(assessmentDayKey(b)) ?? 0
    if (da !== db) return da - db
    return tiebreakMs(a) - tiebreakMs(b)
}
