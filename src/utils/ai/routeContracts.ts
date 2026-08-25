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
// ⚠️ SEM maxItems DE PROPÓSITO (14/08/2026): 60×12 aninhados estouravam o
// limite de estados do structured output — o Gemini respondia 400
// INVALID_ARGUMENT ("too many states for serving") e o muscle-map semanal
// falhava para todo VIP (11 eventos em 4 dias nos runtime logs). Medido
// contra a API real: COM maxItems → 400; SEM → 200. O teto voltou para o
// pós-parse via DAILY_MUSCLE_MAP_LIMITS (mesma doutrina do maxLength no
// CLAUDE.md: structured output não é o juiz — o normalizador é).
export const DAILY_MUSCLE_MAP_LIMITS = { exercises: 60, musclesPerExercise: 12 } as const

export const DAILY_MUSCLE_MAP_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        exercises: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    name: STR,
                    muscles: {
                        type: 'ARRAY',
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

// nutrition-estimate — espelha `OutputSchema` do `aiEstimate.ts`. Os `items`
// entraram em 25/08/2026: o prompt mandava "some tudo e retorne um único
// objeto", e a refeição chegava ao histórico como uma linha só ("arroz branco
// cozido com filé de tilápia grelhada", 0 g). Ficam FORA do `required` de
// propósito — o chamador tem fallback para o item único, e exigir a lista faria
// o modelo inventar detalhe quando a entrada for realmente um alimento só.
export const NUTRITION_ESTIMATE_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        foodName: STR,
        calories: NUM,
        protein: NUM,
        carbs: NUM,
        fat: NUM,
        items: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    label: STR,
                    grams: NUM,
                    calories: NUM,
                    protein: NUM,
                    carbs: NUM,
                    fat: NUM,
                },
                required: ['label', 'calories', 'protein', 'carbs', 'fat'],
                propertyOrdering: ['label', 'grams', 'calories', 'protein', 'carbs', 'fat'],
            },
        },
    },
    required: ['foodName', 'calories', 'protein', 'carbs', 'fat'],
    propertyOrdering: ['foodName', 'calories', 'protein', 'carbs', 'fat', 'items'],
} as const

export const nutritionEstimateGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: NUTRITION_ESTIMATE_RESPONSE_SCHEMA,
    maxOutputTokens: 2048,
    temperature: 0.2,
} as const)

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

// ─── Lote 4 (fecha a catraca, 02/08/2026) ────────────────────────────────────

// assessment-report — forma definida no prompt; a rota repassa `report` direto.
export const ASSESSMENT_REPORT_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        overallScore: NUM,
        summary: STR,
        bodyComposition: {
            type: 'OBJECT',
            properties: {
                analysis: STR,
                trend: { type: 'STRING', enum: ['improving', 'stable', 'declining'] },
            },
            required: ['analysis', 'trend'],
            propertyOrdering: ['analysis', 'trend'],
        },
        strengths: { type: 'ARRAY', maxItems: 5, items: STR },
        improvements: { type: 'ARRAY', maxItems: 5, items: STR },
        recommendations: {
            type: 'ARRAY',
            maxItems: 8,
            items: {
                type: 'OBJECT',
                properties: {
                    area: STR,
                    action: STR,
                    priority: { type: 'STRING', enum: ['high', 'medium', 'low'] },
                },
                required: ['area', 'action', 'priority'],
                propertyOrdering: ['area', 'action', 'priority'],
            },
        },
        comparison: STR,
        goals: { type: 'ARRAY', maxItems: 3, items: STR },
    },
    required: ['overallScore', 'summary', 'bodyComposition', 'strengths', 'improvements', 'recommendations', 'comparison', 'goals'],
    propertyOrdering: ['overallScore', 'summary', 'bodyComposition', 'strengths', 'improvements', 'recommendations', 'comparison', 'goals'],
} as const

export const assessmentReportGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: ASSESSMENT_REPORT_RESPONSE_SCHEMA,
    maxOutputTokens: 4000,
    temperature: 0.6,
})

// bia-extract — espelha `ExtractionSchema`: 10 medidas ANULÁVEIS. A balança nem
// sempre imprime tudo; obrigar faria o modelo inventar gordura visceral.
const BIA_FIELDS = ['weight_kg', 'height_cm', 'age_years', 'body_fat_percentage', 'lean_mass_kg', 'fat_mass_kg', 'water_percentage', 'visceral_fat', 'metabolic_age_years', 'bmr_kcal'] as const
export const BIA_EXTRACT_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        ...Object.fromEntries(BIA_FIELDS.map((f) => [f, nullable(NUM)])),
        confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    },
    required: [...BIA_FIELDS],
    propertyOrdering: [...BIA_FIELDS, 'confidence'],
} as const

export const biaExtractGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: BIA_EXTRACT_RESPONSE_SCHEMA,
    maxOutputTokens: 1500,
    // extração de documento: visão + thinking trunca (mesmo caso do rótulo)
    thinkingConfig: { thinkingBudget: 0 },
} as const)

// lab-exam-extract — espelha `LabExamExtractedSchema` (schemas/labExam.ts),
// inclusive os enums de status/categoria do marcador.
export const LAB_EXTRACT_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        examTypes: { type: 'ARRAY', maxItems: 40, items: STR },
        markers: {
            type: 'ARRAY',
            maxItems: 200,
            items: {
                type: 'OBJECT',
                properties: {
                    name: STR,
                    value: nullable(NUM),
                    unit: nullable(STR),
                    refMin: nullable(NUM),
                    refMax: nullable(NUM),
                    status: { type: 'STRING', enum: ['normal', 'low', 'high', 'critical_low', 'critical_high'] },
                    category: { type: 'STRING', enum: ['Hemograma', 'Lipídios', 'Glicemia', 'Hormônios', 'Tireoide', 'Vitaminas e Minerais', 'Função Renal', 'Função Hepática', 'Inflamatórios', 'Eletrólitos', 'Outros'] },
                },
                required: ['name', 'value', 'unit', 'refMin', 'refMax', 'status', 'category'],
                propertyOrdering: ['name', 'value', 'unit', 'refMin', 'refMax', 'status', 'category'],
            },
        },
        examDate: nullable(STR),
        labName: nullable(STR),
        notes: nullable(STR),
        confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    },
    required: ['examTypes', 'markers', 'examDate', 'labName', 'notes'],
    propertyOrdering: ['examTypes', 'markers', 'examDate', 'labName', 'notes', 'confidence'],
} as const

export const labExtractGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: LAB_EXTRACT_RESPONSE_SCHEMA,
    // painel completo tem até 200 marcadores — teto generoso
    maxOutputTokens: 16_000,
    thinkingConfig: { thinkingBudget: 0 },
} as const)

// post-workout-insights — forma do prompt (rating 0-5, bullets, PRs etc.).
export const POST_WORKOUT_INSIGHTS_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        rating: NUM,
        rating_reason: STR,
        summary: { type: 'ARRAY', maxItems: 6, items: STR },
        motivation: STR,
        highlights: { type: 'ARRAY', maxItems: 6, items: STR },
        warnings: { type: 'ARRAY', maxItems: 4, items: STR },
        prs: {
            type: 'ARRAY', maxItems: 10,
            items: {
                type: 'OBJECT',
                properties: { exercise: STR, label: STR, value: STR },
                required: ['exercise', 'label', 'value'],
                propertyOrdering: ['exercise', 'label', 'value'],
            },
        },
        progression: {
            type: 'ARRAY', maxItems: 10,
            items: {
                type: 'OBJECT',
                properties: { exercise: STR, recommendation: STR, reason: STR },
                required: ['exercise', 'recommendation', 'reason'],
                propertyOrdering: ['exercise', 'recommendation', 'reason'],
            },
        },
        pain_suggestions: {
            type: 'ARRAY', maxItems: 6,
            items: {
                type: 'OBJECT',
                properties: { area: STR, suggestion: STR, reason: STR },
                required: ['area', 'suggestion', 'reason'],
                propertyOrdering: ['area', 'suggestion', 'reason'],
            },
        },
    },
    required: ['rating', 'rating_reason', 'summary', 'motivation', 'highlights', 'warnings', 'prs', 'progression', 'pain_suggestions'],
    propertyOrdering: ['rating', 'rating_reason', 'summary', 'motivation', 'highlights', 'warnings', 'prs', 'progression', 'pain_suggestions'],
} as const

export const postWorkoutInsightsGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: POST_WORKOUT_INSIGHTS_RESPONSE_SCHEMA,
    maxOutputTokens: 4000,
    temperature: 0.6,
})

// weekly-report — forma do prompt. Os NÚMEROS continuam vindo do servidor: a
// rota sobrescreve os agregados depois do parse (regra dela, preservada).
export const WEEKLY_REPORT_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        summary: STR,
        highlights: { type: 'ARRAY', maxItems: 5, items: STR },
        warnings: { type: 'ARRAY', maxItems: 3, items: STR },
        muscleBalance: {
            type: 'ARRAY', maxItems: 12,
            items: {
                type: 'OBJECT',
                properties: {
                    group: STR,
                    status: { type: 'STRING', enum: ['ok', 'deficit', 'excess'] },
                    suggestion: STR,
                },
                required: ['group', 'status', 'suggestion'],
                propertyOrdering: ['group', 'status', 'suggestion'],
            },
        },
        progressionTips: { type: 'ARRAY', maxItems: 3, items: STR },
        motivation: STR,
    },
    required: ['summary', 'highlights', 'warnings', 'muscleBalance', 'progressionTips', 'motivation'],
    propertyOrdering: ['summary', 'highlights', 'warnings', 'muscleBalance', 'progressionTips', 'motivation'],
} as const

export const weeklyReportGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: WEEKLY_REPORT_RESPONSE_SCHEMA,
    maxOutputTokens: 4000,
    temperature: 0.6,
})

// student-workout — plano multi-dia gerado pelo professor.
const STUDENT_EXERCISE = {
    type: 'OBJECT',
    properties: {
        name: STR,
        sets: NUM,
        reps: STR,
        rest: NUM,
        method: STR,
        notes: STR,
    },
    required: ['name', 'sets', 'reps', 'rest', 'method', 'notes'],
    propertyOrdering: ['name', 'sets', 'reps', 'rest', 'method', 'notes'],
} as const

export const STUDENT_WORKOUT_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        planName: STR,
        description: STR,
        days: {
            type: 'ARRAY', maxItems: 7,
            items: {
                type: 'OBJECT',
                properties: {
                    name: STR,
                    exercises: { type: 'ARRAY', maxItems: 15, items: STUDENT_EXERCISE },
                },
                required: ['name', 'exercises'],
                propertyOrdering: ['name', 'exercises'],
            },
        },
        periodization: STR,
        notes: STR,
    },
    required: ['planName', 'description', 'days', 'periodization', 'notes'],
    propertyOrdering: ['planName', 'description', 'days', 'periodization', 'notes'],
} as const

export const studentWorkoutGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: STUDENT_WORKOUT_RESPONSE_SCHEMA,
    maxOutputTokens: 8192,
    temperature: 0.7,
})

// workout-wizard — DUAS formas por modo. `notes` fica FORA do required: é
// `.optional().default('')` no Zod, e obrigar faria o modelo encher linguiça.
const WIZARD_DRAFT = {
    type: 'OBJECT',
    properties: {
        title: STR,
        exercises: {
            type: 'ARRAY', maxItems: 15,
            items: {
                type: 'OBJECT',
                properties: {
                    name: STR,
                    sets: NUM,
                    reps: STR,
                    restTime: NUM,
                    notes: STR,
                },
                required: ['name', 'sets', 'reps', 'restTime'],
                propertyOrdering: ['name', 'sets', 'reps', 'restTime', 'notes'],
            },
        },
    },
    required: ['title', 'exercises'],
    propertyOrdering: ['title', 'exercises'],
} as const

export const WIZARD_SINGLE_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: { draft: WIZARD_DRAFT },
    required: ['draft'],
} as const

export const WIZARD_PROGRAM_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: { drafts: { type: 'ARRAY', maxItems: 7, items: WIZARD_DRAFT } },
    required: ['drafts'],
} as const

export const wizardGenerationConfig = (mode: 'single' | 'program') => ({
    responseMimeType: 'application/json',
    responseSchema: mode === 'program' ? WIZARD_PROGRAM_RESPONSE_SCHEMA : WIZARD_SINGLE_RESPONSE_SCHEMA,
    // teto antigo da rota, preservado ("cap output so a runaway generation returns")
    maxOutputTokens: 8192,
    temperature: 0.7,
})

// ─── workout-photo-extract (importar treino por foto/PDF) ────────────────────
// Espelha `WorkoutPhotoExtractedSchema` (src/schemas/workoutPhotoImport.ts).
//
// ⚠️ SEM `maxItems` de propósito, pela mesma razão medida no muscle-map: este
// schema tem DOIS níveis de array aninhado (treinos → exercícios → 9 campos), e
// foi exatamente essa forma que estourou o limite de estados do structured
// output ("too many states for serving", 400). Os tetos reais (7 treinos, 25
// exercícios) são aplicados pelo normalizador da rota, que é o juiz de verdade.
//
// `reps` é STRING aqui e INTEGER na voz: ficha manuscrita escreve "8-12", e
// forçar número descartaria a faixa.
const PHOTO_IMPORT_EXERCISE = {
    type: 'OBJECT',
    properties: {
        name: STR,
        sets: nullable({ type: 'INTEGER' }),
        reps: nullable(STR),
        weightKg: nullable(NUM),
        cadence: nullable(STR),
        restSeconds: nullable({ type: 'INTEGER' }),
        rpe: nullable(NUM),
        method: nullable({
            type: 'STRING',
            enum: ['normal', 'drop_set', 'rest_pause', 'super_set', 'cluster', 'giant_set'],
        }),
        notes: nullable(STR),
    },
    required: ['name', 'sets', 'reps', 'weightKg', 'cadence', 'restSeconds', 'rpe', 'method', 'notes'],
    propertyOrdering: ['name', 'sets', 'reps', 'weightKg', 'cadence', 'restSeconds', 'rpe', 'method', 'notes'],
} as const

export const WORKOUT_PHOTO_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        workouts: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    title: STR,
                    exercises: { type: 'ARRAY', items: PHOTO_IMPORT_EXERCISE },
                },
                required: ['title', 'exercises'],
                propertyOrdering: ['title', 'exercises'],
            },
        },
    },
    required: ['workouts'],
} as const

export const workoutPhotoGenerationConfig = () => ({
    responseMimeType: 'application/json',
    responseSchema: WORKOUT_PHOTO_RESPONSE_SCHEMA,
    maxOutputTokens: 8192,
    // Leitura de documento é transcrição, não criação: temperatura baixa reduz
    // a chance de o modelo "completar" um exercício que a ficha não tem.
    temperature: 0.1,
})
