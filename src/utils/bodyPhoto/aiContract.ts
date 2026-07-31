/**
 * Contrato de IA da Avaliação por Foto — structured output + normalização.
 *
 * ⚠️ ESTA ÁREA JÁ QUEBROU EM SILÊNCIO. Medição de jul/2026 (12 chamadas reais ao
 * `gemini-2.5-flash` com o prompt de produção): **8 falharam** o `safeParse` —
 * o usuário via "Não consegui gerar a correlação. Tente novamente." e nada
 * aparecia no Sentry porque o 422 era tratado como resposta normal. Duas causas,
 * ambas reproduzidas:
 *   1. JSON sintaticamente quebrado (o modelo esquecia o `}` de um item de array);
 *   2. strings acima do `.max()` do Zod (ex.: `action` com 343 chars num teto de 300).
 *
 * A defesa é em três camadas, nesta ordem:
 *   1. `*_RESPONSE_SCHEMA` → structured output nativo do Gemini. Mede-se: derruba
 *      o JSON inválido a ZERO (0/5 nas chamadas de verificação).
 *   2. `normalize*` → trunca/normaliza. Structured output **não garante**
 *      `maxLength` (1/5 ainda estourou), então truncar é obrigatório. Rejeitar um
 *      laudo inteiro por 40 caracteres a mais era a decisão errada.
 *   3. o `safeParse` estrito continua no fim, como juiz — só que agora só reprova
 *      resposta de fato inaproveitável.
 *
 * Ao mexer nos limites, mexa em `LAUDO_LIMITS`/`CORRELATION_LIMITS`
 * (src/types/bodyPhotoAssessment.ts): eles alimentam o Zod, o responseSchema e o
 * normalizador ao mesmo tempo. Guards: src/utils/bodyPhoto/__tests__/aiContract.test.ts.
 */
import { clampList, clampNumber, clampText, clampTextList, pickEnum } from '@/utils/ai/coerce'
import {
    AI_CONFIDENCE_LEVELS,
    APPARENT_PHASES,
    CORRELATION_LIMITS,
    CORRELATION_TRENDS,
    DEVELOPMENT_LEVELS,
    LAUDO_LIMITS,
    RECOMMENDATION_PRIORITIES,
} from '@/types/bodyPhotoAssessment'

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v)

// ─── Structured output (responseSchema do Gemini) ────────────────────────────
// Subset OpenAPI aceito pela API: type/properties/required/items/enum/
// maxItems/maxLength/propertyOrdering. `propertyOrdering` importa: sem ele a
// ordem dos campos varia entre chamadas e a qualidade cai (doc do Gemini).

const str = (maxLength: number) => ({ type: 'STRING', maxLength })
const strList = (maxItems: number, maxLength: number) => ({
    type: 'ARRAY',
    maxItems,
    items: str(maxLength),
})

export const LAUDO_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        bodyFatRange: {
            type: 'OBJECT',
            properties: {
                low: { type: 'NUMBER' },
                high: { type: 'NUMBER' },
            },
            required: ['low', 'high'],
            propertyOrdering: ['low', 'high'],
        },
        somatotype: str(LAUDO_LIMITS.somatotype),
        apparentPhase: { type: 'STRING', enum: [...APPARENT_PHASES] },
        scores: {
            type: 'OBJECT',
            properties: {
                composition: { type: 'INTEGER' },
                symmetry: { type: 'INTEGER' },
                posture: { type: 'INTEGER' },
                proportion: { type: 'INTEGER' },
            },
            required: ['composition', 'symmetry', 'posture', 'proportion'],
            propertyOrdering: ['composition', 'symmetry', 'posture', 'proportion'],
        },
        muscleGroups: {
            type: 'ARRAY',
            maxItems: LAUDO_LIMITS.muscleGroups,
            items: {
                type: 'OBJECT',
                properties: {
                    group: str(LAUDO_LIMITS.groupName),
                    development: { type: 'STRING', enum: [...DEVELOPMENT_LEVELS] },
                    note: str(LAUDO_LIMITS.groupNote),
                },
                required: ['group', 'development', 'note'],
                propertyOrdering: ['group', 'development', 'note'],
            },
        },
        posture: {
            type: 'OBJECT',
            properties: {
                summary: str(LAUDO_LIMITS.postureSummary),
                findings: strList(LAUDO_LIMITS.postureFindings, LAUDO_LIMITS.postureFinding),
            },
            required: ['summary', 'findings'],
            propertyOrdering: ['summary', 'findings'],
        },
        symmetry: {
            type: 'OBJECT',
            properties: {
                summary: str(LAUDO_LIMITS.symmetrySummary),
                imbalances: strList(LAUDO_LIMITS.symmetryImbalances, LAUDO_LIMITS.symmetryImbalance),
            },
            required: ['summary', 'imbalances'],
            propertyOrdering: ['summary', 'imbalances'],
        },
        proportions: {
            type: 'OBJECT',
            properties: {
                summary: str(LAUDO_LIMITS.proportionsSummary),
                shoulderToWaist: str(LAUDO_LIMITS.shoulderToWaist),
            },
            required: ['summary', 'shoulderToWaist'],
            propertyOrdering: ['summary', 'shoulderToWaist'],
        },
        strengths: strList(LAUDO_LIMITS.strengths, LAUDO_LIMITS.strength),
        improvements: strList(LAUDO_LIMITS.improvements, LAUDO_LIMITS.improvement),
        recommendations: {
            type: 'ARRAY',
            maxItems: LAUDO_LIMITS.recommendations,
            items: {
                type: 'OBJECT',
                properties: {
                    focus: str(LAUDO_LIMITS.recFocus),
                    action: str(LAUDO_LIMITS.recAction),
                    priority: { type: 'STRING', enum: [...RECOMMENDATION_PRIORITIES] },
                },
                required: ['focus', 'action', 'priority'],
                propertyOrdering: ['focus', 'action', 'priority'],
            },
        },
        summary: str(LAUDO_LIMITS.summary),
        confidence: { type: 'STRING', enum: [...AI_CONFIDENCE_LEVELS] },
    },
    required: [
        'bodyFatRange', 'somatotype', 'apparentPhase', 'scores', 'muscleGroups',
        'posture', 'symmetry', 'proportions', 'strengths', 'improvements',
        'recommendations', 'summary', 'confidence',
    ],
    propertyOrdering: [
        'bodyFatRange', 'somatotype', 'apparentPhase', 'scores', 'muscleGroups',
        'posture', 'symmetry', 'proportions', 'strengths', 'improvements',
        'recommendations', 'summary', 'confidence',
    ],
} as const

export const CORRELATION_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        headline: str(CORRELATION_LIMITS.headline),
        narrative: str(CORRELATION_LIMITS.narrative),
        whatIsWorking: strList(CORRELATION_LIMITS.listItems, CORRELATION_LIMITS.listItem),
        whatIsMissing: strList(CORRELATION_LIMITS.listItems, CORRELATION_LIMITS.listItem),
        links: {
            type: 'ARRAY',
            maxItems: CORRELATION_LIMITS.links,
            items: {
                type: 'OBJECT',
                properties: {
                    muscleGroup: str(CORRELATION_LIMITS.muscleGroup),
                    observation: str(CORRELATION_LIMITS.observation),
                    trend: { type: 'STRING', enum: [...CORRELATION_TRENDS] },
                },
                required: ['muscleGroup', 'observation', 'trend'],
                propertyOrdering: ['muscleGroup', 'observation', 'trend'],
            },
        },
        nextFocus: {
            type: 'ARRAY',
            maxItems: CORRELATION_LIMITS.nextFocus,
            items: {
                type: 'OBJECT',
                properties: {
                    focus: str(CORRELATION_LIMITS.focus),
                    action: str(CORRELATION_LIMITS.action),
                },
                required: ['focus', 'action'],
                propertyOrdering: ['focus', 'action'],
            },
        },
        confidence: { type: 'STRING', enum: [...AI_CONFIDENCE_LEVELS] },
    },
    required: ['headline', 'narrative', 'whatIsWorking', 'whatIsMissing', 'links', 'nextFocus', 'confidence'],
    propertyOrdering: ['headline', 'narrative', 'whatIsWorking', 'whatIsMissing', 'links', 'nextFocus', 'confidence'],
} as const

/** Config de geração das duas rotas — JSON puro, sem cerca markdown nem prosa. */
export const bodyPhotoGenerationConfig = (responseSchema: unknown, maxOutputTokens: number) => ({
    responseMimeType: 'application/json',
    responseSchema,
    maxOutputTokens,
    temperature: 0.6,
})

// ─── Normalização (camada 2) ─────────────────────────────────────────────────

/**
 * Trunca/normaliza a correlação crua da IA para caber no
 * `BodyPhotoCorrelationSchema`. Devolve `null` quando não há substância
 * nenhuma — aí sim vale mostrar erro ao usuário em vez de um card vazio.
 */
export function normalizeCorrelation(raw: unknown): Record<string, unknown> | null {
    if (!isRecord(raw)) return null

    const headline = clampText(raw.headline, CORRELATION_LIMITS.headline)
    const narrative = clampText(raw.narrative, CORRELATION_LIMITS.narrative)

    const links = clampList(raw.links, CORRELATION_LIMITS.links, (item) => {
        if (!isRecord(item)) return null
        const muscleGroup = clampText(item.muscleGroup, CORRELATION_LIMITS.muscleGroup)
        const observation = clampText(item.observation, CORRELATION_LIMITS.observation)
        if (!muscleGroup || !observation) return null
        return { muscleGroup, observation, trend: pickEnum(item.trend, CORRELATION_TRENDS, 'neutral') }
    })

    const nextFocus = clampList(raw.nextFocus, CORRELATION_LIMITS.nextFocus, (item) => {
        if (!isRecord(item)) return null
        const focus = clampText(item.focus, CORRELATION_LIMITS.focus)
        const action = clampText(item.action, CORRELATION_LIMITS.action)
        if (!focus || !action) return null
        return { focus, action }
    })

    const whatIsWorking = clampTextList(raw.whatIsWorking, CORRELATION_LIMITS.listItems, CORRELATION_LIMITS.listItem)
    const whatIsMissing = clampTextList(raw.whatIsMissing, CORRELATION_LIMITS.listItems, CORRELATION_LIMITS.listItem)

    // Sem narrativa E sem nenhum item: a resposta não tem o que mostrar.
    if (!narrative && !headline && !links.length && !nextFocus.length && !whatIsWorking.length && !whatIsMissing.length) {
        return null
    }

    return {
        headline,
        narrative,
        whatIsWorking,
        whatIsMissing,
        links,
        nextFocus,
        confidence: pickEnum(raw.confidence, AI_CONFIDENCE_LEVELS, 'medium'),
    }
}

/**
 * Trunca/normaliza o laudo cru da IA para caber no `BodyPhotoLaudoSchema`.
 * Devolve `null` sem os campos que a UI depende de verdade (scores + faixa de
 * gordura) — sem eles o laudo não é exibível.
 */
export function normalizeLaudo(raw: unknown): Record<string, unknown> | null {
    if (!isRecord(raw)) return null

    const scoresRaw = isRecord(raw.scores) ? raw.scores : null
    const fatRaw = isRecord(raw.bodyFatRange) ? raw.bodyFatRange : null
    if (!scoresRaw || !fatRaw) return null

    const score = (v: unknown) => clampNumber(v, 0, 100, 50, true)
    const low = clampNumber(fatRaw.low, 0, 100, NaN, false)
    const high = clampNumber(fatRaw.high, 0, 100, NaN, false)
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null

    const somatotype = clampText(raw.somatotype, LAUDO_LIMITS.somatotype)
    const posture = isRecord(raw.posture) ? raw.posture : {}
    const symmetry = isRecord(raw.symmetry) ? raw.symmetry : {}
    const proportions = isRecord(raw.proportions) ? raw.proportions : {}
    const shoulderToWaist = clampText(proportions.shoulderToWaist, LAUDO_LIMITS.shoulderToWaist)

    return {
        bodyFatRange: { low: Math.min(low, high), high: Math.max(low, high) },
        somatotype: somatotype || null,
        apparentPhase: pickEnum(raw.apparentPhase, APPARENT_PHASES, 'unknown'),
        scores: {
            composition: score(scoresRaw.composition),
            symmetry: score(scoresRaw.symmetry),
            posture: score(scoresRaw.posture),
            proportion: score(scoresRaw.proportion),
        },
        muscleGroups: clampList(raw.muscleGroups, LAUDO_LIMITS.muscleGroups, (item) => {
            if (!isRecord(item)) return null
            const group = clampText(item.group, LAUDO_LIMITS.groupName)
            if (!group) return null
            return {
                group,
                development: pickEnum(item.development, DEVELOPMENT_LEVELS, 'moderate'),
                note: clampText(item.note, LAUDO_LIMITS.groupNote),
            }
        }),
        posture: {
            summary: clampText(posture.summary, LAUDO_LIMITS.postureSummary),
            findings: clampTextList(posture.findings, LAUDO_LIMITS.postureFindings, LAUDO_LIMITS.postureFinding),
        },
        symmetry: {
            summary: clampText(symmetry.summary, LAUDO_LIMITS.symmetrySummary),
            imbalances: clampTextList(symmetry.imbalances, LAUDO_LIMITS.symmetryImbalances, LAUDO_LIMITS.symmetryImbalance),
        },
        proportions: {
            summary: clampText(proportions.summary, LAUDO_LIMITS.proportionsSummary),
            shoulderToWaist: shoulderToWaist || null,
        },
        strengths: clampTextList(raw.strengths, LAUDO_LIMITS.strengths, LAUDO_LIMITS.strength),
        improvements: clampTextList(raw.improvements, LAUDO_LIMITS.improvements, LAUDO_LIMITS.improvement),
        recommendations: clampList(raw.recommendations, LAUDO_LIMITS.recommendations, (item) => {
            if (!isRecord(item)) return null
            const focus = clampText(item.focus, LAUDO_LIMITS.recFocus)
            const action = clampText(item.action, LAUDO_LIMITS.recAction)
            if (!focus || !action) return null
            return { focus, action, priority: pickEnum(item.priority, RECOMMENDATION_PRIORITIES, 'medium') }
        }),
        summary: clampText(raw.summary, LAUDO_LIMITS.summary),
        confidence: pickEnum(raw.confidence, AI_CONFIDENCE_LEVELS, 'medium'),
    }
}
