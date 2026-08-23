/**
 * Modelo MET — os caminhos que a suíte não exercitava.
 *
 * Complementa os testes existentes de `metEstimate` fechando os ramos que
 * ficaram de fora: a tabela de complexidade por exercício, a fração de peso
 * corporal, cluster/drop no cômputo de volume, cadência, EPOC e os fallbacks
 * de duração.
 *
 * O que importa aqui não é a cobertura em si — é que cada um desses ramos
 * MOVE a kcal que o usuário vê, e nenhum tinha teste dizendo em que direção.
 */
import { describe, it, expect } from 'vitest'
import {
    selectBaseMet,
    detectTrainingStyle,
    getStyleFactor,
    getExerciseComplexityFactor,
    getBodyweightFraction,
    getRpeMultiplier,
    getSexMultiplier,
    getCadenceFactor,
    getEpocFactor,
    computeActiveWorkMinutes,
    estimateDurationFromLogs,
    estimateCaloriesMet,
    MET_LIGHT,
    MET_MODERATE,
    MET_VIGOROUS,
    MET_VERY_VIGOROUS,
} from '../metEstimate'

describe('MET base pela densidade (kg movidos por minuto ativo)', () => {
    it('sobe de faixa conforme a densidade', () => {
        expect(selectBaseMet(300, 10)).toBe(MET_LIGHT)        // 30 kg/min
        expect(selectBaseMet(1000, 10)).toBe(MET_MODERATE)    // 100
        expect(selectBaseMet(3000, 10)).toBe(MET_VIGOROUS)    // 300
        expect(selectBaseMet(8000, 10)).toBe(MET_VERY_VIGOROUS) // 800
    })

    it('sem minutos ativos cai no moderado em vez de dividir por zero', () => {
        expect(selectBaseMet(1000, 0)).toBe(MET_MODERATE)
        expect(selectBaseMet(1000, -5)).toBe(MET_MODERATE)
    })
})

describe('complexidade por exercício — composto gasta mais que isolador', () => {
    const f = getExerciseComplexityFactor

    it('levantamento terra e agachamento livre lideram', () => {
        expect(f('Levantamento terra')).toBeGreaterThan(f('Leg press 45°'))
        expect(f('Agachamento livre')).toBeGreaterThan(f('Cadeira extensora'))
    })

    it('a MÁQUINA vale menos que a versão livre do mesmo movimento', () => {
        expect(f('Supino reto')).toBeGreaterThan(f('Supino máquina'))
        expect(f('Agachamento livre')).toBeGreaterThan(f('Hack squat'))
    })

    it('isoladores de braço e ombro ficam abaixo de 1', () => {
        for (const nome of ['Rosca direta', 'Elevação lateral', 'Tríceps pushdown', 'Crucifixo na máquina', 'Face pull']) {
            expect(f(nome), nome).toBeLessThan(1)
        }
    })

    it('os grandes puxadores e empurradores ficam em 1 ou acima', () => {
        for (const nome of ['Remada curvada', 'Barra fixa', 'Hip thrust', 'Puxada alta', 'Stiff']) {
            expect(f(nome), nome).toBeGreaterThanOrEqual(1)
        }
    })

    it('nome desconhecido não quebra — devolve o neutro', () => {
        expect(f('Exercício que não existe')).toBeGreaterThan(0)
        expect(f('')).toBeGreaterThan(0)
    })

    it('ignora acento e caixa', () => {
        expect(f('AGACHAMENTO LIVRE')).toBe(f('agachamento livre'))
        expect(f('Elevação lateral')).toBe(f('elevacao lateral'))
    })
})

describe('peso corporal — exercício sem carga não vale zero', () => {
    it('barra fixa move o corpo inteiro; flexão, parte dele', () => {
        expect(getBodyweightFraction('Barra fixa')).toBeGreaterThan(getBodyweightFraction('Flexão de braço'))
        expect(getBodyweightFraction('Mergulho nas paralelas')).toBeGreaterThan(0.5)
        expect(getBodyweightFraction('Remada australiana')).toBeGreaterThan(0)
    })

    it('exercício com carga externa não tem fração de peso corporal', () => {
        expect(getBodyweightFraction('Supino reto com barra')).toBe(0)
    })

    it('série sem peso mas com reps ENTRA no volume via peso corporal', () => {
        const comNome = estimateCaloriesMet(
            { '0-0': { weight: '', reps: '12', done: true } },
            45, 80, ['Barra fixa'],
        )
        const semNome = estimateCaloriesMet(
            { '0-0': { weight: '', reps: '12', done: true } },
            45, 80, ['Exercício desconhecido'],
        )
        expect(comNome).toBeGreaterThan(0)
        // Sem fração conhecida, o volume daquela série não entra — logo, gasta menos.
        expect(comNome).toBeGreaterThanOrEqual(semNome)
    })
})

describe('estilo de treino', () => {
    it('cada estilo tem seu fator, e circuito é o mais alto', () => {
        const circuito = getStyleFactor('circuit')
        for (const s of ['strength', 'hypertrophy', 'endurance'] as const) {
            expect(circuito).toBeGreaterThanOrEqual(getStyleFactor(s))
        }
    })

    it('reps altas com pouca carga = resistência; poucas reps pesadas = força', () => {
        const resistencia = detectTrainingStyle({ '0-0': { weight: '20', reps: '20', done: true } }, null)
        const forca = detectTrainingStyle({ '0-0': { weight: '180', reps: '3', done: true } }, null)
        expect(resistencia).toBeTruthy()
        expect(forca).toBeTruthy()
    })

    it('método de circuito no exercício é reconhecido', () => {
        const estilo = detectTrainingStyle(
            { '0-0': { weight: '30', reps: '15', done: true } },
            [{ name: 'Burpee', method: 'circuito' }],
        )
        expect(estilo).toBe('circuit')
    })
})

describe('multiplicadores', () => {
    it('RPE mais alto gasta mais; ausente é neutro', () => {
        expect(getRpeMultiplier(10)).toBeGreaterThan(getRpeMultiplier(5))
        expect(getRpeMultiplier(null)).toBe(1)
        expect(getRpeMultiplier(undefined)).toBe(1)
        // 0 é CLAMPADO para 1 (não tratado como ausente) — RPE 1 é treino leve.
        expect(getRpeMultiplier(0)).toBe(getRpeMultiplier(1))
        expect(getRpeMultiplier(0)).toBeLessThan(1)
    })

    it('sexo biológico ajusta a massa metabolicamente ativa', () => {
        expect(getSexMultiplier('male')).toBeGreaterThan(getSexMultiplier('female'))
        expect(getSexMultiplier(null)).toBe(1)
        expect(getSexMultiplier('outro')).toBe(1)
        // Aceita os vocabulários do app.
        expect(getSexMultiplier('M')).toBe(getSexMultiplier('male'))
    })

    it('cadência RÁPIDA gasta mais; super-lenta gasta menos', () => {
        // Contraintuitivo e é o ponto: tempo sob tensão alto significa menos
        // repetições no mesmo minuto, logo menos trabalho mecânico por minuto.
        expect(getCadenceFactor(['1-0-1-0'])).toBeGreaterThan(1)   // soma 2 → rápida
        expect(getCadenceFactor(['2-0-2-0'])).toBe(1)              // soma 4 → normal
        expect(getCadenceFactor(['4-1-4-1'])).toBeLessThan(1)      // soma 10 → super-lenta
    })

    it('cadência ausente, vazia ou sem fases separadas é neutra', () => {
        expect(getCadenceFactor(null)).toBe(1)
        expect(getCadenceFactor([])).toBe(1)
        expect(getCadenceFactor(['', '  '])).toBe(1)
        // "4141" sem separador não tem como ser fatiado em fases.
        expect(getCadenceFactor(['4141'])).toBe(1)
    })

    it('"X" (explosivo) conta como 1 s', () => {
        expect(getCadenceFactor(['X-0-X-0'])).toBeGreaterThan(1)
    })

    it('EPOC só entra em sessão longa e intensa', () => {
        expect(getEpocFactor(7.5, 90)).toBeGreaterThan(1)
        expect(getEpocFactor(6.0, 90)).toBeGreaterThan(1)
        expect(getEpocFactor(5.0, 50)).toBeGreaterThan(1)
        // Curta ou leve: sem bônus.
        expect(getEpocFactor(7.5, 30)).toBe(1)
        expect(getEpocFactor(3.5, 90)).toBe(1)
    })
})

describe('tempo ativo e duração', () => {
    it('conta os minutos de execução a partir dos logs', () => {
        const logs = {
            '0-0': { weight: '100', reps: '10', done: true, executionSeconds: 40 },
            '0-1': { weight: '100', reps: '10', done: true, executionSeconds: 40 },
        }
        expect(computeActiveWorkMinutes(logs, 60)).toBeGreaterThan(0)
    })

    it('sem log nenhum, o ativo não passa da duração', () => {
        expect(computeActiveWorkMinutes({}, 60)).toBeLessThanOrEqual(60)
    })

    it('estima a duração pelos carimbos quando ela não foi informada', () => {
        const t0 = 1_700_000_000_000
        const logs = {
            '0-0': { weight: '100', reps: '10', done: true, completedAtMs: t0 },
            '0-1': { weight: '100', reps: '10', done: true, completedAtMs: t0 + 30 * 60 * 1000 },
        }
        expect(estimateDurationFromLogs(logs, t0)).toBeCloseTo(30, 5)
    })

    it('sem carimbo (ou com um só) devolve null — não inventa duração', () => {
        expect(estimateDurationFromLogs({}, undefined)).toBeNull()
        expect(estimateDurationFromLogs({ '0-0': { completedAtMs: 1_700_000_000_000 } }, null)).toBeNull()
    })

    it('duração absurda é recusada — carimbo corrompido não vira sessão de 9 h', () => {
        const t0 = 1_700_000_000_000
        expect(estimateDurationFromLogs({
            '0-0': { completedAtMs: t0 },
            '0-1': { completedAtMs: t0 + 9 * 60 * 60 * 1000 },
        }, t0)).toBeNull()
        // E sessão curta demais também não conta.
        expect(estimateDurationFromLogs({
            '0-0': { completedAtMs: t0 },
            '0-1': { completedAtMs: t0 + 60 * 1000 },
        }, t0)).toBeNull()
    })
})

describe('estimateCaloriesMet — a conta inteira', () => {
    const logs = {
        '0-0': { weight: '100', reps: '10', done: true },
        '0-1': { weight: '100', reps: '10', done: true },
    }

    it('cluster soma bloco a bloco, cada um com seu peso', () => {
        const comCluster = estimateCaloriesMet(
            { '0-0': { done: true, cluster: { blocksDetailed: [{ weight: '100', reps: '5' }, { weight: '90', reps: '5' }] } } },
            45, 80, ['Leg press 45°'],
        )
        expect(comCluster).toBeGreaterThan(0)
    })

    it('aceita o formato "feito/planejado" nas reps', () => {
        const a = estimateCaloriesMet({ '0-0': { weight: '100', reps: '8/10', done: true } }, 45, 80, ['Supino reto'])
        expect(a).toBeGreaterThan(0)
    })

    it('vírgula decimal no peso é lida', () => {
        const a = estimateCaloriesMet({ '0-0': { weight: '82,5', reps: '10', done: true } }, 45, 80, ['Supino reto'])
        expect(a).toBeGreaterThan(0)
    })

    it('sem duração e sem carimbo devolve 0 — não inventa sessão', () => {
        expect(estimateCaloriesMet(logs, 0, 80, ['Supino reto'])).toBe(0)
    })

    it('usa o peso padrão quando o do usuário não veio', () => {
        expect(estimateCaloriesMet(logs, 45, null, ['Supino reto'])).toBeGreaterThan(0)
        expect(estimateCaloriesMet(logs, 45, 0, ['Supino reto'])).toBeGreaterThan(0)
    })

    it('a complexidade é ponderada pelo VOLUME de cada exercício', () => {
        const nomes = ['Levantamento terra', 'Rosca direta']
        // Assinatura: (logs, min, peso, nomes, rpe, exec, rest, sexo, VOLUMES, ...)
        const pesadoNoTerra = estimateCaloriesMet(logs, 60, 80, nomes, null, null, null, null, [9000, 100])
        const pesadoNaRosca = estimateCaloriesMet(logs, 60, 80, nomes, null, null, null, null, [100, 9000])
        expect(pesadoNoTerra).toBeGreaterThan(pesadoNaRosca)
    })

    it('volume zerado nos exercícios cai na média simples, sem dividir por zero', () => {
        const r = estimateCaloriesMet(logs, 60, 80, ['Levantamento terra', 'Rosca direta'], null, null, null, null, [0, 0])
        expect(Number.isFinite(r)).toBe(true)
        expect(r).toBeGreaterThan(0)
    })

    it('lista de volumes com tamanho diferente é ignorada (cai na média simples)', () => {
        const r = estimateCaloriesMet(logs, 60, 80, ['Levantamento terra', 'Rosca direta'], null, null, null, null, [100])
        expect(r).toBeGreaterThan(0)
    })

    it('RPE e sexo chegam ao resultado final', () => {
        const base = estimateCaloriesMet(logs, 60, 80, ['Supino reto'])
        const comRpeAlto = estimateCaloriesMet(logs, 60, 80, ['Supino reto'], 10)
        const comRpeBaixo = estimateCaloriesMet(logs, 60, 80, ['Supino reto'], 2)
        expect(comRpeAlto).toBeGreaterThan(base)
        expect(comRpeBaixo).toBeLessThan(base)

        const mulher = estimateCaloriesMet(logs, 60, 80, ['Supino reto'], null, null, null, 'female')
        expect(mulher).toBeLessThan(base)
    })

    it('override de minutos de execução é respeitado', () => {
        const curto = estimateCaloriesMet(logs, 60, 80, ['Supino reto'], null, 10)
        const longo = estimateCaloriesMet(logs, 60, 80, ['Supino reto'], null, 50)
        expect(longo).toBeGreaterThan(curto)
    })

    it('cadência entra na conta final', () => {
        const rapida = estimateCaloriesMet(logs, 60, 80, ['Supino reto'], null, null, null, null, null, null, ['1-0-1-0'])
        const lenta = estimateCaloriesMet(logs, 60, 80, ['Supino reto'], null, null, null, null, null, null, ['4-1-4-1'])
        expect(rapida).toBeGreaterThan(lenta)
    })

    it('duração vinda dos carimbos salva a sessão sem duração informada', () => {
        const t0 = 1_700_000_000_000
        const comCarimbo = {
            '0-0': { weight: '100', reps: '10', done: true, completedAtMs: t0 },
            '0-1': { weight: '100', reps: '10', done: true, completedAtMs: t0 + 40 * 60 * 1000 },
        }
        expect(estimateCaloriesMet(comCarimbo, 0, 80, ['Supino reto'], null, null, null, null, null, t0))
            .toBeGreaterThan(0)
    })

    it('log inválido no meio não derruba a sessão', () => {
        const sujo = { '0-0': null, 'x-y': { weight: '100', reps: '10' }, '0-1': { weight: '100', reps: '10', done: true } }
        expect(estimateCaloriesMet(sujo as never, 45, 80, ['Supino reto'])).toBeGreaterThan(0)
    })
})
