import { describe, it, expect } from 'vitest'
import { estimateCardioKcal } from '../cardioKcal'

/**
 * Cardio em BLOCOS: "30 min de esteira" pode ser 5 min a 4 km/h + 10 a 5 + 15 a
 * 6. Cada bloco tem a própria velocidade, e a caloria precisa refletir isso.
 *
 * Até 04/09/2026 a esteira usava um MET fixo por modalidade escalado pelo RPE —
 * caminhar a 4 e correr a 10 davam o MESMO gasto, e a inclinação (coletada
 * desde sempre) não entrava em conta nenhuma.
 */
const sessao = (logs: Record<string, unknown>) => ({
    exercises: [{ name: 'Esteira', method: 'Cardio', rpe: 5 }],
    logs,
})
const kcal = (logs: Record<string, unknown>) =>
    estimateCardioKcal(sessao(logs), { bodyWeightKg: 80 }).totalKcal

describe('a velocidade de cada bloco entra na conta', () => {
    it('blocos mais rápidos gastam mais que o mesmo tempo devagar', () => {
        const devagar = kcal({ '0-0': { done: true, durationSeconds: 30 * 60, speed: 4 } })
        const subindo = kcal({
            '0-0': { done: true, durationSeconds: 5 * 60, speed: 4 },
            '0-1': { done: true, durationSeconds: 10 * 60, speed: 5 },
            '0-2': { done: true, durationSeconds: 15 * 60, speed: 6 },
        })
        expect(subindo).toBeGreaterThan(devagar)
    })

    it('correr 30 min gasta MUITO mais que caminhar 30 min — o defeito antigo', () => {
        const caminhada = kcal({ '0-0': { done: true, durationSeconds: 30 * 60, speed: 4 } })
        const corrida = kcal({ '0-0': { done: true, durationSeconds: 30 * 60, speed: 11 } })
        expect(corrida).toBeGreaterThan(caminhada * 2.5)
    })

    it('inclinação pesa — 8% quase dobra a caminhada', () => {
        const plano = kcal({ '0-0': { done: true, durationSeconds: 30 * 60, speed: 5 } })
        const subida = kcal({ '0-0': { done: true, durationSeconds: 30 * 60, speed: 5, incline: 8 } })
        expect(subida).toBeGreaterThan(plano * 1.7)
    })
})

describe('nada do histórico muda', () => {
    /**
     * ⚠️ Retrocompatibilidade é o ponto mais sensível aqui: TODA sessão anterior
     * a esta data não tem `speed` no log. Se elas mudassem de valor, o histórico
     * de calorias de todo mundo seria reescrito por baixo dos panos — e esse
     * número é lido por quem acompanha dieta.
     */
    it('bloco sem velocidade segue na tabela por modalidade', () => {
        const semVel = kcal({ '0-0': { done: true, durationSeconds: 30 * 60 } })
        // Valor da tabela antiga (esteira 6.0 MET × RPE 5), inalterado.
        expect(semVel).toBeGreaterThan(200)
        expect(semVel).toBeLessThan(280)
    })

    it('exercício sem série concluída continua valendo ZERO', () => {
        // Regra que já existia: plano não é execução.
        expect(kcal({ '0-0': { done: false, durationSeconds: 30 * 60, speed: 5 } })).toBe(0)
    })

    it('blocos mistos aproveitam o dado bom de cada um', () => {
        // Um bloco preenchido e outro não: o preenchido usa ACSM, o outro cai na
        // modalidade. Descartar tudo por causa de um branco perderia dado real.
        const misto = kcal({
            '0-0': { done: true, durationSeconds: 10 * 60, speed: 5 },
            '0-1': { done: true, durationSeconds: 10 * 60 },
        })
        expect(misto).toBeGreaterThan(0)
    })
})
