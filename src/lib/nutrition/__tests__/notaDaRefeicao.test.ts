import { describe, it, expect } from 'vitest'
import { planDays, MAX_NOTA_DA_REFEICAO } from '../dietPlanShape'

/**
 * A observação da refeição sobrevive à leitura — e, por consequência, à troca
 * de alimento.
 *
 * ⚠️ `parseMeal` RECONSTRÓI a refeição campo a campo, então tudo que ele não
 * declara é descartado. E a rota de swap regrava o plano a partir do que
 * `planDays` devolveu: sem preservar aqui, trocar um alimento apagaria a nota
 * da refeição em silêncio. É a mesma classe de "duas metades corretas que
 * discordam na fronteira" que já custou três bugs neste repo.
 */

const item = { food: 'Frango', grams: 200, calories: 330, protein: 62, carbs: 0, fat: 0 }
const planoCom = (note?: unknown) => ({
    plan_kind: 'day',
    meals: [{ name: 'Almoço', items: [item], ...(note === undefined ? {} : { note }) }],
    days: null,
})

describe('nota da refeição', () => {
    it('sobrevive à leitura canônica', () => {
        expect(planDays(planoCom('bater no liquidificador'))[0].meals[0].note)
            .toBe('bater no liquidificador')
    })

    it('sobrevive ao CICLO da troca de alimento — ler, regravar, ler de novo', () => {
        // É exatamente o que a rota de swap faz: planDays → remonta `meals` →
        // grava → a próxima leitura passa por planDays outra vez.
        const primeira = planDays(planoCom('trocar por atum'))
        const regravado = { plan_kind: 'day', meals: primeira[0].meals, days: null }
        expect(planDays(regravado)[0].meals[0].note).toBe('trocar por atum')
    })

    it('vale também no plano de SEMANA, que é o formato do caso real', () => {
        const semana = {
            plan_kind: 'week',
            meals: [],
            days: [{ weekday: 1, meals: [{ name: 'Pré-treino', items: [item], note: 'só se treinar cedo' }] }],
        }
        const lido = planDays(semana)
        expect(lido[0].meals[0].note).toBe('só se treinar cedo')
        // e o ciclo de regravação da semana também preserva
        const regravado = { plan_kind: 'week', meals: [], days: [{ weekday: 1, meals: lido[0].meals }] }
        expect(planDays(regravado)[0].meals[0].note).toBe('só se treinar cedo')
    })

    it('nota ausente ou vazia não vira chave no JSON', () => {
        // 42 refeições numa semana: `note: ""` em todas seria peso morto no
        // payload, que este repo já teve de enxugar uma vez.
        expect('note' in planDays(planoCom())[0].meals[0]).toBe(false)
        expect('note' in planDays(planoCom(''))[0].meals[0]).toBe(false)
        expect('note' in planDays(planoCom('   '))[0].meals[0]).toBe(false)
    })

    it('texto gigante é cortado no teto declarado', () => {
        const nota = planDays(planoCom('a'.repeat(MAX_NOTA_DA_REFEICAO + 500)))[0].meals[0].note
        expect(nota).toHaveLength(MAX_NOTA_DA_REFEICAO)
    })

    it('lixo no lugar do texto não quebra a leitura do plano', () => {
        for (const lixo of [42, null, { a: 1 }, ['x']]) {
            const meal = planDays(planoCom(lixo))[0]?.meals[0]
            expect(meal?.name, `plano quebrou com note=${JSON.stringify(lixo)}`).toBe('Almoço')
        }
    })
})
