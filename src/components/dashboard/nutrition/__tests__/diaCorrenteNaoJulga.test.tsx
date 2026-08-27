import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'

import NutritionDayScore from '@/components/dashboard/nutrition/NutritionDayScore'

/**
 * O Score julgava um dia que ainda não tinha acabado.
 *
 * Às 9h da manhã, com o café lançado, a adesão à meta é naturalmente baixa: o
 * componente caía na faixa mais baixa da escala e exibia "Melhorar" em
 * VERMELHO — a cor de erro do app. A pessoa abria a aba de manhã e a primeira
 * coisa que lia era que estava mal, num dia em que ela ainda vai almoçar.
 *
 * Um número que só faz sentido no fechamento, exibido como veredicto durante o
 * percurso, não informa — desmotiva justamente quando o app deveria ajudar.
 *
 * Em dia corrente o mesmo número vira PROGRESSO: sem rótulo de qualidade e sem
 * cor semântica. O veredicto volta quando o dia fecha.
 */

const parciais = { totals: { calories: 400, protein: 30, carbs: 40, fat: 12 },
                   goals:  { calories: 2500, protein: 180, carbs: 280, fat: 70 } }

afterEach(cleanup)

describe('dia em andamento não recebe nota', () => {
    it('sem o dia encerrado, não há rótulo de qualidade', () => {
        render(<NutritionDayScore {...parciais} diaEncerrado={false} />)
        const botao = screen.getByRole('button')
        expect(botao.textContent).toMatch(/dia em andamento/)
        for (const veredicto of ['Melhorar', 'Regular', 'Bom', 'Ótimo', 'Excelente']) {
            expect(botao.textContent, `"${veredicto}" é veredicto de dia fechado`).not.toContain(veredicto)
        }
    })

    it('sem o dia encerrado, não usa cor semântica', () => {
        render(<NutritionDayScore {...parciais} diaEncerrado={false} />)
        const classe = screen.getByRole('button').className
        // Vermelho é a cor de ERRO. Verde/lima/amarelo/laranja são o veredicto.
        expect(classe).not.toMatch(/bg-(red|orange|yellow|lime|green)-/)
        expect(classe).toMatch(/bg-neutral-/)
    })

    it('com o dia fechado, o veredicto volta', () => {
        render(<NutritionDayScore {...parciais} diaEncerrado />)
        const botao = screen.getByRole('button')
        expect(botao.textContent).toMatch(/Score \d+\/100/)
        expect(botao.textContent).not.toMatch(/dia em andamento/)
        expect(botao.className).toMatch(/bg-(red|orange|yellow|lime|green)-/)
    })

    /**
     * O default é `true` para não mudar o comportamento de quem já chamava sem
     * a prop — o que muda é quem SABE a data. A fiação é o que importa: sem
     * ela, o componente continua julgando o dia de hoje e nenhum caso acima
     * pega isso.
     */
    it('o Mixer passa o estado do dia — a fiação, não só a prop', () => {
        const mixer = readFileSync(join(__dirname, '..', 'NutritionMixer.tsx'), 'utf8')
        expect(mixer).toMatch(/<NutritionDayScore[^>]*diaEncerrado=\{!isToday\}/)
    })
})

describe('a navegação de dia para no presente', () => {
    const nav = readFileSync(join(__dirname, '..', 'DateNavigator.tsx'), 'utf8')

    it('a seta de próximo dia é desabilitada em HOJE', () => {
        // Era `currentDate > todayDate`: em hoje isso é falso, a seta ficava
        // ativa e levava para amanhã — um dia cujo estado vazio afirma que a
        // pessoa não comeu.
        expect(nav).toMatch(/currentDate >= todayDate/)
        expect(nav.replace(/`[^`]*`/g, ''), 'o > sozinho deixa hoje passar').not.toMatch(/currentDate > todayDate/)
        expect(nav).toMatch(/disabled=\{semProximoDia\}/)
    })
})
