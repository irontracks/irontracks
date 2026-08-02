/**
 * Contratos de structured output das rotas de IA — lote 2 da migração
 * (auditoria de 02/08/2026).
 *
 * Por que na CHAMADA e não só no texto do prompt: sem `responseSchema`, o
 * modelo caro gasta budget de saída "pensando" e trunca o JSON — a classe do
 * `protocol_failed` dos exames, onde cada retry era chamada paga. Padrão já
 * provado em `bodyPhoto/aiContract.ts`, `labExam/protocolContract.ts` e
 * `exerciseMuscleMapShared.ts`.
 *
 * Cada schema aqui ESPELHA o Zod da rota correspondente — o Zod continua sendo
 * o juiz. Se um mudar, o outro muda junto (guards de paridade nos testes).
 */

// Subset OpenAPI do Gemini: type/format/nullable/enum/maxItems/properties/
// required/propertyOrdering/items.
const STR = { type: 'STRING' } as const
const NUM = { type: 'NUMBER' } as const
const nullable = <T extends Record<string, unknown>>(t: T) => ({ ...t, nullable: true })

// ─── parse-exercise-voice ────────────────────────────────────────────────────
// Espelha `ExerciseSchema` da rota: todos os campos do exercício são anuláveis
// (a pessoa fala "supino 4 por 12" e o resto fica null — inventar rpe/cadência
// seria pior que faltar).
export const VOICE_EXERCISES_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        exercises: {
            type: 'ARRAY',
            maxItems: 20,
            items: {
                type: 'OBJECT',
                properties: {
                    name: STR,
                    sets: nullable({ type: 'INTEGER' }),
                    reps: nullable({ type: 'INTEGER' }),
                    weightKg: nullable(NUM),
                    cadence: nullable(STR),
                    restSeconds: nullable({ type: 'INTEGER' }),
                    rpe: nullable(NUM),
                    method: nullable({ type: 'STRING', enum: ['normal', 'drop_set', 'rest_pause', 'super_set', 'cluster'] }),
                    notes: nullable(STR),
                },
                required: ['name', 'sets', 'reps', 'weightKg', 'cadence', 'restSeconds', 'rpe', 'method', 'notes'],
                propertyOrdering: ['name', 'sets', 'reps', 'weightKg', 'cadence', 'restSeconds', 'rpe', 'method', 'notes'],
            },
        },
    },
    required: ['exercises'],
} as const

export const voiceGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: VOICE_EXERCISES_RESPONSE_SCHEMA,
    maxOutputTokens: 4000,
    temperature: 0.2,
})

// ─── exercise-swap ───────────────────────────────────────────────────────────
// A rota espera um ARRAY na raiz com até 4 alternativas (o normalizador dela
// faz `.slice(0, 4)` e clampa `similarity` em 0..100).
export const SWAP_RESPONSE_SCHEMA = {
    type: 'ARRAY',
    maxItems: 4,
    items: {
        type: 'OBJECT',
        properties: {
            name: STR,
            reason: STR,
            similarity: NUM,
            muscleGroups: { type: 'ARRAY', maxItems: 8, items: STR },
            equipment: STR,
        },
        required: ['name', 'reason', 'similarity', 'muscleGroups', 'equipment'],
        propertyOrdering: ['name', 'reason', 'similarity', 'muscleGroups', 'equipment'],
    },
} as const

export const swapGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: SWAP_RESPONSE_SCHEMA,
    maxOutputTokens: 3000,
    temperature: 0.5,
})

// ─── muscle-map-day / muscle-map-week ────────────────────────────────────────
// As DUAS rotas declaram o MESMO `AiExerciseMuscleMapSchema` localmente — um
// contrato só serve as duas, e o guard de paridade impede que alguém mude o Zod
// de uma sem perceber que a outra (e este espelho) existem.
export const DAILY_MUSCLE_MAP_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        exercises: {
            type: 'ARRAY',
            maxItems: 60,
            items: {
                type: 'OBJECT',
                properties: {
                    name: STR,
                    muscles: {
                        type: 'ARRAY',
                        maxItems: 12,
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: STR,
                                sets_equivalent: NUM,
                                confidence: NUM,
                            },
                            // `sets_equivalent`/`confidence` são opcionais no Zod;
                            // required só no `id` espelha isso.
                            required: ['id'],
                            propertyOrdering: ['id', 'sets_equivalent', 'confidence'],
                        },
                    },
                },
                required: ['name', 'muscles'],
                propertyOrdering: ['name', 'muscles'],
            },
        },
    },
    required: ['exercises'],
} as const

export const dailyMuscleMapGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: DAILY_MUSCLE_MAP_RESPONSE_SCHEMA,
    maxOutputTokens: 8000,
    temperature: 0.3,
})

// ─── Lote 3: rotas de nutrição (02/08/2026) ──────────────────────────────────

// scan-nutrition-label — espelha `LabelSchema`. Os 4 macros são o núcleo
// (a rota descarta rótulo sem kcal); o resto tem default no Zod, então fica
// fora do required para o modelo não inventar porção/fibra que não leu.
export const NUTRITION_LABEL_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        productName: STR,
        servingSizeG: NUM,
        kcalPer100g: NUM,
        proteinPer100g: NUM,
        carbsPer100g: NUM,
        fatPer100g: NUM,
        fiberPer100g: NUM,
        confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    },
    required: ['kcalPer100g', 'proteinPer100g', 'carbsPer100g', 'fatPer100g'],
    propertyOrdering: ['productName', 'servingSizeG', 'kcalPer100g', 'proteinPer100g', 'carbsPer100g', 'fatPer100g', 'fiberPer100g', 'confidence'],
} as const

export const nutritionLabelGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: NUTRITION_LABEL_RESPONSE_SCHEMA,
    // 1024 era o teto antigo da rota; mantido — rótulo é resposta curta.
    maxOutputTokens: 1024,
    // visão + thinking consumia o orçamento e truncava (comentário original da rota)
    thinkingConfig: { thinkingBudget: 0 },
} as const)

// post-workout-meal — espelha o normalizador inline da rota (name/description/
// macros/timing/ingredients).
export const POST_WORKOUT_MEAL_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        name: STR,
        description: STR,
        calories: NUM,
        protein: NUM,
        carbs: NUM,
        fat: NUM,
        timing: STR,
        ingredients: { type: 'ARRAY', maxItems: 20, items: STR },
    },
    required: ['name', 'description', 'calories', 'protein', 'carbs', 'fat', 'timing', 'ingredients'],
    propertyOrdering: ['name', 'description', 'calories', 'protein', 'carbs', 'fat', 'timing', 'ingredients'],
} as const

export const postWorkoutMealGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: POST_WORKOUT_MEAL_RESPONSE_SCHEMA,
    maxOutputTokens: 2000,
    temperature: 0.6,
})

// nutrition-weekly-report — espelha `OutputSchema`: summary + 1..5 highlights;
// `tip` é `.optional()` no Zod, fora do required.
export const NUTRITION_WEEKLY_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        summary: STR,
        highlights: { type: 'ARRAY', maxItems: 5, items: STR },
        tip: STR,
    },
    required: ['summary', 'highlights'],
    propertyOrdering: ['summary', 'highlights', 'tip'],
} as const

export const nutritionWeeklyGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: NUTRITION_WEEKLY_RESPONSE_SCHEMA,
    maxOutputTokens: 2000,
    temperature: 0.6,
})

// meal-plan — o plano semanal completo. A rota repassa o objeto ao cliente sem
// Zod próprio; o contrato vira a ÚNICA definição executável da forma (antes ela
// existia só como texto dentro do prompt).
const MEAL = {
    type: 'OBJECT',
    properties: {
        name: STR,
        time: STR,
        foods: { type: 'ARRAY', maxItems: 15, items: STR },
        calories: NUM,
        protein: NUM,
        carbs: NUM,
        fat: NUM,
    },
    required: ['name', 'time', 'foods', 'calories', 'protein', 'carbs', 'fat'],
    propertyOrdering: ['name', 'time', 'foods', 'calories', 'protein', 'carbs', 'fat'],
} as const
const DAY_PLAN = {
    type: 'OBJECT',
    properties: { meals: { type: 'ARRAY', maxItems: 8, items: MEAL } },
    required: ['meals'],
} as const

export const MEAL_PLAN_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        planName: STR,
        dailyCalories: NUM,
        macros: {
            type: 'OBJECT',
            properties: { protein: NUM, carbs: NUM, fat: NUM },
            required: ['protein', 'carbs', 'fat'],
            propertyOrdering: ['protein', 'carbs', 'fat'],
        },
        trainingDay: DAY_PLAN,
        restDay: DAY_PLAN,
        tips: { type: 'ARRAY', maxItems: 5, items: STR },
        supplements: { type: 'ARRAY', maxItems: 8, items: STR },
    },
    required: ['planName', 'dailyCalories', 'macros', 'trainingDay', 'restDay', 'tips', 'supplements'],
    propertyOrdering: ['planName', 'dailyCalories', 'macros', 'trainingDay', 'restDay', 'tips', 'supplements'],
} as const

export const mealPlanGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: MEAL_PLAN_RESPONSE_SCHEMA,
    // 8192 era o teto antigo da rota; plano de 2 dias com 5-6 refeições é longo.
    maxOutputTokens: 8192,
    temperature: 0.7,
})
