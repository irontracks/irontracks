import { describe, it, expect } from 'vitest'
import { buildWorkoutStoryRows, kcalByExerciseIndex } from '../workoutStoryRows'

// Bug real (jul/2026, relatado pela aluna): o FitDance NÃO aparecia na tabela do
// layout "Treino" do Story. Causa: a linha só era criada quando havia série
// CONCLUÍDA no log — e a aula acontece fora do app, então o cardio não tem log.
// O exercício sumia em silêncio: nada no relatório indicava a ausência.

/** Sessão espelhando o caso real: musculação com log + FitDance sem log. */
const session = {
    totalTime: 3091,
    exercises: [
        { name: 'Chest press máquina', sets: 4 },
        {
            name: 'FitDance', method: 'Cardio', sets: 1, reps: '60', rpe: 5,
            setDetails: [{ set_number: 1, reps: '60', weight: null }],
        },
    ],
    logs: {
        '0-0': { weight: '29', reps: '10', rpe: '9', done: true },
        '0-1': { weight: '31', reps: '8', rpe: '9', done: true },
    },
    reportMeta: {
        exercises: [
            { name: 'Chest press máquina', order: 1, caloriesKcal: 0 },
            { name: 'FitDance', order: 2, caloriesKcal: 478 },
        ],
    },
}

/**
 * Bug real (04/09/2026, relatado pelo dono): fez 30 min de esteira e o Story
 * publicou "20min" — o tempo PLANEJADO no editor. Conferido no banco da sessão
 * dele: `reps` = 20, log `durationSeconds` = 1803 (30,05 min).
 *
 * É a MESMA classe que a caloria teve em ago/2026 (`cardioMinutesDone` nasceu
 * disso); a correção de lá nunca chegou ao Story. Hoje os dois leem da mesma
 * fonte — `lib/cardio/minutosDeCardio`.
 */
const sessaoDoDono = {
    totalTime: 6060,
    exercises: [
        { name: 'Esteira', method: 'Cardio', sets: 1, reps: '20', rpe: 5 },
    ],
    logs: {
        '0-0': { done: true, durationSeconds: 1803, speed: 6, incline: 0 },
    },
    reportMeta: { exercises: [{ name: 'Esteira', order: 1, caloriesKcal: 300 }] },
}

describe('o Story publica o tempo FEITO, não o planejado', () => {
    it('30 min feitos com 20 no plano publicam 30min', () => {
        const linha = buildWorkoutStoryRows(sessaoDoDono).find((r) => r.name === 'Esteira')!
        expect(linha.reps).toBe('30min')
    })

    it('cardio em BLOCOS soma os blocos na linha', () => {
        const emBlocos = {
            ...sessaoDoDono,
            exercises: [{ name: 'Esteira', method: 'Cardio', sets: 3, reps: '20', rpe: 5 }],
            logs: {
                '0-0': { done: true, durationSeconds: 5 * 60, speed: 4 },
                '0-1': { done: true, durationSeconds: 10 * 60, speed: 5 },
                '0-2': { done: true, durationSeconds: 15 * 60, speed: 6 },
            },
        }
        const linha = buildWorkoutStoryRows(emBlocos).find((r) => r.name === 'Esteira')!
        expect(linha.reps).toBe('30min')
    })
})

describe('buildWorkoutStoryRows — cardio na tabela do Story', () => {
    it('inclui o FitDance mesmo sem série concluída', () => {
        const rows = buildWorkoutStoryRows(session)
        expect(rows.map((r) => r.name)).toContain('FitDance')
    })

    it('mostra o tempo da aula, traço no peso e as kcal no total', () => {
        const fit = buildWorkoutStoryRows(session).find((r) => r.name === 'FitDance')!
        expect(fit.reps).toBe('60min')
        expect(fit.weight).toBe('—')
        expect(fit.totalReps).toBe('478')
        expect(fit.rpe).toBe('5')
    })

    it('não mexe na linha de musculação (top set do dia)', () => {
        const press = buildWorkoutStoryRows(session).find((r) => r.name === 'Chest press máquina')!
        expect(press.weight).toBe('31')
        expect(press.reps).toBe('8')
        expect(press.totalReps).toBe('18')
    })

    it('musculação com peso mas sem reps aparece com traço nas reps (comportamento atual)', () => {
        // Caso real da foto: "Rosca Scott — 15 —". O peso vem do autoload; a aluna
        // não registrou as reps. A linha existe porque há peso.
        const rows = buildWorkoutStoryRows({
            exercises: [{ name: 'Rosca Scott', sets: 3 }],
            logs: { '0-0': { weight: '15' } },
        })
        expect(rows).toEqual([{ name: 'Rosca Scott', reps: '—', weight: '15', rpe: '—', totalReps: '—' }])
    })

    it('musculação sem log nenhum fica FORA da tabela', () => {
        const rows = buildWorkoutStoryRows({ exercises: [{ name: 'Rosca Scott', sets: 3 }], logs: {} })
        expect(rows).toHaveLength(0)
    })

    it('cardio sem tempo e sem kcal fica de fora (linha vazia não ajuda ninguém)', () => {
        const rows = buildWorkoutStoryRows({
            exercises: [{ name: 'Esteira', method: 'Cardio', reps: '' }],
            logs: {},
        })
        expect(rows).toHaveLength(0)
    })

    it('cardio sem kcal no reportMeta ainda entra pelo tempo', () => {
        const rows = buildWorkoutStoryRows({
            exercises: [{ name: 'Corrida', method: 'Cardio', reps: '30' }],
            logs: {},
        })
        expect(rows).toEqual([{ name: 'Corrida', reps: '30min', weight: '—', rpe: '—', totalReps: '—' }])
    })

    it('reconhece cardio pelo NOME quando não há `method` (dado legado)', () => {
        const rows = buildWorkoutStoryRows({
            exercises: [{ name: 'FitDance', reps: '45' }],
            logs: {},
        })
        expect(rows[0]?.reps).toBe('45min')
    })

    it('usa o RPE do check-in quando a série/aula não tem um', () => {
        const rows = buildWorkoutStoryRows({
            exercises: [{ name: 'Esteira', method: 'Cardio', reps: '20' }],
            logs: {},
        }, 7)
        expect(rows[0]?.rpe).toBe('7')
    })

    it('ordem da tabela segue a ordem dos exercícios da sessão', () => {
        expect(buildWorkoutStoryRows(session).map((r) => r.name))
            .toEqual(['Chest press máquina', 'FitDance'])
    })

    it('sessão inválida não quebra', () => {
        expect(buildWorkoutStoryRows(null)).toEqual([])
        expect(buildWorkoutStoryRows({ exercises: 'nope' })).toEqual([])
    })
})

describe('kcalByExerciseIndex — lê do reportMeta, não recalcula', () => {
    it('mapeia por `order` (1-based) para o índice do array', () => {
        const m = kcalByExerciseIndex(session)
        expect(m.get(1)).toBe(478)
        expect(m.has(0)).toBe(false) // caloriesKcal 0 não entra
    })

    it('cai na posição do array quando não há `order`', () => {
        const m = kcalByExerciseIndex({ reportMeta: { exercises: [{ caloriesKcal: 120 }] } })
        expect(m.get(0)).toBe(120)
    })

    it('sem reportMeta, mapa vazio', () => {
        expect(kcalByExerciseIndex({}).size).toBe(0)
    })
})
