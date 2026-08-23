/**
 * O %BF "combinado" — o número que vai para o histórico, os gráficos e o PDF.
 *
 * Fecha o buraco de cobertura achado ao responder "essa área está 100%?":
 * `bodyComposition.ts` estava em 45% de linhas e `assessmentPairing.ts` em 0%,
 * apesar de produzirem o valor que o usuário vê. Não havia bug — mas função sem
 * teste que devolve número de saúde é o tipo de coisa que se "conserta" errado.
 *
 * A sutileza que este arquivo existe para proteger: `buildBodyFatBreakdown`
 * filtra com `isValidPercent` (0–100) e `combinedBodyFat` refiltra com
 * `isPlausibleBodyFat` (3–75). **A divergência é deliberada** — um BIA digitado
 * como "90" por erro de vírgula PRECISA aparecer na tela (senão o usuário não
 * descobre que errou) e NÃO pode entrar na média (senão distorce massa
 * magra/gorda). Unificar os dois predicados "por consistência" quebraria uma
 * das duas metades, em silêncio.
 */
import { describe, it, expect } from 'vitest'
import {
    combinedBodyFat,
    buildBodyFatBreakdown,
    isPlausibleBodyFat,
    PLAUSIBLE_BF_MIN,
    PLAUSIBLE_BF_MAX,
    classifyBMI,
    classifyBodyFat,
    calculateFatMass,
    calculateLeanMass,
} from '../bodyComposition'
import { daysBetween, PAIRING_WINDOW_DAYS } from '../assessmentPairing'

describe('combinedBodyFat', () => {
    it('com os dois métodos, faz a média simples', () => {
        expect(combinedBodyFat(16, 20)).toBe(18)
    })

    it('com um só, devolve esse', () => {
        expect(combinedBodyFat(16, null)).toBe(16)
        expect(combinedBodyFat(null, 20)).toBe(20)
        expect(combinedBodyFat(null, null)).toBeNull()
    })

    it('valor implausível NÃO entra na média — erro de vírgula não vira laudo', () => {
        // BIA digitada como "90" em vez de "9,0".
        expect(combinedBodyFat(16, 90)).toBe(16)
        // Campo zerado por engano.
        expect(combinedBodyFat(16, 0)).toBe(16)
        // Os dois implausíveis → nada.
        expect(combinedBodyFat(0, 95)).toBeNull()
    })

    it('as bordas da faixa plausível contam', () => {
        expect(isPlausibleBodyFat(PLAUSIBLE_BF_MIN)).toBe(true)
        expect(isPlausibleBodyFat(PLAUSIBLE_BF_MAX)).toBe(true)
        expect(isPlausibleBodyFat(PLAUSIBLE_BF_MIN - 0.1)).toBe(false)
        expect(isPlausibleBodyFat(PLAUSIBLE_BF_MAX + 0.1)).toBe(false)
        // Obesidade extrema real (BIA superestima em alta adiposidade) tem que passar.
        expect(isPlausibleBodyFat(62)).toBe(true)
    })
})

describe('buildBodyFatBreakdown — o implausível aparece, mas não conta', () => {
    it('mostra o valor errado ao usuário E o exclui da média', () => {
        const r = buildBodyFatBreakdown(16, 90)
        // Precisa aparecer: é assim que a pessoa descobre que digitou errado.
        expect(r.bia).toBe(90)
        expect(r.skinfold).toBe(16)
        // E não pode contaminar o número canônico.
        expect(r.combined).toBe(16)
    })

    it('fora de 0–100 nem aparece', () => {
        expect(buildBodyFatBreakdown(16, 130).bia).toBeNull()
        expect(buildBodyFatBreakdown(16, -5).bia).toBeNull()
    })

    it('sem nenhum método, tudo nulo', () => {
        expect(buildBodyFatBreakdown(null, null)).toEqual({ skinfold: null, bia: null, combined: null })
    })
})

describe('massa gorda e magra fecham com o peso', () => {
    it('as duas somam o peso total', () => {
        const peso = 80
        const gorda = calculateFatMass(peso, 20)
        const magra = calculateLeanMass(peso, gorda)
        expect(gorda).toBe(16)
        expect(magra).toBe(64)
        expect(gorda + magra).toBeCloseTo(peso, 10)
    })

    it('recusa entrada inconsistente em vez de devolver negativo', () => {
        expect(() => calculateLeanMass(80, 90)).toThrow()
        expect(() => calculateFatMass(0, 20)).toThrow()
    })
})

describe('classificações exibidas', () => {
    it('IMC segue os cortes da OMS', () => {
        expect(classifyBMI(18.4)).toBe('Abaixo do peso')
        expect(classifyBMI(18.5)).toBe('Peso normal')
        expect(classifyBMI(24.9)).toBe('Peso normal')
        expect(classifyBMI(25)).toBe('Sobrepeso')
        expect(classifyBMI(30)).toBe('Obesidade grau I')
        expect(classifyBMI(35)).toBe('Obesidade grau II')
        expect(classifyBMI(40)).toBe('Obesidade grau III')
    })

    it('%BF classifica por sexo — a mesma gordura não significa o mesmo nos dois', () => {
        // 15% aos 35: "Ideal" no homem, "Muito baixo" na mulher.
        expect(classifyBodyFat(15, 'M', 35)).toBe('Ideal')
        expect(classifyBodyFat(15, 'F', 35)).toBe('Muito baixo')
    })

    it('as três faixas etárias têm cortes próprios — envelhecer move a régua', () => {
        // O MESMO %BF muda de rótulo conforme a idade: 12% é "Ideal" aos 25,
        // "Baixo" aos 35 e "Muito baixo" aos 45. Tabela de referência, não opinião.
        expect(classifyBodyFat(12, 'M', 25)).toBe('Ideal')
        expect(classifyBodyFat(12, 'M', 35)).toBe('Baixo')
        expect(classifyBodyFat(12, 'M', 45)).toBe('Muito baixo')
        expect(classifyBodyFat(20, 'F', 25)).toBe('Ideal')
        expect(classifyBodyFat(20, 'F', 35)).toBe('Baixo')
        expect(classifyBodyFat(20, 'F', 45)).toBe('Baixo')
    })

    it('cobre as cinco faixas nos dois sexos, nas três idades', () => {
        const esperado = ['Muito baixo', 'Baixo', 'Ideal', 'Elevado', 'Muito elevado']
        for (const sexo of ['M', 'F'] as const) {
            for (const idade of [25, 35, 45]) {
                const vistos = new Set<string>()
                for (let bf = 3; bf <= 60; bf += 0.5) vistos.add(classifyBodyFat(bf, sexo, idade))
                expect([...vistos].sort(), `${sexo}/${idade}`).toEqual([...esperado].sort())
            }
        }
    })

    it('as fronteiras são exclusivas — o valor do corte já é a faixa de cima', () => {
        // Homem 30–39: < 15 é "Baixo", 15 exato já é "Ideal".
        expect(classifyBodyFat(14.9, 'M', 35)).toBe('Baixo')
        expect(classifyBodyFat(15, 'M', 35)).toBe('Ideal')
    })
})

describe('pareamento BIA ↔ dobras', () => {
    it('mede a distância em dias, sem sinal', () => {
        expect(daysBetween('2026-08-20T12:00:00Z', '2026-08-18T12:00:00Z')).toBe(2)
        // Simétrico: a ordem não muda a distância.
        expect(daysBetween('2026-08-18T12:00:00Z', '2026-08-20T12:00:00Z')).toBe(2)
    })

    it('data ilegível fica INFINITAMENTE longe — nunca pareia por acidente', () => {
        expect(daysBetween('nao-e-data', '2026-08-18T12:00:00Z')).toBe(Number.POSITIVE_INFINITY)
    })

    it('a janela de pareamento é de 14 dias', () => {
        expect(PAIRING_WINDOW_DAYS).toBe(14)
        expect(daysBetween('2026-08-20T12:00:00Z', '2026-08-06T12:00:00Z')).toBe(PAIRING_WINDOW_DAYS)
    })
})
