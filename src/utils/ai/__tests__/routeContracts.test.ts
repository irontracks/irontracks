import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
    VOICE_EXERCISES_RESPONSE_SCHEMA,
    SWAP_RESPONSE_SCHEMA,
    DAILY_MUSCLE_MAP_RESPONSE_SCHEMA,
    voiceGenerationConfig,
    swapGenerationConfig,
    dailyMuscleMapGenerationConfig,
} from '../routeContracts'

/**
 * Paridade contrato ↔ Zod das rotas migradas no lote 2 (02/08/2026).
 *
 * Divergência entre os dois é COMO o `protocol_failed` volta: o modelo entrega
 * o que o responseSchema pede, e o Zod da rota reprova pelo que ele não pediu.
 * Cada reprovação é uma chamada paga jogada fora. O guard de paridade do
 * lab-exam-protocol pegou exatamente isso (`confidence` faltando) antes de ir
 * pro ar.
 */

describe('parse-exercise-voice', () => {
    const ROUTE = readFileSync('src/app/api/ai/parse-exercise-voice/route.ts', 'utf8')
    const item = VOICE_EXERCISES_RESPONSE_SCHEMA.properties.exercises.items

    it('o contrato cobre todos os campos do ExerciseSchema da rota', () => {
        for (const campo of ['name', 'sets', 'reps', 'weightKg', 'cadence', 'restSeconds', 'rpe', 'method', 'notes']) {
            expect(Object.keys(item.properties), campo).toContain(campo)
            expect(ROUTE).toContain(`${campo}:`)
        }
    })

    it('campos que o Zod permite null são nullable no contrato', () => {
        // Inventar rpe/cadência que a pessoa não falou seria pior que faltar.
        const props = item.properties as Record<string, Record<string, unknown>>
        for (const campo of ['sets', 'reps', 'weightKg', 'cadence', 'restSeconds', 'rpe', 'method', 'notes']) {
            expect(props[campo].nullable, campo).toBe(true)
        }
        expect((props.name as Record<string, unknown>).nullable).toBeUndefined()
    })

    it('o enum de método bate com o da rota', () => {
        const props = item.properties as Record<string, { enum?: readonly string[] }>
        expect([...(props.method.enum ?? [])]).toEqual(['normal', 'drop_set', 'rest_pause', 'super_set', 'cluster'])
        expect(ROUTE).toContain("z.enum(['normal', 'drop_set', 'rest_pause', 'super_set', 'cluster'])")
    })

    it('a rota passa o contrato na chamada', () => {
        expect(ROUTE).toMatch(/getGeminiModel\(apiKey, MODEL, voiceGenerationConfig\(\)\)/)
        expect(voiceGenerationConfig().responseSchema).toBe(VOICE_EXERCISES_RESPONSE_SCHEMA)
    })
})

describe('exercise-swap', () => {
    const ROUTE = readFileSync('src/app/api/ai/exercise-swap/route.ts', 'utf8')

    it('raiz é ARRAY de até 4 — é o que o normalizador da rota fatia', () => {
        expect(SWAP_RESPONSE_SCHEMA.type).toBe('ARRAY')
        expect(SWAP_RESPONSE_SCHEMA.maxItems).toBe(4)
        expect(ROUTE).toMatch(/\.slice\(0, 4\)/)
    })

    it('os campos batem com o que a rota extrai', () => {
        const props = Object.keys(SWAP_RESPONSE_SCHEMA.items.properties).sort()
        expect(props).toEqual(['equipment', 'muscleGroups', 'name', 'reason', 'similarity'])
        for (const campo of props) expect(ROUTE).toContain(`${campo}`)
    })

    it('a rota passa o contrato na chamada', () => {
        expect(ROUTE).toMatch(/getGeminiModel\(apiKey, MODEL_ID, swapGenerationConfig\(\)\)/)
        expect(swapGenerationConfig().responseSchema).toBe(SWAP_RESPONSE_SCHEMA)
    })
})

describe('muscle-map-day / muscle-map-week (contrato compartilhado)', () => {
    const DAY = readFileSync('src/app/api/ai/muscle-map-day/route.ts', 'utf8')
    const WEEK = readFileSync('src/app/api/ai/muscle-map-week/route.ts', 'utf8')

    it('as duas rotas usam o MESMO contrato', () => {
        for (const src of [DAY, WEEK]) {
            expect(src).toMatch(/getGeminiModel\(apiKey, MODEL, dailyMuscleMapGenerationConfig\(\)\)/)
        }
        expect(dailyMuscleMapGenerationConfig().responseSchema).toBe(DAILY_MUSCLE_MAP_RESPONSE_SCHEMA)
    })

    it('o espelho respeita o que é opcional no Zod', () => {
        // `sets_equivalent`/`confidence` são `.optional()` nas duas rotas —
        // exigir no contrato faria o modelo inventar número onde não tem.
        const muscleItem = DAILY_MUSCLE_MAP_RESPONSE_SCHEMA.properties.exercises.items.properties.muscles.items
        expect([...muscleItem.required]).toEqual(['id'])
        for (const src of [DAY, WEEK]) {
            expect(src).toMatch(/sets_equivalent: z\.number\(\)\.optional\(\)/)
            expect(src).toMatch(/confidence: z\.number\(\)\.min\(0\)\.max\(1\)\.optional\(\)/)
        }
    })

    it('as duas rotas ainda declaram o mesmo Zod — se divergirem, este arquivo divide', () => {
        const zodOf = (s: string) => s.slice(s.indexOf('const AiExerciseMuscleMapSchema'), s.indexOf('type AiExerciseMuscleMap'))
        expect(zodOf(DAY).replace(/\s+/g, ' ')).toBe(zodOf(WEEK).replace(/\s+/g, ' '))
    })
})

// ─── Lote 3: nutrição ────────────────────────────────────────────────────────
import {
    NUTRITION_LABEL_RESPONSE_SCHEMA,
    POST_WORKOUT_MEAL_RESPONSE_SCHEMA,
    NUTRITION_WEEKLY_RESPONSE_SCHEMA,
    MEAL_PLAN_RESPONSE_SCHEMA,
    nutritionLabelGenerationConfig,
    mealPlanGenerationConfig,
} from '../routeContracts'

describe('scan-nutrition-label', () => {
    const ROUTE = readFileSync('src/app/api/ai/scan-nutrition-label/route.ts', 'utf8')

    it('required = só os 4 macros; o resto tem default no Zod', () => {
        // Obrigar porção/fibra faria o modelo inventar o que não leu no rótulo.
        expect([...NUTRITION_LABEL_RESPONSE_SCHEMA.required].sort())
            .toEqual(['carbsPer100g', 'fatPer100g', 'kcalPer100g', 'proteinPer100g'])
        expect(ROUTE).toMatch(/d\.kcalPer100g > 0/) // a rota descarta rótulo sem kcal
    })

    it('mantém o thinking desligado — visão + thinking truncava o JSON', () => {
        const cfg = nutritionLabelGenerationConfig()
        expect(cfg.thinkingConfig).toEqual({ thinkingBudget: 0 })
        expect(cfg.maxOutputTokens).toBe(1024)
        expect(ROUTE).toMatch(/nutritionLabelGenerationConfig\(\)/)
    })
})

describe('post-workout-meal', () => {
    it('o contrato cobre exatamente o que o normalizador da rota extrai', () => {
        const ROUTE = readFileSync('src/app/api/ai/post-workout-meal/route.ts', 'utf8')
        for (const campo of Object.keys(POST_WORKOUT_MEAL_RESPONSE_SCHEMA.properties)) {
            expect(ROUTE, campo).toContain(`meal.${campo}`)
        }
        expect(ROUTE).toMatch(/postWorkoutMealGenerationConfig\(\)/)
    })
})

describe('nutrition-weekly-report', () => {
    it('tip é opcional no Zod e fora do required no contrato', () => {
        const ROUTE = readFileSync('src/app/api/ai/nutrition-weekly-report/route.ts', 'utf8')
        expect(ROUTE).toMatch(/tip: z\.string\(\)[^\n]*\.optional\(\)/)
        expect([...NUTRITION_WEEKLY_RESPONSE_SCHEMA.required].sort()).toEqual(['highlights', 'summary'])
        expect(ROUTE).toMatch(/nutritionWeeklyGenerationConfig\(\)/)
    })
})

describe('meal-plan', () => {
    const ROUTE = readFileSync('src/app/api/ai/meal-plan/route.ts', 'utf8')

    it('o contrato é a forma que o PROMPT pede — antes existia só como texto', () => {
        // A rota repassa o objeto ao cliente sem Zod próprio: o contrato é a
        // única definição executável. Cada campo do prompt precisa existir nele.
        for (const campo of ['planName', 'dailyCalories', 'macros', 'trainingDay', 'restDay', 'tips', 'supplements']) {
            expect(Object.keys(MEAL_PLAN_RESPONSE_SCHEMA.properties), campo).toContain(campo)
            expect(ROUTE, campo).toContain(`"${campo}"`)
        }
    })

    it('refeição carrega macros e alimentos, como o prompt descreve', () => {
        const meal = MEAL_PLAN_RESPONSE_SCHEMA.properties.trainingDay.properties.meals.items
        expect([...meal.required].sort()).toEqual(['calories', 'carbs', 'fat', 'foods', 'name', 'protein', 'time'])
    })

    it('mantém o teto antigo de 8192 — plano de 2 dias é longo', () => {
        expect(mealPlanGenerationConfig().maxOutputTokens).toBe(8192)
        expect(ROUTE).toMatch(/mealPlanGenerationConfig\(\)/)
    })
})

// ─── Lote 4: fecha a catraca ─────────────────────────────────────────────────
import {
    BIA_EXTRACT_RESPONSE_SCHEMA,
    LAB_EXTRACT_RESPONSE_SCHEMA,
    WEEKLY_REPORT_RESPONSE_SCHEMA,
    WIZARD_SINGLE_RESPONSE_SCHEMA,
    WIZARD_PROGRAM_RESPONSE_SCHEMA,
    wizardGenerationConfig,
    labExtractGenerationConfig,
} from '../routeContracts'
import { LabExamExtractedSchema, LAB_MARKER_STATUSES, LAB_MARKER_CATEGORIES } from '@/schemas/labExam'

describe('bia-extract', () => {
    it('as 10 medidas são anuláveis — balança nem sempre imprime tudo', () => {
        const props = BIA_EXTRACT_RESPONSE_SCHEMA.properties as Record<string, Record<string, unknown>>
        const medidas = Object.keys(props).filter((k) => k !== 'confidence')
        expect(medidas.length).toBe(10)
        for (const m of medidas) expect(props[m].nullable, m).toBe(true)
        // e todas existem no Zod da rota
        const ROUTE = readFileSync('src/app/api/ai/bia-extract/route.ts', 'utf8')
        for (const m of medidas) expect(ROUTE, m).toContain(`${m}:`)
        expect(ROUTE).toMatch(/biaExtractGenerationConfig\(\)/)
    })
})

describe('lab-exam-extract', () => {
    it('espelha o LabExamExtractedSchema campo a campo', () => {
        const zodKeys = Object.keys(LabExamExtractedSchema.shape).sort()
        const contractKeys = Object.keys(LAB_EXTRACT_RESPONSE_SCHEMA.properties).sort()
        expect(contractKeys).toEqual(zodKeys)
    })

    it('os enums do marcador vêm da MESMA fonte que o Zod', () => {
        const marker = LAB_EXTRACT_RESPONSE_SCHEMA.properties.markers.items.properties
        expect([...marker.status.enum]).toEqual([...LAB_MARKER_STATUSES])
        expect([...marker.category.enum]).toEqual([...LAB_MARKER_CATEGORIES])
    })

    it('painel completo cabe: 200 marcadores exigem teto alto', () => {
        expect(LAB_EXTRACT_RESPONSE_SCHEMA.properties.markers.maxItems).toBe(200)
        expect(labExtractGenerationConfig().maxOutputTokens).toBeGreaterThanOrEqual(8000)
    })
})

describe('weekly-report', () => {
    it('os números continuam sendo do SERVIDOR, não do modelo', () => {
        // A rota sobrescreve os agregados depois do parse — regra dela, que o
        // contrato não pode afrouxar: o modelo narra, o servidor conta.
        const ROUTE = readFileSync('src/app/api/ai/weekly-report/route.ts', 'utf8')
        expect(ROUTE).toMatch(/sessions: officialTotals\.sessions/)
        expect(Object.keys(WEEKLY_REPORT_RESPONSE_SCHEMA.properties)).not.toContain('sessions')
        expect(ROUTE).toMatch(/weeklyReportGenerationConfig\(\)/)
    })
})

describe('workout-wizard', () => {
    const ROUTE = readFileSync('src/app/api/ai/workout-wizard/route.ts', 'utf8')

    it('o contrato muda com o MODO — single embrulha em draft, program em drafts', () => {
        expect(wizardGenerationConfig('single').responseSchema).toBe(WIZARD_SINGLE_RESPONSE_SCHEMA)
        expect(wizardGenerationConfig('program').responseSchema).toBe(WIZARD_PROGRAM_RESPONSE_SCHEMA)
        expect(ROUTE).toMatch(/wizardGenerationConfig\(mode\)/)
    })

    it('`notes` fica fora do required — é .optional().default no Zod', () => {
        const ex = WIZARD_PROGRAM_RESPONSE_SCHEMA.properties.drafts.items.properties.exercises.items
        expect([...ex.required]).toEqual(['name', 'sets', 'reps', 'restTime'])
        expect(ROUTE).toMatch(/notes: z\.string\(\)\.optional\(\)\.default\(''\)/)
    })
})

describe('assessment-report / post-workout-insights / student-workout', () => {
    it.each([
        ['assessment-report', 'assessmentReportGenerationConfig'],
        ['post-workout-insights', 'postWorkoutInsightsGenerationConfig'],
        ['student-workout', 'studentWorkoutGenerationConfig'],
    ])('%s passa o contrato na chamada', (rota, cfg) => {
        const src = readFileSync(`src/app/api/ai/${rota}/route.ts`, 'utf8')
        expect(src).toContain(`${cfg}()`)
    })
})
