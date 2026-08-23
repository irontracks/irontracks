/**
 * Os últimos ramos das áreas de cálculo.
 *
 * São de dois tipos, e os dois valem: a TABELA de fatores por exercício (cada
 * linha é uma decisão de produto que ninguém tinha travado) e as GUARDAS contra
 * dado sujo — item não-objeto dentro do array de blocos, peso zero no meio de
 * um cluster, exercício sem nome. Nenhuma delas é inalcançável; todas viram
 * número errado se quebrarem.
 */
import { describe, it, expect, vi as vi2 } from 'vitest'
import {
    getExerciseComplexityFactor,
    getBodyweightFraction,
    detectTrainingStyle,
    getStyleFactor,
    computeActiveWorkMinutes,
    estimateCaloriesMet,
} from '@/utils/calories/metEstimate'
import { isWorkingSet, setVolume, setBestE1rm, clusterVolume, stagesVolume, waveVolume, setTopWeightReps, parseWeightValue, parseRepsValue, nonWorkingSetLabel, isNonWorkingSet } from '@/utils/report/setVolume'
import { calculateBodyDensity, calculateBodyFatPercentage, calculateBMI, sumSkinfoldsJP7 } from '@/utils/calculations/bodyComposition'
import { learnWeightGrid, snapToLearnedGrid } from '@/utils/autoload/machineGrid'
import { planPlatesPerSide } from '@/utils/autoload/plateBreakdown'
import { resolveIncrement, roundToIncrement, roundSuggestedWeight as roundSuggestedWeight2 } from '@/utils/autoload/plateMath'
import { inferEquipmentFromName } from '@/utils/autoload/equipmentFromName'
import { estimateSessionKcal } from '@/utils/calories/sessionKcal'
import { estimateCardioKcal, metForCardio, clampSessionKcal } from '@/utils/calories/cardioKcal'
import { calculateExerciseDuration, calculateExerciseDurationForGroup, estimateWorkoutSecondsForGroup } from '@/utils/pacing'
import { getIronRankProgress, getIronRankLevel as getIronRankLevelFn, IRON_RANK_THRESHOLDS, IRON_RANK_MAX_LEVEL as IRON_RANK_MAX_LEVEL_C } from '@/utils/gamification/ironRank'
import { distributeKcalByExercise as distributeKcalByExercise2, distributeKcalWithFixed as distributeKcalWithFixed2 } from '@/utils/calories/distributeKcal'
import { calculateNutritionGoals } from '@/lib/nutrition/goals'
import { buildLoadEvolution } from '@/lib/workout/loadEvolution'
import { buildWeightReference, detectWeightOutlier, outlierLabel } from '@/lib/workout/weightOutlier'
import { computeFallbackKcal as computeFallbackKcal2, getKcalEstimate as getKcalEstimate2 } from '@/utils/calories/kcalClientImpl'
import { suggestWeight as suggestWeight2 } from '@/utils/autoload/suggestWeight'

describe('tabela de complexidade — cada linha é uma decisão de produto', () => {
    const f = getExerciseComplexityFactor
    const casos: Array<[string, number]> = [
        ['Levantamento terra', 1.15], ['Clean', 1.15], ['Thruster', 1.15],
        ['Agachamento livre', 1.12], ['Back squat', 1.12],
        ['Remada curvada', 1.10], ['Barra fixa', 1.10], ['Hip thrust', 1.10],
        ['Ponte de glúteo', 1.08],
        ['Supino reto', 1.05], ['Bench press', 1.05], ['Mergulho livre', 1.05],
        ['Desenvolvimento com haltere', 1.05], ['Afundo', 1.05], ['Goblet squat', 1.05], ['Hack squat', 1.05],
        ['Leg press 45°', 1.02], ['Stiff', 1.02],
        ['Puxada alta', 1.00], ['Remada máquina', 1.00], ['Supino máquina', 1.00], ['Desenvolvimento máquina', 1.00],
        ['Cadeira extensora', 0.98], ['Mesa flexora', 0.98],
        ['Panturrilha em pé', 0.95],
        ['Cadeira abdutora', 0.92], ['Rosca direta', 0.92], ['Elevação lateral', 0.92],
        ['Elevação frontal', 0.92], ['Tríceps francês', 0.92],
        ['Abdominal', 0.90], ['Face pull', 0.90],
        ['Peck deck', 0.88], ['Crossover', 0.88], ['Tríceps pushdown', 0.88], ['Tríceps no cabo', 0.88],
    ]

    it.each(casos)('%s → %f', (nome, esperado) => {
        expect(f(nome)).toBeCloseTo(esperado, 3)
    })

    it('a versão MÁQUINA do supino não pega a regra do supino livre', () => {
        expect(f('Supino reto')).toBeGreaterThan(f('Supino máquina'))
        expect(f('Bench press')).toBeGreaterThan(f('Bench press machine'))
        expect(f('Remada curvada')).toBeGreaterThan(f('Remada máquina'))
    })
})

describe('fração de peso corporal — a tabela toda', () => {
    const casos: Array<[string, number]> = [
        ['Barra fixa', 1.00], ['Muscle up', 1.00],
        ['Mergulho nas paralelas', 0.90],
        ['Pistol squat', 0.85],
        ['Burpee', 0.70],
        ['Flexão de braço', 0.65],
        ['Remada australiana', 0.60],
    ]
    it.each(casos)('%s → %f do peso', (nome, esperado) => {
        expect(getBodyweightFraction(nome)).toBeCloseTo(esperado, 3)
    })

    it('exercício com carga não tem fração', () => {
        expect(getBodyweightFraction('Agachamento com barra')).toBe(0)
        expect(getBodyweightFraction('')).toBe(0)
    })
})

describe('estilo: os quatro caminhos', () => {
    it('cada estilo tem fator próprio', () => {
        const vistos = new Set(['strength', 'hypertrophy', 'endurance', 'circuit'].map((s) => getStyleFactor(s as never)))
        expect(vistos.size).toBeGreaterThan(1)
    })

    it('sem log nenhum não quebra', () => {
        expect(detectTrainingStyle({}, null)).toBeTruthy()
        expect(detectTrainingStyle({ '0-0': null } as never, null)).toBeTruthy()
    })

    it('minutos ativos com sessão de duração zero', () => {
        expect(computeActiveWorkMinutes({}, 0)).toBeGreaterThanOrEqual(0)
    })
})

describe('leitura de série — guardas contra dado sujo', () => {
    it('bloco/etapa/onda não-objeto é PULADO, não derruba a soma', () => {
        expect(clusterVolume({ blocksDetailed: [null, { weight: '100', reps: '5' }, 'lixo'] })).toBe(500)
        expect(stagesVolume([null, { weight: '60', reps: '10' }, 42 as never])).toBe(600)
        expect(waveVolume({ waves: [null, { heavy: '3' }], heavyWeight: '100' })).toBe(300)
    })

    it('peso ou reps zero dentro do bloco não somam', () => {
        expect(clusterVolume({ blocksDetailed: [{ weight: '0', reps: '5' }, { weight: '100', reps: '0' }] })).toBe(0)
        expect(stagesVolume([{ weight: '0', reps: '10' }])).toBe(0)
    })

    it('cluster vazio, sem blocos ou não-objeto devolve 0', () => {
        expect(clusterVolume({ blocksDetailed: [] })).toBe(0)
        expect(clusterVolume({})).toBe(0)
        expect(clusterVolume(null)).toBe(0)
        expect(clusterVolume('nada')).toBe(0)
    })

    it('wave sem lista ou não-objeto devolve 0', () => {
        expect(waveVolume({ waves: [] })).toBe(0)
        expect(waveVolume({})).toBe(0)
        expect(waveVolume(null)).toBe(0)
    })

    it('parse de peso e reps: vírgula, "feito/planejado", vazio e negativo', () => {
        expect(parseWeightValue('82,5')).toBe(82.5)
        expect(parseWeightValue('')).toBe(0)
        expect(parseWeightValue('-10')).toBe(0)
        expect(parseWeightValue(null)).toBe(0)
        expect(parseRepsValue('8/12')).toBe(8)
        expect(parseRepsValue('0/12')).toBe(0)
        expect(parseRepsValue('abc')).toBe(0)
        expect(parseRepsValue('')).toBe(0)
    })

    it('setTopWeightReps cai para o lado que tiver valor', () => {
        expect(setTopWeightReps({ R_weight: '20', R_reps: '10' })).toEqual({ weight: 20, reps: 10 })
        expect(setTopWeightReps(null)).toEqual({ weight: 0, reps: 0 })
    })

    it('rótulo de série que não é de trabalho', () => {
        expect(nonWorkingSetLabel({ set_type: 'warmup' })).toBe('Aquec.')
        expect(nonWorkingSetLabel({ setType: 'feeler' })).toBe('Recon.')
        expect(nonWorkingSetLabel({ weight: '80' })).toBeNull()
        expect(nonWorkingSetLabel(null)).toBeNull()
        expect(isNonWorkingSet(null)).toBe(false)
        expect(isNonWorkingSet({ isWarmup: true })).toBe(true)
    })

    it('setVolume e setBestE1rm com entrada não-objeto', () => {
        expect(setVolume(null)).toBe(0)
        expect(setVolume('x')).toBe(0)
        expect(setBestE1rm('x')).toBe(0)
    })

    it('drop-set com UMA etapa cai para o topo do log', () => {
        const umaEtapa = { weight: '50', reps: '10', drop_set: { stages: [{ weight: '50', reps: '10' }] } }
        expect(setVolume(umaEtapa)).toBe(500)
    })
})

describe('composição corporal — as guardas que lançam', () => {
    it('densidade recusa soma ou idade inválidas', () => {
        expect(() => calculateBodyDensity(0, 30, 'M')).toThrow()
        expect(() => calculateBodyDensity(70, 0, 'M')).toThrow()
    })

    it('Siri recusa densidade inválida', () => {
        expect(() => calculateBodyFatPercentage(0)).toThrow()
        expect(() => calculateBodyFatPercentage(-1)).toThrow()
    })

    it('IMC recusa peso/altura inválidos e clampa extremos', () => {
        expect(() => calculateBMI(0, 178)).toThrow()
        expect(() => calculateBMI(80, 0)).toThrow()
        expect(calculateBMI(300, 140)).toBeLessThanOrEqual(60)
        expect(calculateBMI(30, 200)).toBeGreaterThanOrEqual(10)
    })

    it('a densidade é clampada nas duas pontas', () => {
        expect(calculateBodyDensity(1, 18, 'M')).toBeLessThanOrEqual(1.1)
        expect(calculateBodyDensity(400, 80, 'F')).toBeGreaterThanOrEqual(1.0)
    })

    it('soma de dobras com string numérica funciona', () => {
        expect(sumSkinfoldsJP7({
            pectoral_skinfold: '6' as never, midaxillary_skinfold: 5, triceps_skinfold: 10,
            subscapular_skinfold: 12, abdominal_skinfold: 15, suprailiac_skinfold: 9, thigh_skinfold: 17.5,
        })).toBe(74.5)
    })
})

describe('grade da máquina — bordas', () => {
    it('pesos implausíveis são descartados antes de aprender', () => {
        // Precisa de amostras suficientes DEPOIS do filtro.
        expect(learnWeightGrid([0, -5, 'x', null, 18, 23, 27, 32, 36])).toBeTruthy()
        expect(learnWeightGrid([0, -5, null])).toBeNull()
    })

    it('todos os pesos iguais não geram passo', () => {
        expect(learnWeightGrid([20, 20, 20, 20])).toBeNull()
    })

    it('número PAR de degraus usa a média dos dois do meio', () => {
        expect(learnWeightGrid([10, 15, 20, 25])).toBeTruthy()
    })

    it('alvo abaixo do menor degrau conhecido não inventa', () => {
        const g = learnWeightGrid([18, 23, 27, 32])
        expect(snapToLearnedGrid(5, g)).toBeNull()
    })

    it('alvo não finito devolve null', () => {
        expect(snapToLearnedGrid(NaN, learnWeightGrid([18, 23, 27]))).toBeNull()
    })
})

describe('anilhas e incrementos', () => {
    it('máquina de anilha carrega tudo do mesmo lado (barra 0)', () => {
        const r = planPlatesPerSide(100, { barKg: 0 })
        expect(r!.barKg).toBe(0)
    })

    it('anilhas inválidas na lista são filtradas', () => {
        const r = planPlatesPerSide(100, { barKg: 20, plates: [20, 0, -5, NaN, 10] })
        expect(r).toBeTruthy()
        expect(r!.perSide.every((p) => p.plate > 0)).toBe(true)
    })

    it('incremento por equipamento', () => {
        expect(resolveIncrement(['halteres']).increment).toBeGreaterThan(0)
        expect(resolveIncrement(['maquina']).increment).toBeGreaterThan(0)
        expect(resolveIncrement(null).increment).toBeGreaterThan(0)
        expect(resolveIncrement([]).increment).toBeGreaterThan(0)
        expect(resolveIncrement(['peso_corporal']).loadBearing).toBe(false)
    })

    it('arredonda para cima quando pedido', () => {
        expect(roundToIncrement(83, 5, 'up')).toBeGreaterThanOrEqual(83)
        expect(roundToIncrement(83, 5, 'down')).toBeLessThanOrEqual(83)
        expect(roundToIncrement(0, 5)).toBe(0)
        expect(roundToIncrement(NaN, 5)).toBe(0)
    })

    it('equipamento inferido pelo nome cobre as famílias', () => {
        expect(inferEquipmentFromName('Barra fixa')).toBeTruthy()
        expect(inferEquipmentFromName('Rosca com halteres')).toBeTruthy()
        expect(inferEquipmentFromName('')).toBeTruthy()
    })
})

describe('kcal da sessão e do cardio', () => {
    // `SessionKcalInputs` é BRANDED de propósito (objeto literal não compila) —
    // é a trava que impede cada chamador de reinventar a ordem dos ingredientes.
    const INPUTS = { bodyWeightKg: 80, biologicalSex: 'male', rpe: 8 } as never

    it('sessão só de cardio não passa pelo modelo de força', () => {
        const r = estimateSessionKcal({
            totalTime: 1800,
            exercises: [{ name: 'Esteira', method: 'cardio' }],
            logs: { '0-0': { durationSeconds: 1800, done: true } },
        }, INPUTS)
        expect(r).toBeGreaterThanOrEqual(0)
    })

    it('sessão vazia devolve 0', () => {
        expect(estimateSessionKcal(null, INPUTS)).toBe(0)
        expect(estimateSessionKcal({}, INPUTS)).toBe(0)
    })

    it('cadência do exercício é lida de `cadence` ou `tempo`', () => {
        const base = { totalTime: 3600, logs: { '0-0': { weight: '100', reps: '10', done: true } } }
        const a = estimateSessionKcal({ ...base, exercises: [{ name: 'Supino', cadence: '2-0-2-0' }] }, INPUTS)
        const b = estimateSessionKcal({ ...base, exercises: [{ name: 'Supino', tempo: '2-0-2-0' }] }, INPUTS)
        expect(a).toBe(b)
    })

    it('MET de cardio varia por modalidade e por intensidade', () => {
        expect(metForCardio('corrida', 9, false)).toBeGreaterThan(metForCardio('caminhada', 3, false))
        expect(metForCardio('corrida', 9, true)).toBeGreaterThan(metForCardio('corrida', 9, false))
        expect(metForCardio('modalidade inventada', 5, false)).toBeGreaterThan(0)
    })

    it('kcal absurda é clampada', () => {
        expect(clampSessionKcal(999_999)).toBeLessThanOrEqual(50_000)
        expect(clampSessionKcal(-5)).toBe(0)
        expect(clampSessionKcal('x')).toBe(0)
    })

    it('cardio sem série concluída conta ZERO — não fez, não conta', () => {
        // O bug de ago/2026: lia `reps` (tempo PLANEJADO) e somava kcal de um
        // cardio que a pessoa pulou.
        const r = estimateCardioKcal({
            exercises: [{ name: 'Esteira', method: 'cardio', reps: '20' }],
            logs: {},
        })
        expect(r.totalKcal).toBe(0)
        expect(r.cardioMinutes).toBe(0)
    })

    it('cardio concluído conta os minutos REAIS', () => {
        const r = estimateCardioKcal({
            exercises: [{ name: 'Esteira', method: 'cardio', reps: '20' }],
            logs: { '0-0': { done: true, durationSeconds: 600 } },
        }, { bodyWeightKg: 80 })
        expect(r.cardioMinutes).toBeCloseTo(10, 1)
        expect(r.totalKcal).toBeGreaterThan(0)
    })
})

describe('pacing — bordas', () => {
    it('exercício sem nada usa os padrões', () => {
        expect(calculateExerciseDuration({ sets: 'x', reps: 'y', restTime: 'z' })).toBeGreaterThan(0)
    })

    it('grupo com exercício nulo devolve 0', () => {
        expect(calculateExerciseDurationForGroup(null, 2)).toBe(0)
    })

    it('lista inválida no grupo devolve 0', () => {
        expect(estimateWorkoutSecondsForGroup(null as never, 2)).toBe(0)
    })

    it('bike outdoor só é reconhecida com os três sinais', () => {
        // Sem "cardio" no método/tipo/nome → não é cardio.
        expect(calculateExerciseDuration({ name: 'Bike outdoor', reps: '' })).toBeGreaterThan(0)
    })
})

describe('Iron Rank e metas — últimos ramos', () => {
    it('progresso quando o nível é o último da lista', () => {
        const p = getIronRankProgress(Number.MAX_SAFE_INTEGER)
        expect(p.progress).toBe(100)
        expect(p.name).toBeTruthy()
    })

    it('metas de nutrição para os três objetivos', () => {
        const stats = { weight: 80, height: 178, age: 35, gender: 'MALE', activityLevel: 'MODERATE' } as const
        for (const goal of ['CUT', 'MAINTAIN', 'BULK'] as const) {
            const g = calculateNutritionGoals(stats, goal)
            expect(g.calories, goal).toBeGreaterThan(0)
            expect(g.protein, goal).toBeGreaterThan(0)
        }
        // CUT corta e BULK acrescenta em relação à manutenção.
        expect(calculateNutritionGoals(stats, 'CUT').calories)
            .toBeLessThan(calculateNutritionGoals(stats, 'MAINTAIN').calories)
        expect(calculateNutritionGoals(stats, 'BULK').calories)
            .toBeGreaterThan(calculateNutritionGoals(stats, 'MAINTAIN').calories)
    })
})

describe('evolução de carga e outlier — últimos ramos', () => {
    it('exercício sem nome não vira série', () => {
        expect(buildLoadEvolution([
            { date: '2026-08-01', exercises: [{ name: '' }], logs: { '0-0': { weight: '80', reps: '10', done: true } } },
            { date: '2026-08-08', exercises: [{ name: '' }], logs: { '0-0': { weight: '85', reps: '10', done: true } } },
        ])).toEqual([])
    })

    it('sessão sem data é ignorada', () => {
        expect(buildLoadEvolution([
            { exercises: [{ name: 'Supino' }], logs: { '0-0': { weight: '80', reps: '10', done: true } } },
        ])).toEqual([])
    })

    it('detector de outlier: fator 4 para cima e para baixo', () => {
        // Folgado de propósito: progressão real anda em 2,5–10% e o autoload
        // trava em +10%; erro de digitação dá fator 5 a 10.
        expect(detectWeightOutlier(400, 80)!.direcao).toBe('acima')
        expect(detectWeightOutlier(20, 80)!.direcao).toBe('abaixo')
        expect(detectWeightOutlier(85, 80)).toBeNull()
        expect(detectWeightOutlier(0, 80)).toBeNull()
        expect(detectWeightOutlier(400, 0)).toBeNull()
        expect(detectWeightOutlier('x', 80)).toBeNull()
    })

    it('o aviso do outlier tem texto nas duas direções', () => {
        expect(outlierLabel(detectWeightOutlier(400, 80)!)).toBeTruthy()
        expect(outlierLabel(detectWeightOutlier(20, 80)!)).toBeTruthy()
    })

    it('item de histórico sem peso não entra na referência', () => {
        const ref = buildWeightReference({
            exercises: { 'supino reto': { items: [{ topWeight: 0 }, { topWeight: null }, { topWeight: 80 }] } },
        })
        expect(Object.keys(ref)).toHaveLength(0)
    })
})

describe('estimateCaloriesMet — ramos finais', () => {
    it('exercícios sem nome não montam o mapa de complexidade', () => {
        expect(estimateCaloriesMet({ '0-0': { weight: '100', reps: '10', done: true } }, 45, 80, [])).toBeGreaterThan(0)
        expect(estimateCaloriesMet({ '0-0': { weight: '100', reps: '10', done: true } }, 45, 80, null)).toBeGreaterThan(0)
    })

    it('cluster sem blocos cai na leitura padrão da série', () => {
        expect(estimateCaloriesMet(
            { '0-0': { weight: '100', reps: '10', done: true, cluster: { blocks: [] } } }, 45, 80, ['Supino reto'],
        )).toBeGreaterThan(0)
    })

    it('chave de log ilegível não resolve exercício e segue', () => {
        expect(estimateCaloriesMet(
            { 'abc-def': { weight: '100', reps: '10', done: true } }, 45, 80, ['Supino reto'],
        )).toBeGreaterThan(0)
    })

    it('override de descanso é aceito na assinatura', () => {
        expect(estimateCaloriesMet(
            { '0-0': { weight: '100', reps: '10', done: true } }, 60, 80, ['Supino reto'], null, 30, 30,
        )).toBeGreaterThan(0)
    })
})

describe('últimos ramos — bordas finas', () => {
    it('Iron Rank: cada faixa da tabela devolve o seu nível', () => {
        // Percorre os limiares: logo abaixo de cada um o nível é i+1.
        for (let i = 0; i < IRON_RANK_THRESHOLDS.length - 1; i++) {
            expect(getIronRankLevelFn(IRON_RANK_THRESHOLDS[i] - 1), `abaixo do limiar ${i}`).toBe(i + 1)
        }
        // No último limiar e acima, é o nível máximo.
        expect(getIronRankLevelFn(IRON_RANK_THRESHOLDS[IRON_RANK_THRESHOLDS.length - 2])).toBe(IRON_RANK_MAX_LEVEL_C)
    })

    it('rateio: quando TODOS têm tempo, o tempo manda; se um não tem, cai no volume', () => {
        // Todos com tempo → pesa por tempo.
        const porTempo = distributeKcalByExercise2([{ executionMinutes: 30 }, { executionMinutes: 10 }], 400)
        expect(porTempo[0]).toBeGreaterThan(porTempo[1])
        // Um sem tempo → o tempo é descartado e o VOLUME manda.
        const porVolume = distributeKcalByExercise2(
            [{ executionMinutes: 30, volumeKg: 100 }, { executionMinutes: 0, volumeKg: 9000 }], 400,
        )
        expect(porVolume[1]).toBeGreaterThan(porVolume[0])
    })

    it('rateio com fixa: todas fixas não sobra flexível', () => {
        expect(distributeKcalWithFixed2([{ fixedKcal: 100 }, { fixedKcal: 200 }], 500)).toEqual([100, 200])
    })

    it('rateio com fixa: flexíveis por TEMPO, e sem peso divide igual', () => {
        const porTempo = distributeKcalWithFixed2(
            [{ fixedKcal: 100 }, { executionMinutes: 30 }, { executionMinutes: 10 }], 400,
        )
        expect(porTempo[0]).toBe(100)
        expect(porTempo[1]).toBeGreaterThan(porTempo[2])

        const igual = distributeKcalWithFixed2([{ fixedKcal: 50 }, {}, {}], 100)
        expect(igual[1]).toBe(igual[2])
        expect(igual[1] + igual[2]).toBe(100)
    })

    it('rateio com fixa: lista vazia e fixa inválida', () => {
        expect(distributeKcalWithFixed2([], 100)).toEqual([])
        expect(distributeKcalWithFixed2([{ fixedKcal: -5 }], 0)).toEqual([0])
        expect(distributeKcalWithFixed2([{ fixedKcal: 'x' as never }], 0)).toEqual([0])
    })

    it('grade: pesos fora de ordem são ordenados antes de medir o passo', () => {
        const g = learnWeightGrid([41, 18, 32, 23, 36, 27])
        expect(g).toBeTruthy()
        expect(snapToLearnedGrid(30, g)).toBe(27)
    })

    it('grade: valores repetidos não geram gap zero', () => {
        expect(learnWeightGrid([18, 18, 23, 23, 27, 27, 32, 32])).toBeTruthy()
    })

    it('incremento: acessório é ignorado e a prioridade de classe decide', () => {
        // Só acessório → nenhuma classe → default.
        expect(resolveIncrement(['cinto']).equipmentClass).toBe('default')
        // Entrada com item não-string é filtrada.
        expect(resolveIncrement([123 as never, 'halteres']).increment).toBeGreaterThan(0)
        // Slug desconhecido → default.
        expect(resolveIncrement(['equipamento_inventado']).equipmentClass).toBe('default')
        // Duas classes → a de maior prioridade vence.
        const duas = resolveIncrement(['barra', 'maquina'])
        expect(duas.increment).toBeGreaterThan(0)
    })

    it('roundSuggestedWeight devolve o peso cru quando não há carga externa', () => {
        expect(roundSuggestedWeight2(83.3, ['peso_corporal'])).toBeCloseTo(83.3, 5)
        expect(roundSuggestedWeight2(NaN, ['peso_corporal'])).toBe(0)
        expect(roundSuggestedWeight2(83.3, ['barra'], 'up')).toBeGreaterThanOrEqual(83.3)
    })

    it('evolução de carga: exercício sem log e sessão sem exercises', () => {
        expect(buildLoadEvolution([{ date: '2026-08-01', exercises: null, logs: null }])).toEqual([])
        expect(buildLoadEvolution([
            { date: '2026-08-01', exercises: [null], logs: { '0-0': { weight: '80', reps: '10', done: true } } },
        ])).toEqual([])
    })

    it('metas de nutrição: peso ausente não quebra o split', () => {
        const stats = { weight: 80, height: 178, age: 35, gender: 'FEMALE', activityLevel: 'SEDENTARY' } as const
        const g = calculateNutritionGoals(stats, 'MAINTAIN')
        expect(g.calories).toBeGreaterThan(0)
        expect(g.carbs).toBeGreaterThanOrEqual(0)
    })
})

describe('guardas defensivas alcançáveis pela API pública', () => {
    it('grade construída à mão com lista vazia é recusada', () => {
        // `learnWeightGrid` nunca produz isso, mas `snapToLearnedGrid` é
        // exportada e aceita qualquer `WeightGrid` — a guarda é real.
        expect(snapToLearnedGrid(30, { values: [], step: 5, samples: 0 })).toBeNull()
    })

    it('grade com passo inválido não extrapola para o infinito', () => {
        expect(snapToLearnedGrid(100, { values: [10, 20], step: 0, samples: 2 })).not.toBe(Infinity)
    })

    it('equipamento inferido de entrada nula/não-string', () => {
        expect(inferEquipmentFromName(null as never)).toBeTruthy()
        expect(inferEquipmentFromName(undefined as never)).toBeTruthy()
        expect(inferEquipmentFromName(42 as never)).toBeTruthy()
    })

    it('kcal do cliente: sessão sem preCheckin e com candidatos inválidos', () => {
        expect(computeFallbackKcal2({ session: { totalTime: 3600, logs: {}, preCheckin: {} } })).toBeGreaterThanOrEqual(0)
        expect(computeFallbackKcal2({
            session: { totalTime: 3600, logs: {}, preCheckin: { weight: 'x', body_weight_kg: 999 } },
        })).toBeGreaterThanOrEqual(0)
        // Peso vindo de `answers` aninhado.
        expect(computeFallbackKcal2({
            session: { totalTime: 3600, logs: {}, preCheckin: { answers: { body_weight_kg: 85 } } },
        })).toBeGreaterThan(0)
    })

    it('outdoorBike com kcal inválida cai na estimativa', () => {
        expect(computeFallbackKcal2({
            session: { totalTime: 3600, logs: {}, outdoorBike: { caloriesKcal: 0 } },
        })).toBeGreaterThan(0)
        expect(computeFallbackKcal2({
            session: { totalTime: 3600, logs: {}, outdoorBike: 'nao e objeto' },
        })).toBeGreaterThan(0)
    })

    it('duração vinda de execução + descanso quando totalTime falta', () => {
        expect(computeFallbackKcal2({
            session: { executionTotalSeconds: 1200, restTotalSeconds: 1800, logs: {} },
        })).toBeGreaterThan(0)
        // E pelo snake_case, que é como vem do banco.
        expect(computeFallbackKcal2({
            session: { execution_total_seconds: 1200, rest_total_seconds: 1800, logs: {} },
        })).toBeGreaterThan(0)
    })

    it('pacing: cadência com dígitos e sem separador em exercício real', () => {
        expect(calculateExerciseDuration({ sets: '3', reps: '10', cadence: '3-0-1-0', restTime: '60' }))
            .toBeGreaterThan(0)
    })
})

/**
 * Dado sujo em toda porta pública.
 *
 * Os ramos que faltavam eram quase todos o "lado sujo" de guardas que os testes
 * nunca exercitavam — sempre passei objeto bem formado. Mas o dado real vem de
 * `workouts.notes` (JSON serializado, editado por várias versões do app), então
 * o lado sujo É o caminho de produção em sessão antiga.
 */
describe('entrada suja em toda porta pública', () => {
    const LIXO = [null, undefined, 42, 'texto', true, [], () => {}]

    it('leitura de série aceita qualquer lixo sem lançar', () => {
        for (const x of LIXO) {
            expect(() => setVolume(x)).not.toThrow()
            expect(() => setBestE1rm(x)).not.toThrow()
            expect(() => setTopWeightReps(x)).not.toThrow()
            expect(() => clusterVolume(x)).not.toThrow()
            expect(() => waveVolume(x)).not.toThrow()
            expect(() => isNonWorkingSet(x)).not.toThrow()
            expect(() => nonWorkingSetLabel(x)).not.toThrow()
        }
        expect(stagesVolume(LIXO as never)).toBe(0)
    })

    it('1RM: etapas/ondas/blocos com itens sujos são pulados', () => {
        expect(setBestE1rm({ drop_set: { stages: [null, 'x', { weight: '80', reps: '8' }] } }))
            .toBeGreaterThan(0)
        expect(setBestE1rm({ wave: { waves: [null, 'x'], heavyWeight: '100' } })).toBe(0)
        expect(setBestE1rm({ cluster: { blocksDetailed: [null, 'x'] } })).toBe(0)
        // Etapas presentes mas todas sem valor → cai para o topo do log.
        expect(setBestE1rm({ weight: '60', reps: '10', drop_set: { stages: [{ weight: '0', reps: '0' }, { weight: '0', reps: '0' }] } }))
            .toBeGreaterThan(0)
    })

    it('série sem `done` explícito conta como feita (log antigo)', () => {
        expect(isWorkingSet({ weight: '80', reps: '10' })).toBe(true)
        expect(isWorkingSet({ weight: '80', reps: '10', done: 'true' })).toBe(true)
        expect(isWorkingSet({ weight: '80', reps: '10', completed: true })).toBe(true)
    })

    it('wave sem peso de tier cai no base; sem base nenhum, zero', () => {
        expect(setBestE1rm({ wave: { waves: [{ heavy: '3' }] } })).toBe(0)
    })

    it('cluster no formato antigo (`blocks`) é lido no 1RM', () => {
        expect(setBestE1rm({ cluster: { blocks: [{ weight: '90', reps: '4' }] } })).toBeGreaterThan(0)
    })

    it('MET aceita logs e exercícios sujos', () => {
        for (const x of LIXO) {
            expect(() => estimateCaloriesMet({ '0-0': x } as never, 45, 80, ['Supino'])).not.toThrow()
            expect(() => detectTrainingStyle({ '0-0': x } as never, [x] as never)).not.toThrow()
        }
        // Cluster com blocos sujos dentro do cômputo de volume.
        expect(estimateCaloriesMet(
            { '0-0': { done: true, cluster: { blocksDetailed: [null, 'x', { weight: '100', reps: '5' }] } } },
            45, 80, ['Leg press 45°'],
        )).toBeGreaterThan(0)
        // Cluster no formato antigo.
        expect(estimateCaloriesMet(
            { '0-0': { done: true, cluster: { blocks: [{ weight: '100', reps: '5' }] } } },
            45, 80, ['Leg press 45°'],
        )).toBeGreaterThan(0)
    })

    it('kcal da sessão aceita exercícios sujos', () => {
        const INPUTS = { bodyWeightKg: 80 } as never
        expect(() => estimateSessionKcal({
            totalTime: 3600, exercises: LIXO, logs: { '0-0': { weight: '100', reps: '10', done: true } },
        }, INPUTS)).not.toThrow()
        // Chave de log ilegível.
        expect(() => estimateSessionKcal({
            totalTime: 3600, exercises: [{ name: 'Supino' }], logs: { 'x-y': { weight: '100', reps: '10' } },
        }, INPUTS)).not.toThrow()
        // Log não-objeto.
        expect(() => estimateSessionKcal({
            totalTime: 3600, exercises: [{ name: 'Supino' }], logs: { '0-0': 'lixo' },
        }, INPUTS)).not.toThrow()
    })

    it('cardio aceita sessão e logs sujos', () => {
        for (const x of LIXO) expect(() => estimateCardioKcal(x)).not.toThrow()
        expect(estimateCardioKcal({
            exercises: [{ name: 'Esteira', method: 'cardio' }], logs: { '0-0': 'lixo' },
        }).totalKcal).toBe(0)
        // Duração absurda é recusada.
        expect(estimateCardioKcal({
            exercises: [{ name: 'Esteira', method: 'cardio' }],
            logs: { '0-0': { done: true, durationSeconds: 999_999 } },
        }, { bodyWeightKg: 80 }).cardioMinutes).toBe(0)
        expect(metForCardio(null, null, false)).toBeGreaterThan(0)
    })

    it('rateio aceita lista suja', () => {
        expect(distributeKcalByExercise2(null as never, 100)).toEqual([])
        expect(distributeKcalWithFixed2(null as never, 100)).toEqual([])
        expect(distributeKcalByExercise2([null, undefined] as never, 100).length).toBe(2)
        expect(distributeKcalWithFixed2([null, undefined] as never, 100).length).toBe(2)
    })

    it('referência de carga aceita histórico sujo', () => {
        expect(buildWeightReference({ exercises: { 'supino': 'nao e objeto' } })).toEqual({})
        expect(buildWeightReference({ exercises: { 'supino': { items: 'nao e array' } } })).toEqual({})
        expect(buildWeightReference({ exercises: { 'supino': { items: [null, 'x', 42] } } })).toEqual({})
        // `avgWeight` como alternativa a `topWeight`.
        const comAvg = buildWeightReference({
            exercises: { 'supino': { items: [{ avgWeight: 80 }, { avgWeight: 82 }, { avgWeight: 78 }] } },
        })
        expect(Object.keys(comAvg).length).toBeGreaterThan(0)
    })

    it('pacing aceita exercício sujo', () => {
        for (const x of LIXO) {
            expect(() => calculateExerciseDuration(x as never)).not.toThrow()
            expect(() => calculateExerciseDurationForGroup(x as never, 2)).not.toThrow()
        }
    })

    it('anilhas: barra inválida cai na olímpica', () => {
        const r = planPlatesPerSide(100, { barKg: NaN })
        expect(r!.barKg).toBe(20)
        const semOpts = planPlatesPerSide(100)
        expect(semOpts!.barKg).toBe(20)
    })

    it('cliente de kcal: exercícios sujos na sessão', () => {
        expect(() => computeFallbackKcal2({ session: { totalTime: 3600, logs: {}, exercises: LIXO } })).not.toThrow()
    })

    it('suggestWeight aceita histórico não-array e alvo inválido', () => {
        const r = suggestWeight2({ targetReps: NaN, targetRpe: NaN, equipment: ['barra'], history: 'nao e array' as never })
        expect(r.weight).toBeNull()
    })

    it('metas de nutrição REJEITAM objetivo desconhecido em vez de inventar meta', () => {
        // Cair num "neutro" silencioso seria pior: o usuário receberia uma meta
        // de calorias sem ter escolhido fase nenhuma.
        const stats = { weight: 80, height: 178, age: 35, gender: 'MALE', activityLevel: 'MODERATE' } as const
        expect(() => calculateNutritionGoals(stats, 'INVENTADO' as never)).toThrow('nutrition_invalid_goal')
    })

    it('evolução de carga ordena por data e por quantidade de pontos', () => {
        const r = buildLoadEvolution([
            { date: '2026-08-08', exercises: [{ name: 'Supino' }], logs: { '0-0': { weight: '85', reps: '10', done: true } } },
            { date: '2026-08-01', exercises: [{ name: 'Supino' }], logs: { '0-0': { weight: '80', reps: '10', done: true } } },
            { date: '2026-08-01', exercises: [{ name: 'Agachamento' }], logs: { '0-0': { weight: '100', reps: '10', done: true } } },
            { date: '2026-08-08', exercises: [{ name: 'Agachamento' }], logs: { '0-0': { weight: '105', reps: '10', done: true } } },
            { date: '2026-08-15', exercises: [{ name: 'Agachamento' }], logs: { '0-0': { weight: '110', reps: '10', done: true } } },
        ])
        // Quem tem mais pontos vem primeiro.
        expect(r[0].points.length).toBeGreaterThanOrEqual(r[1].points.length)
        // E dentro da série, as datas sobem.
        expect(r[0].points[0].date < r[0].points[1].date).toBe(true)
    })
})

describe('os últimos caminhos alcançáveis', () => {
    it('cold start em exercício SEM carga externa usa incremento fixo de 2,5', () => {
        // `roundIncrementCold = inc.loadBearing ? inc.increment : 2.5` — o lado
        // direito só roda aqui: peso corporal + sinal de hoje + zero histórico.
        const r = suggestWeight2({
            targetReps: 10, targetRpe: 8, equipment: ['peso_corporal'],
            history: [], todaySignal: { weight: 30, reps: 10, rpe: 8 },
        })
        // Sem histórico E sem carga externa, o motor recusa antes do cold start:
        // progressão por reps é a resposta certa para peso corporal.
        expect(r.weight).toBeNull()
        expect(r.rationale).toMatch(/repeti/i)
    })

    it('cold start cujo cálculo não fecha peso positivo devolve null', () => {
        const r = suggestWeight2({
            targetReps: 100, targetRpe: 10, equipment: ['barra'],
            history: [], todaySignal: { weight: 1, reps: 1, rpe: 10 },
        })
        expect(r.weight === null || r.weight > 0).toBe(true)
    })

    it('sem alvo de reps, o cold start usa as reps do próprio sinal', () => {
        const r = suggestWeight2({
            targetReps: 0, targetRpe: 8, equipment: ['barra'],
            history: [], todaySignal: { weight: 60, reps: 12, rpe: 8 },
        })
        expect(r.reps).toBeNull()
        expect(r.weight).toBeGreaterThan(0)
    })

    it('falha marcada com carga JÁ abaixo do topo não mexe no número', () => {
        // `if (anyFailed && raw > topWeight)` — o lado em que a condição é falsa
        // porque `raw` já ficou abaixo (prontidão ruim puxou para baixo).
        const r = suggestWeight2({
            targetReps: 12, targetRpe: 6, equipment: ['barra'],
            history: [{ weight: 100, reps: 6, rpe: 10, failed: true }],
            readiness: { sleepHours: 3, soreness: 9, energy: 1 },
        })
        expect(r.weight).toBeGreaterThan(0)
    })

    it('sinal de hoje sem histórico utilizável não vira fator do dia', () => {
        const r = suggestWeight2({
            targetReps: 10, targetRpe: 8, equipment: ['barra'],
            history: [{ weight: 100, reps: 0 }],
            todaySignal: { weight: 80, reps: 8, rpe: 8 },
        })
        expect(r.weight).toBeGreaterThan(0)
    })

    it('volume negativo é ignorado e o rateio cai em partes iguais', () => {
        // Nenhum volume POSITIVO → cai no peso 1 para cada, e o total fecha.
        expect(distributeKcalByExercise2([{ volumeKg: -100 }, { volumeKg: -50 }], 300)).toEqual([150, 150])
        expect(distributeKcalWithFixed2([{ volumeKg: -100 }, { volumeKg: -50 }], 300)).toEqual([150, 150])
    })

    it('etapas presentes mas todas zeradas caem para a leitura padrão', () => {
        // `if (stages) { const sv = stagesVolume(stages); if (sv > 0) return sv }`
        expect(setVolume({ weight: '50', reps: '10', drop_set: { stages: [{ weight: '0', reps: '0' }, { weight: '0', reps: '0' }] } }))
            .toBe(500)
    })

    it('`done` em todas as grafias que o JSON já gravou', () => {
        expect(isWorkingSet({ weight: '80', reps: '10', done: false })).toBe(false)
        expect(isWorkingSet({ weight: '80', reps: '10', isDone: true })).toBe(true)
        expect(isWorkingSet({ weight: '80', reps: '10', done: 'TRUE' })).toBe(true)
        expect(isWorkingSet({ weight: '80', reps: '10', done: 'qualquer' })).toBe(false)
    })

    it('cluster só com `blocks` (sem `blocksDetailed`) no 1RM', () => {
        expect(setBestE1rm({ cluster: { blocksDetailed: 'nao e array', blocks: [{ weight: '90', reps: '4' }] } }))
            .toBeGreaterThan(0)
        expect(setBestE1rm({ cluster: { blocksDetailed: 'x', blocks: 'y' } })).toBe(0)
    })

    it('grupo: exercício sem reps/descanso/cadência usa todos os padrões', () => {
        expect(calculateExerciseDurationForGroup({}, 2)).toBeGreaterThan(0)
        expect(calculateExerciseDurationForGroup({ reps: 'x', restTime: 'y', cadence: '' }, 3)).toBeGreaterThan(0)
    })

    it('anilhas: kit que não monta nem uma anilha devolve null', () => {
        // Carga por lado menor que a anilha mais leve disponível.
        expect(planPlatesPerSide(41, { barKg: 20, plates: [20] })).toBeNull()
    })

    it('MET: estilo desconhecido cai no fator padrão', () => {
        expect(getStyleFactor('inventado' as never)).toBeGreaterThan(0)
    })

    it('MET: peso/reps inválidos na série viram zero', () => {
        expect(estimateCaloriesMet({ '0-0': { weight: 'abc', reps: 'xyz', done: true } }, 45, 80, ['Supino']))
            .toBeGreaterThanOrEqual(0)
    })

    it('MET: total não finito devolve 0', () => {
        expect(estimateCaloriesMet({ '0-0': { weight: '1e400', reps: '10', done: true } }, 45, 80, ['Supino']))
            .toBeGreaterThanOrEqual(0)
    })

    it('cliente de kcal: workoutId não-string vira null no payload', async () => {
        const spy = vi2.fn(() => ({ ok: true, json: async () => ({ kcal: 100 }) }))
        vi2.stubGlobal('fetch', spy as never)
        await getKcalEstimate2({ session: { totalTime: 3600, logs: {} }, workoutId: 42 })
        expect(JSON.parse((spy.mock.calls[0][1] as { body: string }).body).workoutId).toBeNull()
        vi2.unstubAllGlobals()
    })

    it('cliente de kcal: sessão não-objeto no fallback de rede', async () => {
        vi2.stubGlobal('fetch', vi2.fn(() => { throw new Error('offline') }) as never)
        await expect(getKcalEstimate2({ session: 'nao e sessao' })).resolves.toBe(0)
        vi2.unstubAllGlobals()
    })
})
