/**
 * @module utils/assessment/assessmentMethod
 *
 * Por qual MÉTODO a composição corporal de uma avaliação foi medida — e a
 * regra de que métodos diferentes nunca se comparam.
 *
 * ⚠️ Por que existe (02/10/2026): a avaliação por 7 dobras de 02/10 (5,83% de
 * gordura, 87,6 kg de massa magra) era comparada com a BIOIMPEDÂNCIA de 11/09
 * (17,4%, 77,6 kg) e a tela dizia "% gordura −11,6" e "massa magra +10,0 kg em
 * 21 dias". Nenhum dos dois números aconteceu: dobras e bioimpedância medem
 * coisas diferentes, com erros sistemáticos diferentes (a BIA do dono lê ~10
 * pontos acima das dobras). A diferença entre elas é o método, não o corpo.
 *
 * Regra do dono: dobras e BIA NUNCA se misturam na mesma comparação nem na
 * mesma curva. A variação é contra a anterior do MESMO método; sem uma, não há
 * variação — e a tela diz por quê.
 *
 * O peso entra na mesma régua de propósito: os cartões e a linha "desde a
 * anterior" têm UMA base, com data, e misturar bases dentro do mesmo cartão
 * faria cada número falar de um intervalo diferente.
 */

import { JP7_SKINFOLD_FIELDS } from '@/utils/calculations/bodyComposition'

/**
 * - `dobras`: avaliação completa sem leitura de bioimpedância.
 * - `bia`: bioimpedância (registro `assessment_type = 'bia'`, ou completa em que
 *   só a BIA deu o %).
 * - `misto`: completa com dobras E bioimpedância — o app grava a MÉDIA das duas
 *   em `body_fat_percentage` (`combinedBodyFat`), que não é nenhum dos dois.
 */
export type AssessmentMethod = 'dobras' | 'bia' | 'misto'

type RowLike = Record<string, unknown> | null | undefined

const positive = (v: unknown): boolean => {
    const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
    return Number.isFinite(n) && n > 0
}

export function assessmentMethod(row: RowLike): AssessmentMethod {
    if (String(row?.assessment_type ?? '') === 'bia') return 'bia'
    if (!positive(row?.bia_body_fat_percentage)) return 'dobras'
    const temDobras =
        positive(row?.body_fat_percentage_skinfold) ||
        JP7_SKINFOLD_FIELDS.every((f) => positive(row?.[f]))
    return temDobras ? 'misto' : 'bia'
}

export const ASSESSMENT_METHOD_LABEL: Record<AssessmentMethod, string> = {
    dobras: 'dobras cutâneas',
    bia: 'bioimpedância',
    misto: 'dobras + bioimpedância',
}

/** Rótulo curto, para legenda de gráfico. */
export const ASSESSMENT_METHOD_SHORT: Record<AssessmentMethod, string> = {
    dobras: 'dobras',
    bia: 'bioimpedância',
    misto: 'dobras + BIA',
}

/**
 * A avaliação anterior do MESMO método que `sorted[index]`, numa lista em ordem
 * cronológica crescente. `null` quando não existe — e aí NÃO há comparação.
 */
export function previousSameMethod<T extends RowLike>(sorted: readonly T[], index: number): T | null {
    const current = sorted[index]
    if (!current) return null
    const method = assessmentMethod(current)
    for (let i = index - 1; i >= 0; i--) {
        const candidate = sorted[i]
        if (candidate && assessmentMethod(candidate) === method) return candidate
    }
    return null
}

/** Métodos presentes na lista, na ordem em que aparecem pela primeira vez. */
export function methodsPresent(rows: readonly RowLike[]): AssessmentMethod[] {
    const seen: AssessmentMethod[] = []
    for (const r of rows) {
        const m = assessmentMethod(r)
        if (!seen.includes(m)) seen.push(m)
    }
    return seen
}
