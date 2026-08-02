/**
 * Contrato de saída da IA para o protocolo de exames laboratoriais.
 *
 * POR QUE EXISTE (ago/2026): a rota pedia JSON só no TEXTO do prompt e validava
 * com Zod. O dono tocou em "Gerar protocolo" e recebeu `protocol_failed` — o
 * `safeParse` reprovou uma resposta que começava perfeita.
 *
 * A causa está documentada dentro do próprio `utils/ai/gemini.ts`:
 *
 *   > O 2.5 Pro NÃO permite desligar [thinking] — tokens de raciocínio consomem
 *   > o budget de saída ANTES da resposta visível, truncando JSON estruturado
 *   > (finishReason MAX_TOKENS).
 *
 * E a chamada era `getGeminiModel(apiKey, modelId)` — sem `responseSchema`, sem
 * `responseMimeType`, sem `maxOutputTokens`. O modelo pensava, gastava o budget
 * e devolvia JSON cortado no meio.
 *
 * É a MESMA classe de falha já resolvida na Avaliação por Foto
 * (`utils/bodyPhoto/aiContract.ts`), e o `CLAUDE.md` já avisava: "as outras
 * rotas de `api/ai/` ainda usam o padrão antigo". Esta era uma delas.
 *
 * Cada tentativa aqui custa uma chamada ao `gemini-pro` cruzando 4 fontes — a
 * mais cara do app. Falhar e pedir para o usuário tentar de novo é queimar
 * dinheiro dele.
 */

import { PRIORITY } from '@/schemas/labExam'

// Subset OpenAPI aceito pela API do Gemini: type/properties/required/items/
// enum/maxItems/maxLength/propertyOrdering.
const STR = { type: 'STRING' } as const
const strList = (maxItems: number) => ({ type: 'ARRAY', maxItems, items: STR })
const priority = { type: 'STRING', enum: [...PRIORITY] } as const

/**
 * Espelha `LabProtocolSchema`. Se um mudar, o outro tem de mudar junto — há
 * guard cobrindo essa divergência.
 */
export const LAB_PROTOCOL_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        headline: STR,
        overallAssessment: STR,
        medicalAlerts: {
            type: 'ARRAY',
            maxItems: 30,
            items: {
                type: 'OBJECT',
                properties: {
                    marker: STR,
                    value: STR,
                    severity: { type: 'STRING', enum: ['urgent', 'moderate', 'watch'] },
                    action: STR,
                },
                required: ['marker', 'value', 'severity', 'action'],
                propertyOrdering: ['marker', 'value', 'severity', 'action'],
            },
        },
        trainingProtocol: {
            type: 'OBJECT',
            properties: {
                summary: STR,
                adjustments: {
                    type: 'ARRAY',
                    maxItems: 20,
                    items: {
                        type: 'OBJECT',
                        properties: {
                            area: STR,
                            recommendation: STR,
                            reason: STR,
                            priority,
                        },
                        required: ['area', 'recommendation', 'reason', 'priority'],
                        propertyOrdering: ['area', 'recommendation', 'reason', 'priority'],
                    },
                },
            },
            required: ['summary', 'adjustments'],
            propertyOrdering: ['summary', 'adjustments'],
        },
        nutritionProtocol: {
            type: 'OBJECT',
            properties: {
                summary: STR,
                adjustments: {
                    type: 'ARRAY',
                    maxItems: 20,
                    items: {
                        type: 'OBJECT',
                        properties: {
                            nutrient: STR,
                            recommendation: STR,
                            reason: STR,
                            priority,
                        },
                        required: ['nutrient', 'recommendation', 'reason', 'priority'],
                        propertyOrdering: ['nutrient', 'recommendation', 'reason', 'priority'],
                    },
                },
                foodSuggestions: strList(40),
            },
            required: ['summary', 'adjustments', 'foodSuggestions'],
            propertyOrdering: ['summary', 'adjustments', 'foodSuggestions'],
        },
        supplementation: {
            type: 'ARRAY',
            maxItems: 30,
            items: {
                type: 'OBJECT',
                properties: {
                    name: STR,
                    dose: STR,
                    timing: STR,
                    reason: STR,
                    duration: STR,
                    priority,
                    otcAvailable: { type: 'BOOLEAN' },
                },
                required: ['name', 'dose', 'timing', 'reason', 'duration', 'priority', 'otcAvailable'],
                propertyOrdering: ['name', 'dose', 'timing', 'reason', 'duration', 'priority', 'otcAvailable'],
            },
        },
        followUp: {
            type: 'OBJECT',
            properties: {
                retestIn: STR,
                markersToWatch: strList(40),
                notes: STR,
            },
            required: ['retestIn', 'markersToWatch', 'notes'],
            propertyOrdering: ['retestIn', 'markersToWatch', 'notes'],
        },
        // Obrigatório no Zod e SEM default: não pedir aqui faz o modelo omitir e
        // o safeParse reprovar. Quem pegou foi o guard de paridade — eu teria
        // consertado o truncamento e criado outra falha, ao custo de mais uma
        // chamada ao Pro.
        confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    },
    required: [
        'headline', 'overallAssessment', 'medicalAlerts',
        'trainingProtocol', 'nutritionProtocol', 'supplementation', 'followUp',
        'confidence',
    ],
    propertyOrdering: [
        'headline', 'overallAssessment', 'medicalAlerts',
        'trainingProtocol', 'nutritionProtocol', 'supplementation', 'followUp',
        'confidence',
    ],
} as const

/**
 * Teto de saída. O protocolo completo (30 alertas + 20 ajustes de treino + 20
 * de nutrição + 30 suplementos) é longo, e o Pro ainda gasta budget pensando
 * antes de escrever. Apertar aqui é reproduzir o truncamento que causou o bug.
 */
export const PROTOCOL_MAX_OUTPUT_TOKENS = 16_000

export const labProtocolGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: LAB_PROTOCOL_RESPONSE_SCHEMA,
    maxOutputTokens: PROTOCOL_MAX_OUTPUT_TOKENS,
    temperature: 0.6,
})
