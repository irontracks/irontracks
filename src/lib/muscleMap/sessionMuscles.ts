/**
 * sessionMuscles.ts — quais músculos UMA sessão treinou, e quanto.
 *
 * Alimenta o manequim que o Story de treino usa no lugar da foto. Roda no
 * CLIENTE e **sem IA**: a rota `api/ai/muscle-map-day` existe e é boa, mas
 * cobrar uma chamada ao Gemini a cada story compartilhado é custo recorrente
 * por um enfeite. `buildHeuristicExerciseMap` é função pura e resolve o nome
 * do exercício offline — o que ela não reconhecer simplesmente não pinta.
 *
 * ⚠️ O `ratio` aqui NÃO é o mesmo do MuscleMapCard. Lá ele mede o volume da
 * SEMANA contra a meta (`minSets`/`maxSets`) — numa sessão isolada essa régua
 * pinta tudo apagado, porque ninguém bate a meta semanal num dia. Aqui a régua
 * é o próprio topo do dia: o músculo mais trabalhado da sessão vale 1 e os
 * outros são relativos a ele. É a leitura certa para "o que EU treinei hoje".
 */
import { buildHeuristicExerciseMap } from '@/utils/exerciseMuscleHeuristics'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { isSetCompleted } from '@/utils/report/setCompletion'
import { isCardioExercise } from '@/utils/exercise/isCardio'
import type { MuscleId } from '@/utils/muscleMapConfig'

export type SessionMuscle = {
    /** Séries equivalentes (série × peso da contribuição do exercício). */
    setsEq: number
    /** 0–1, relativo ao músculo mais trabalhado da própria sessão. */
    ratio: number
}

export type SessionMuscles = Partial<Record<MuscleId, SessionMuscle>>

const isRecord = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v)

/** Séries CONCLUÍDAS por índice de exercício. */
const completedSetsByExercise = (logs: Record<string, unknown>): Map<number, number> => {
    const out = new Map<number, number>()
    Object.entries(logs).forEach(([key, log]) => {
        if (!isRecord(log) || !isSetCompleted(log)) return
        const exIdx = Number(String(key).split('-')[0])
        if (!Number.isFinite(exIdx)) return
        out.set(exIdx, (out.get(exIdx) || 0) + 1)
    })
    return out
}

export const buildSessionMuscles = (session: unknown): SessionMuscles => {
    const s = isRecord(session) ? session : null
    const exercises = Array.isArray(s?.exercises) ? (s.exercises as unknown[]) : []
    const logs = isRecord(s?.logs) ? s.logs : {}
    const setsByIdx = completedSetsByExercise(logs)

    const acc = new Map<MuscleId, number>()

    exercises.forEach((exRaw, exIdx) => {
        const ex = isRecord(exRaw) ? exRaw : null
        const name = String(ex?.name || '').trim()
        if (!name) return
        // Cardio não tem série de musculação; pintar quadríceps por causa de uma
        // esteira diria que a pessoa treinou perna, que é o oposto da verdade.
        if (isCardioExercise(exRaw)) return

        const sets = setsByIdx.get(exIdx) || 0
        if (sets <= 0) return

        const map = buildHeuristicExerciseMap(resolveCanonicalExerciseName(name).canonical || name)
        const contributions = map?.mapping?.contributions || []
        contributions.forEach((c) => {
            const w = Number(c?.weight)
            if (!c?.muscleId || !Number.isFinite(w) || w <= 0) return
            acc.set(c.muscleId, (acc.get(c.muscleId) || 0) + sets * w)
        })
    })

    let top = 0
    acc.forEach((v) => { if (v > top) top = v })
    if (top <= 0) return {}

    const out: SessionMuscles = {}
    acc.forEach((setsEq, id) => {
        out[id] = { setsEq, ratio: Math.min(1, setsEq / top) }
    })
    return out
}
