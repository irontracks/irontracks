import { describe, it, expect } from 'vitest'
import { alternativaDeProteina, familiaDaProteina } from '../alternativaDeProteina'
import { refeicaoComEscolhas } from '../escolhaDaProteina'
import { swapFood, rankSwapOptions, type SwapCandidate } from '../foodSwap'
import { sumTotals, type PlanItem, type PlanMeal } from '../dietPlanShape'

/**
 * A segunda opção de proteína (01/09/2026) — o card oferece "opção: 200 g de carne
 * moída" embaixo do frango, e o usuário escolhe antes de lançar.
 *
 * O caso que dá nome ao arquivo é o do CONTRASTE: para quem come frango todos os
 * dias, o ranking do motor devolve mais frango nas primeiras posições, e oferecer
 * outra ave não responde a pergunta que o usuário está fazendo.
 */

const cand = (
    name: string, kcal: number, protein: number, carbs = 0, fat = 0,
    source: SwapCandidate['source'] = 'database',
): SwapCandidate => ({ name, kcal, protein, carbs, fat, source })

/** O que o usuário JÁ come — vence a base curada no desempate do motor. */
const doRepertorio = (name: string, kcal: number, protein: number, fat = 0): SwapCandidate =>
    cand(name, kcal, protein, 0, fat, 'learned')

/** 180 g de peito de frango — o item do print do relato. */
const PEITO_DE_FRANGO: PlanItem = {
    food: 'Peito de frango', grams: 180, calories: 297, protein: 56, carbs: 0, fat: 7,
}

const ARROZ: PlanItem = {
    food: 'Arroz branco cozido', grams: 250, calories: 325, protein: 8, carbs: 70, fat: 1,
}

describe('família da proteína', () => {
    it('separa os grupos que importam na hora de escolher a carne', () => {
        expect(familiaDaProteina('Peito de frango')).toBe('ave')
        expect(familiaDaProteina('Carne moída')).toBe('bovina')
        expect(familiaDaProteina('Patinho moído')).toBe('bovina')
        expect(familiaDaProteina('Filé de tilápia grelhado')).toBe('peixe')
        expect(familiaDaProteina('Ovos mexidos')).toBe('ovo')
        expect(familiaDaProteina('Whey protein')).toBe('suplemento')
    })

    it('"filé" não decide nada — o corte é que decide', () => {
        // 'file' esteve na lista bovina e jogava "filé de tilápia" para lá: o teste é
        // por token, e o primeiro grupo que casa vence.
        expect(familiaDaProteina('Filé de tilápia')).toBe('peixe')
        expect(familiaDaProteina('Filé de frango')).toBe('ave')
        expect(familiaDaProteina('Filé mignon')).toBe('bovina')
    })

    it('nome que não diz a fonte devolve null em vez de chutar', () => {
        expect(familiaDaProteina('Marmita fitness')).toBeNull()
        expect(familiaDaProteina('')).toBeNull()
    })
})

describe('a opção oferecida embaixo do item', () => {
    it('para FRANGO, oferece carne vermelha — não outra ave', () => {
        // O repertório de quem come frango: as aves lideram o ranking do motor.
        const candidatos = [
            doRepertorio('Coxa de frango', 160, 25, 6),
            doRepertorio('Sobrecoxa de frango', 165, 24, 7),
            cand('Patinho', 133, 27, 0, 3),
        ]
        const alt = alternativaDeProteina(PEITO_DE_FRANGO, candidatos)
        expect(alt?.familia).toBe('bovina')
        expect(alt?.food).toBe('Patinho')
        expect(alt?.grams).toBeGreaterThan(0)
    })

    it('e o motor SOZINHO teria devolvido a ave — é isto que o contraste conserta', () => {
        // A ave está no repertório do usuário e o patinho só na base curada: o
        // desempate por FONTE ("o que ele já come vem primeiro") põe o frango na
        // frente, e é exatamente o caso de quem come frango todo dia.
        const candidatos = [
            doRepertorio('Coxa de frango', 160, 25, 6),
            cand('Patinho', 133, 27, 0, 3),
        ]
        const cego = swapFood(PEITO_DE_FRANGO, candidatos)
        expect(familiaDaProteina(String(cego?.food))).toBe('ave')
    })

    it('a porção é recalculada para manter a proteína do prato', () => {
        const alt = alternativaDeProteina(PEITO_DE_FRANGO, [cand('Carne moída magra', 133, 27, 0, 3)])
        expect(alt?.food).toBe('Carne moída magra')
        // 56 g de proteína a 27 g/100 g ≈ 205 g — a porção acompanha o ALVO, não
        // repete os 180 g do frango.
        expect(alt?.protein).toBeGreaterThan(50)
        expect(alt?.grams).toBeGreaterThan(180)
    })

    it('carne GORDA é recusada contra frango magro — e isso está certo', () => {
        // 56 g de proteína em carne moída comum (212 kcal / 26 P / 11 G) pedem 215 g
        // e entregam 456 kcal no lugar de 297: +53%, acima do teto de desvio do
        // motor. Oferecer isso como "opção" desandaria o dia de quem só queria trocar
        // a carne. O corte magro (patinho) passa, e é o que o card mostra.
        expect(alternativaDeProteina(PEITO_DE_FRANGO, [cand('Carne moída', 212, 26, 0, 11)])).toBeNull()
        expect(alternativaDeProteina(PEITO_DE_FRANGO, [cand('Patinho', 133, 27, 0, 3)])?.food).toBe('Patinho')
    })

    it('item que NÃO é proteína não ganha opção — o card não é catálogo', () => {
        expect(alternativaDeProteina(ARROZ, [cand('Batata doce', 86, 1.3, 20, 0.1)])).toBeNull()
    })

    it('só há alternativa da MESMA família: não oferece nada', () => {
        const alt = alternativaDeProteina(PEITO_DE_FRANGO, [
            doRepertorio('Coxa de frango', 160, 25, 6),
            doRepertorio('Sobrecoxa de frango', 165, 24, 7),
        ])
        expect(alt, 'outra ave no lugar da ave não responde a pergunta do usuário').toBeNull()
    })

    it('sem candidato nenhum: null, como o botão de trocar', () => {
        expect(alternativaDeProteina(PEITO_DE_FRANGO, [])).toBeNull()
    })

    it('sai do MESMO ranking do botão de trocar', () => {
        const candidatos = [cand('Patinho', 133, 27, 0, 3), cand('Coxa de frango', 160, 25, 0, 6)]
        const nomes = rankSwapOptions(PEITO_DE_FRANGO, candidatos).map((o) => o.food)
        const alt = alternativaDeProteina(PEITO_DE_FRANGO, candidatos)
        expect(nomes).toContain(alt?.food)
    })
})

describe('o que vai ser lançado quando a opção é escolhida', () => {
    const meal: PlanMeal = {
        name: 'Almoço',
        items: [ARROZ, PEITO_DE_FRANGO],
        totals: sumTotals([ARROZ, PEITO_DE_FRANGO]),
    }
    const carne: PlanItem = {
        food: 'Carne moída', grams: 215, calories: 456, protein: 56, carbs: 0, fat: 23.7,
    }

    it('sem escolha, a refeição é a mesma (identidade preservada)', () => {
        expect(refeicaoComEscolhas(meal, new Map())).toBe(meal)
    })

    it('com escolha, o item troca e os TOTAIS acompanham', () => {
        const out = refeicaoComEscolhas(meal, new Map([[1, carne]]))
        expect(out.items[1]?.food).toBe('Carne moída')
        expect(out.items[0]?.food).toBe('Arroz branco cozido')
        // 325 + 456 — recomputado dos itens, não ajustado por diferença.
        expect(out.totals.calories).toBe(781)
        expect(out.totals.fat).toBeCloseTo(24.7, 1)
    })

    it('não muda o plano de origem', () => {
        refeicaoComEscolhas(meal, new Map([[1, carne]]))
        expect(meal.items[1]?.food).toBe('Peito de frango')
        expect(meal.totals.calories).toBe(622)
    })
})
