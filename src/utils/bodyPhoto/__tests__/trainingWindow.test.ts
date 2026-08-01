import { describe, it, expect } from 'vitest'
import { aggregateTrainingWindow, computeSessionStats } from '@/utils/bodyPhoto/trainingWindow'

/**
 * Guard do viés que produziu um DIAGNÓSTICO FALSO em produção (ago/2026).
 *
 * A correlação afirmou ao usuário: "Posterior de coxa pouco treinado — ausência
 * de exercícios específicos como Mesa Flexora e Stiff". Havia **55 séries de
 * mesa flexora** no período, o 5º exercício mais treinado.
 *
 * Causa: a IA só recebia `topExercises`, ordenado por VOLUME EM KG. Flexora move
 * carga baixa por natureza, então caiu fora do corte — e o modelo leu ausência
 * na lista como ausência no treino. Volume em kg não é comparável entre
 * exercícios; séries é.
 *
 * A fixture abaixo reproduz exatamente essa forma: pesados de carga alta e poucas
 * séries × um leve com muitas séries.
 */
const sessao = (exercicios: Array<{ name: string; sets: number; weight: number; reps: number }>) => {
    const logs: Record<string, unknown> = {}
    exercicios.forEach((ex, exIdx) => {
        for (let s = 0; s < ex.sets; s++) {
            logs[`${exIdx}-${s}`] = { weight: String(ex.weight), reps: String(ex.reps), done: true }
        }
    })
    return { notes: JSON.stringify({ exercises: exercicios.map((e) => ({ name: e.name })), logs }) }
}

describe('aggregateTrainingWindow — séries vs carga', () => {
    const rows = [sessao([
        { name: 'Leg press 45°', sets: 4, weight: 300, reps: 10 },      // 12.000 kg
        { name: 'Agachamento', sets: 3, weight: 150, reps: 8 },          //  3.600 kg
        { name: 'Cadeira extensora', sets: 4, weight: 100, reps: 12 },   //  4.800 kg
        { name: 'Mesa flexora', sets: 10, weight: 40, reps: 10 },        //  4.000 kg em 10 SÉRIES
    ])]

    it('o exercício leve some do ranking por carga — era isso que enganava a IA', () => {
        const nomes = aggregateTrainingWindow(rows, 3).topExercises.map((e) => e.name)
        expect(nomes).toEqual(['Leg press 45°', 'Cadeira extensora', 'Mesa flexora'])
        // com corte mais apertado ele cai fora, apesar de ser o mais treinado
        expect(aggregateTrainingWindow(rows, 2).topExercises.map((e) => e.name)).not.toContain('Mesa flexora')
    })

    it('o ranking por SÉRIES coloca o mais treinado em primeiro', () => {
        const porSeries = aggregateTrainingWindow(rows, 2).topExercisesBySets
        expect(porSeries[0].name).toBe('Mesa flexora')
        expect(porSeries[0].sets).toBe(10)
    })

    it('mesmo no corte mais apertado, o mais treinado nunca desaparece dos dois rankings', () => {
        const { topExercises, topExercisesBySets } = aggregateTrainingWindow(rows, 1)
        const visiveis = [...topExercises, ...topExercisesBySets].map((e) => e.name)
        expect(visiveis).toContain('Mesa flexora')
    })

    it('mantém os totais corretos', () => {
        const stats = aggregateTrainingWindow(rows)
        expect(stats.sessions).toBe(1)
        expect(stats.totalSets).toBe(21)
        expect(stats.totalVolumeKg).toBe(12_000 + 3_600 + 4_800 + 4_000)
    })

    it('séries de aquecimento não contam como treino', () => {
        const comWarmup = [{
            notes: JSON.stringify({
                exercises: [{ name: 'Supino' }],
                logs: {
                    '0-0': { weight: '40', reps: '15', set_type: 'warmup' },
                    '0-1': { weight: '100', reps: '8', set_type: 'working' },
                },
            }),
        }]
        const stats = aggregateTrainingWindow(comWarmup)
        expect(stats.totalSets).toBe(1)
        expect(stats.totalVolumeKg).toBe(800)
    })

    it('sessão sem série válida não conta como sessão', () => {
        expect(aggregateTrainingWindow([{ notes: '{"exercises":[],"logs":{}}' }]).sessions).toBe(0)
        expect(aggregateTrainingWindow([{ notes: 'não é json' }]).sessions).toBe(0)
    })

    it('computeSessionStats lê reps no formato "feito/planejado"', () => {
        const stats = computeSessionStats(JSON.stringify({
            exercises: [{ name: 'Remada' }],
            logs: { '0-0': { weight: '80', reps: '10/12' } },
        }))
        expect(stats.totalSets).toBe(1)
        expect(stats.volumeKg).toBe(800)
    })
})
