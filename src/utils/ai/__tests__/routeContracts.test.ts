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
