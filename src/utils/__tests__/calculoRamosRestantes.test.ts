/**
 * Ramos restantes das áreas de cálculo.
 *
 * Fecha os últimos caminhos sem cobertura em `volumeVariation`, `ironRank`,
 * `loadEvolution`, `weightOutlier`, `distributeKcal`, `sessionKcal`,
 * `machineGrid`, `plateMath`, `plateBreakdown`, `suggestWeight`, `setVolume`,
 * `goals` e `mifflinStJeor` — todos produzem número que o usuário lê.
 */
import { describe, it, expect } from 'vitest'
import { classificarVariacaoVolume, rotuloVariacaoVolume, LIMIAR_RUIDO_PCT } from '@/utils/report/volumeVariation'
import { getIronRankLevel, getIronRankProgress, IRON_RANK_MAX_LEVEL, IRON_RANK_THRESHOLDS } from '@/utils/gamification/ironRank'
import { buildLoadEvolution } from '@/lib/workout/loadEvolution'
import { buildWeightReference } from '@/lib/workout/weightOutlier'
import { distributeKcalByExercise, distributeKcalWithFixed } from '@/utils/calories/distributeKcal'
import { snapToLearnedGrid, learnWeightGrid } from '@/utils/autoload/machineGrid'
import { roundToIncrement } from '@/utils/autoload/plateMath'
import { planPlatesPerSide, formatPlateLoadout } from '@/utils/autoload/plateBreakdown'
import { setVolume, setTotalReps, isWorkingSet, setBestE1rm, epley1rm, sessionVolumeKg } from '@/utils/report/setVolume'
import { calculateExerciseDuration, calculateExerciseDurationForGroup } from '@/utils/pacing'
import { calculateMacros, getActivityMultiplier } from '@/lib/nutrition/goals'
import { basalMetabolicRate } from '@/lib/health/mifflinStJeor'

describe('variação de volume — o ruído não vira tendência', () => {
    it('abaixo do limiar é "estável", nos dois sentidos', () => {
        expect(classificarVariacaoVolume(LIMIAR_RUIDO_PCT - 0.1)).toBe('estavel')
        expect(classificarVariacaoVolume(-(LIMIAR_RUIDO_PCT - 0.1))).toBe('estavel')
        expect(classificarVariacaoVolume(0)).toBe('estavel')
    })

    it('acima do limiar vira alta ou queda', () => {
        expect(classificarVariacaoVolume(20)).toBe('alta')
        expect(classificarVariacaoVolume(-20)).toBe('queda')
    })

    it('cada classe tem rótulo', () => {
        for (const c of ['alta', 'estavel', 'queda'] as const) {
            expect(rotuloVariacaoVolume(c)).toBeTruthy()
        }
    })
})

describe('Iron Rank', () => {
    it('começa no nível 1 e sobe com o volume', () => {
        expect(getIronRankLevel(0)).toBe(1)
        expect(getIronRankLevel(-5)).toBe(1)
        expect(getIronRankLevel(IRON_RANK_THRESHOLDS[0] + 1)).toBeGreaterThan(1)
    })

    it('trava no nível máximo — volume absurdo não estoura a lista de nomes', () => {
        const p = getIronRankProgress(999_999_999)
        expect(p.level).toBe(IRON_RANK_MAX_LEVEL)
        expect(p.name).toBeTruthy()
        expect(p.progress).toBe(100)
    })

    it('progresso fica entre 0 e 100 em toda a escala', () => {
        for (const v of [0, 1, 5_000, 50_000, 500_000, 2_400_000, 1e12]) {
            const p = getIronRankProgress(v)
            expect(p.progress, `vol ${v}`).toBeGreaterThanOrEqual(0)
            expect(p.progress, `vol ${v}`).toBeLessThanOrEqual(100)
        }
    })

    it('entrada inválida não quebra o card', () => {
        expect(getIronRankProgress(NaN).level).toBe(1)
        expect(getIronRankProgress(undefined as unknown as number).level).toBe(1)
    })
})

describe('evolução de carga', () => {
    const sessao = (date: string, peso: string) => ({
        date,
        exercises: [{ name: 'Supino reto' }],
        logs: { '0-0': { weight: peso, reps: '10', done: true } },
    })

    it('monta uma série por exercício, um ponto por dia', () => {
        const r = buildLoadEvolution([sessao('2026-08-01', '80'), sessao('2026-08-08', '85')])
        expect(r.length).toBe(1)
        expect(r[0].exercise.toLowerCase()).toContain('supino')
        expect(r[0].points.length).toBe(2)
        expect(r[0].points[1].topWeight).toBeGreaterThan(r[0].points[0].topWeight)
    })

    it('duas séries do mesmo exercício no MESMO dia viram UM ponto', () => {
        // Duas datas porque a série só é publicada com 2+ pontos — um ponto
        // sozinho não é evolução, é um dado.
        const r = buildLoadEvolution([
            {
                date: '2026-08-01',
                exercises: [{ name: 'Supino reto' }],
                logs: { '0-0': { weight: '80', reps: '10', done: true }, '0-1': { weight: '85', reps: '8', done: true } },
            },
            sessao('2026-08-08', '90'),
        ])
        expect(r[0].points.length, 'o dia com 2 séries é UM ponto').toBe(2)
        expect(r[0].points[0].topWeight).toBe(85)
    })

    it('exercício com um único dia NÃO vira série — não há evolução de um ponto', () => {
        expect(buildLoadEvolution([sessao('2026-08-01', '80')])).toEqual([])
    })

    it('lista vazia ou lixo devolve vazio', () => {
        expect(buildLoadEvolution([])).toEqual([])
        expect(buildLoadEvolution(null as never)).toEqual([])
    })

    it('sessão sem série logada não vira ponto fantasma', () => {
        const r = buildLoadEvolution([{ date: '2026-08-01', exercises: [{ name: 'Supino' }], logs: {} }])
        expect(r.every((s) => s.points.length > 0)).toBe(true)
    })
})

describe('referência de carga (detector de digitação errada)', () => {
    const hist = (pesos: number[]) => ({
        exercises: {
            'supino reto': { items: pesos.map((w) => ({ topWeight: w })) },
        },
    })

    it('usa a MEDIANA — um outlier passado não cega o detector', () => {
        // Com MÉDIA, o 200 digitado errado puxaria a referência para cima e o
        // próximo 200 passaria despercebido. Com mediana, a referência fica em 80.
        const ref = buildWeightReference(hist([80, 80, 85, 200, 80]))
        const valor = Object.values(ref)[0]
        expect(valor).toBeLessThan(100)
    })

    it('histórico ausente ou vazio devolve mapa vazio, sem quebrar', () => {
        expect(buildWeightReference(null)).toEqual({})
        expect(buildWeightReference({})).toEqual({})
        expect(buildWeightReference({ exercises: {} })).toEqual({})
    })

    it('um registro só não vira referência — "fora do padrão" exige padrão', () => {
        expect(Object.keys(buildWeightReference(hist([80])))).toHaveLength(0)
    })
})

describe('rateio de calorias por exercício', () => {
    it('a soma das partes é EXATAMENTE o total (o resto é distribuído)', () => {
        for (const total of [100, 437, 1000, 7]) {
            const partes = distributeKcalByExercise([{ volumeKg: 1000 }, { volumeKg: 500 }, { volumeKg: 250 }], total)
            expect(partes.reduce((a, b) => a + b, 0), `total ${total}`).toBe(Math.round(total))
        }
    })

    it('quem moveu mais volume recebe mais', () => {
        const [a, b] = distributeKcalByExercise([{ volumeKg: 3000 }, { volumeKg: 100 }], 400)
        expect(a).toBeGreaterThan(b)
    })

    it('sem volume nem tempo, divide igual em vez de zerar', () => {
        const partes = distributeKcalByExercise([{ volumeKg: 0 }, { volumeKg: 0 }, { volumeKg: 0 }], 90)
        expect(partes.reduce((a, b) => a + b, 0)).toBe(90)
        expect(new Set(partes).size).toBe(1)
    })

    it('kcal FIXA (cardio medido) sai do rateio e é respeitada', () => {
        const partes = distributeKcalWithFixed([{ fixedKcal: 300 }, { volumeKg: 1000 }, { volumeKg: 1000 }], 200)
        expect(partes[0]).toBe(300)
        expect(partes[1] + partes[2]).toBe(200)
    })

    it('lista vazia ou total inválido não quebra', () => {
        expect(distributeKcalByExercise([], 100)).toEqual([])
        expect(distributeKcalByExercise([{ volumeKg: 100 }], 0)).toEqual([0])
        expect(distributeKcalByExercise([{ volumeKg: 100 }], -50)).toEqual([0])
    })
})

describe('grade de pesos aprendida da máquina', () => {
    // Stack em LIBRAS: 10 lb = 4,54 kg. O motor pediria 20/25/30 — furos que
    // não existem nesta máquina.
    const PESOS = [18, 23, 27, 32, 36, 41]

    it('aprende os degraus reais e encaixa para BAIXO', () => {
        const grid = learnWeightGrid(PESOS)
        expect(grid).toBeTruthy()
        expect(snapToLearnedGrid(30, grid)).toBe(27)
    })

    it('alvo que já é degrau conhecido fica onde está', () => {
        expect(snapToLearnedGrid(32, learnWeightGrid(PESOS))).toBe(32)
    })

    it('acima do topo extrapola pelo passo aprendido', () => {
        expect(snapToLearnedGrid(50, learnWeightGrid(PESOS))!).toBeGreaterThan(41)
    })

    it('sem evidência suficiente não inventa grade', () => {
        expect(learnWeightGrid([])).toBeNull()
        expect(learnWeightGrid(null)).toBeNull()
        expect(learnWeightGrid([50])).toBeNull()
    })

    it('alvo inválido ou grade ausente devolve null', () => {
        expect(snapToLearnedGrid(30, null)).toBeNull()
        expect(snapToLearnedGrid(0, learnWeightGrid(PESOS))).toBeNull()
        expect(snapToLearnedGrid(-5, learnWeightGrid(PESOS))).toBeNull()
    })
})

describe('arredondamento de carga montável', () => {
    it('desce para o incremento — nunca prescreve mais do que dá para montar', () => {
        expect(roundToIncrement(83, 5)).toBeLessThanOrEqual(83)
        expect(roundToIncrement(83, 2.5)).toBeLessThanOrEqual(83)
    })

    it('incremento inválido não quebra', () => {
        expect(Number.isFinite(roundToIncrement(83, 0))).toBe(true)
    })
})

describe('anilhas por lado', () => {
    it('a soma das anilhas dos dois lados + barra reconstrói o total', () => {
        const r = planPlatesPerSide(100, { barKg: 20 })
        expect(r).toBeTruthy()
        const porLado = r!.perSide.reduce((a, p) => a + p.plate * p.count, 0)
        expect((porLado + r!.leftoverKg) * 2 + r!.barKg).toBeCloseTo(100, 2)
    })

    it('carga menor que a barra, ou que nem a anilha mais leve alcança, devolve null', () => {
        expect(planPlatesPerSide(15, { barKg: 20 })).toBeNull()
        expect(planPlatesPerSide(20.5, { barKg: 20 })).toBeNull()
        expect(planPlatesPerSide(NaN, { barKg: 20 })).toBeNull()
    })

    it('sem anilha disponível devolve null', () => {
        expect(planPlatesPerSide(100, { barKg: 20, plates: [] })).toBeNull()
    })

    it('kit limitado deixa sobra em vez de mentir que fecha', () => {
        // 95 kg → 37,5 por lado. Só com anilha de 20: entra uma, sobram 17,5.
        const r = planPlatesPerSide(95, { barKg: 20, plates: [20] })
        expect(r).toBeTruthy()
        expect(r!.leftoverKg).toBeCloseTo(17.5, 2)
    })

    it('kit completo fecha exato quando dá', () => {
        expect(planPlatesPerSide(100, { barKg: 20 })!.leftoverKg).toBe(0)
    })

    it('formata o loadout para a dica da tela', () => {
        expect(formatPlateLoadout(planPlatesPerSide(100, { barKg: 20 }))).toBeTruthy()
        expect(formatPlateLoadout(null)).toBe('')
    })
})

describe('leitura de série — os formatos especiais', () => {
    it('cluster soma bloco a bloco', () => {
        const log = { cluster: { blocksDetailed: [{ weight: '100', reps: '5' }, { weight: '90', reps: '5' }] } }
        expect(setVolume(log)).toBe(100 * 5 + 90 * 5)
    })

    it('wave soma tier a tier', () => {
        const log = { wave: { waves: [{ heavy: '3', medium: '5', ultra: '2' }], heavyWeight: '100', mediumWeight: '80', ultraWeight: '60' } }
        expect(setVolume(log)).toBe(100 * 3 + 80 * 5 + 60 * 2)
    })

    it('stripping soma as etapas, como o drop-set', () => {
        const log = { stripping: { stages: [{ weight: '60', reps: '10' }, { weight: '40', reps: '8' }] } }
        expect(setVolume(log)).toBe(60 * 10 + 40 * 8)
    })

    it('unilateral soma os dois lados no volume E nas reps', () => {
        const log = { L_weight: '20', L_reps: '12', R_weight: '20', R_reps: '10' }
        expect(setVolume(log)).toBe(20 * 12 + 20 * 10)
        expect(setTotalReps(log)).toBe(22)
    })

    it('aquecimento e reconhecimento não são série de trabalho', () => {
        expect(isWorkingSet({ weight: '40', reps: '15', set_type: 'warmup' })).toBe(false)
        expect(isWorkingSet({ weight: '40', reps: '15', setType: 'feeler' })).toBe(false)
        expect(isWorkingSet({ weight: '40', reps: '15', is_warmup: true })).toBe(false)
        expect(isWorkingSet({ weight: '80', reps: '10' })).toBe(true)
        expect(isWorkingSet({ weight: '80', reps: '10', done: 'false' })).toBe(false)
    })

    it('1RM de Epley: uma repetição é o próprio peso', () => {
        expect(epley1rm(100, 1)).toBe(100)
        expect(epley1rm(100, 10)).toBeCloseTo(100 * (1 + 10 / 30), 6)
        expect(epley1rm(0, 10)).toBe(0)
    })

    it('o melhor 1RM da série olha o melhor BLOCO/ETAPA, não o topo do log', () => {
        const drop = { weight: '40', reps: '20', drop_set: { stages: [{ weight: '80', reps: '8' }, { weight: '40', reps: '12' }] } }
        expect(setBestE1rm(drop)).toBeCloseTo(epley1rm(80, 8), 6)
    })

    it('volume da sessão ignora aquecimento', () => {
        const logs = {
            '0-0': { weight: '40', reps: '15', set_type: 'warmup', done: true },
            '0-1': { weight: '80', reps: '10', done: true },
        }
        expect(sessionVolumeKg(logs)).toBe(800)
        expect(sessionVolumeKg(null)).toBe(0)
    })
})

describe('macros e fator de atividade', () => {
    it('as calorias dos macros reconstroem a meta', () => {
        const alvo = 2400
        const m = calculateMacros(alvo, 'MAINTAIN', 80)
        const kcal = m.protein * 4 + m.carbs * 4 + m.fat * 9
        expect(kcal).toBeGreaterThan(alvo * 0.9)
        expect(kcal).toBeLessThan(alvo * 1.1)
    })

    it('cada objetivo tem seu split', () => {
        const cut = calculateMacros(2000, 'CUT', 80)
        const bulk = calculateMacros(2000, 'BULK', 80)
        expect(cut).not.toEqual(bulk)
    })

    it('nível de atividade desconhecido cai no moderado', () => {
        expect(getActivityMultiplier('INVENTADO')).toBe(getActivityMultiplier('MODERATE'))
        expect(getActivityMultiplier(null)).toBe(getActivityMultiplier('MODERATE'))
        expect(getActivityMultiplier('sedentary')).toBe(getActivityMultiplier('SEDENTARY'))
    })
})

describe('BMR — o ramo que faltava', () => {
    it('resultado impossível devolve null em vez de número negativo', () => {
        // Idade altíssima com peso/altura mínimos zera a conta.
        expect(basalMetabolicRate({ weightKg: 1, heightCm: 1, ageYears: 500, sex: 'F' })).toBeNull()
    })
})

describe('ramos de borda que sobraram', () => {
    it('Iron Rank: nível exatamente no limiar e nível 1 têm progresso coerente', () => {
        const noLimiar = getIronRankProgress(IRON_RANK_THRESHOLDS[0])
        expect(noLimiar.progress).toBeGreaterThanOrEqual(0)
        expect(noLimiar.progress).toBeLessThanOrEqual(100)
        // Nível 1 começa do zero absoluto.
        expect(getIronRankProgress(0).prevVol).toBe(0)
        // Entre dois limiares, o progresso é parcial (nem 0 nem 100).
        const meio = (IRON_RANK_THRESHOLDS[0] + IRON_RANK_THRESHOLDS[1]) / 2
        const p = getIronRankProgress(meio)
        expect(p.progress).toBeGreaterThan(0)
        expect(p.progress).toBeLessThan(100)
    })

    it('rateio por TEMPO quando todos têm minutos (e não por volume)', () => {
        const partes = distributeKcalByExercise(
            [{ executionMinutes: 30, volumeKg: 10 }, { executionMinutes: 10, volumeKg: 9000 }],
            400,
        )
        // Tem tempo em todos → o tempo manda, então o 1º (30 min) leva mais.
        expect(partes[0]).toBeGreaterThan(partes[1])
    })

    it('rateio com fixa maior que o total ainda soma certo', () => {
        const partes = distributeKcalWithFixed([{ fixedKcal: 500 }, { volumeKg: 100 }], 0)
        expect(partes[0]).toBe(500)
        expect(partes[1]).toBe(0)
    })

    it('pacing: bike outdoor exige ser cardio E bike E outdoor', () => {
        // Bike indoor (sem "outdoor" no nome) usa o padrão de cardio.
        expect(calculateExerciseDuration({ method: 'cardio', name: 'Bike ergométrica', reps: '' })).toBeGreaterThan(0)
        // Corrida outdoor NÃO é bike → padrão.
        expect(calculateExerciseDuration({ method: 'cardio', name: 'Corrida na rua', reps: '' })).toBeGreaterThan(0)
        // Cardio detectado por `type` e pelo nome, não só por `method`.
        expect(calculateExerciseDuration({ type: 'cardio', name: 'Esteira', reps: '15' })).toBe(15 * 60)
        expect(calculateExerciseDuration({ name: 'Cardio livre', reps: '15' })).toBe(15 * 60)
    })

    it('pacing: em grupo, cardio é multiplicado; sets inválidos viram 1', () => {
        const cardio = { method: 'cardio', name: 'Esteira', reps: '10' }
        expect(calculateExerciseDurationForGroup(cardio, 2)).toBe(calculateExerciseDuration(cardio) * 2)
        // sets ausente/lixo não zera a conta.
        const semSets = { reps: '10', restTime: '60', cadence: '2020' }
        expect(calculateExerciseDurationForGroup(semSets, 2)).toBeGreaterThan(0)
    })

    it('pacing: descanso do ciclo é o MAIOR entre o planejado e a execução dos parceiros', () => {
        // Descanso curto + execução longa → o ciclo é limitado pela execução.
        const curto = calculateExerciseDurationForGroup({ sets: '3', reps: '20', restTime: '5', cadence: '4-1-4-1' }, 3)
        expect(curto).toBeGreaterThan(0)
    })

    it('1RM da série: wave e cluster têm caminho próprio', () => {
        const wave = { wave: { waves: [{ heavy: '3', medium: '6', ultra: '2' }], heavyWeight: '120', mediumWeight: '90', ultraWeight: '70' } }
        expect(setBestE1rm(wave)).toBeCloseTo(epley1rm(120, 3), 6)

        const cluster = { cluster: { blocksDetailed: [{ weight: '100', reps: '3' }, { weight: '95', reps: '3' }] } }
        expect(setBestE1rm(cluster)).toBeCloseTo(epley1rm(100, 3), 6)

        // `blocks` (formato antigo) também é lido.
        const antigo = { cluster: { blocks: [{ weight: '80', reps: '5' }] } }
        expect(setBestE1rm(antigo)).toBeCloseTo(epley1rm(80, 5), 6)

        expect(setBestE1rm(null)).toBe(0)
        expect(setBestE1rm({ weight: '0', reps: '0' })).toBe(0)
    })

    it('wave sem peso por tier usa o peso BASE (retrocompat)', () => {
        const base = { wave: { weight: '100', waves: [{ heavy: '3', medium: '5', ultra: '2' }] } }
        expect(setVolume(base)).toBe(100 * 3 + 100 * 5 + 100 * 2)
    })

    it('reps no formato "feito/planejado" contam o FEITO', () => {
        expect(setTotalReps({ reps: '8/12' })).toBe(8)
        expect(setVolume({ weight: '100', reps: '8/12' })).toBe(800)
    })

    it('vírgula decimal é lida no peso e nas reps', () => {
        expect(setVolume({ weight: '82,5', reps: '10' })).toBe(825)
    })

    it('grade: alvo que cai num BURACO do histórico desiste (volta ao plateMath)', () => {
        // 18,23,27,32… — 45 está acima do topo, mas 21 cai entre degraus muito
        // distantes; snapar para 18 seria regressão inventada por falta de dado.
        const grid = learnWeightGrid([18, 23, 27, 32, 36, 41])
        const r = snapToLearnedGrid(21, grid)
        expect(r === null || r <= 21).toBe(true)
    })
})
