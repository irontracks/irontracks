/**
 * As ações do story precisam ser alcançáveis nos QUATRO composers.
 *
 * Relato do Diogo (01/09/2026): "não consigo mudar o template nem salvar". A
 * causa medida é que POSTAR/BAIXAR ficavam abaixo da dobra, e a prévia — que
 * ocupa quase a tela e captura o arraste para mover o card — não deixa rolar a
 * página.
 *
 * ⚠️ A primeira correção alcançou UM dos quatro caminhos. São DOIS painéis
 * servindo os quatro composers (`StoryControlPanel` para treino,
 * `NutritionStoryControlPanel` para nutrição, cardio e métricas), e eu tratei
 * só o primeiro — três de quatro continuaram com o defeito, e o PR dizia "os
 * quatro". Este guard existe para que a próxima mudança nas ações não escolha
 * um painel de novo.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PAINEIS = [
    'src/components/stories/StoryControlPanel.tsx',
    'src/components/stories/NutritionStoryControlPanel.tsx',
]

const COMPOSERS: Array<[string, string]> = [
    ['src/components/StoryComposer.tsx', 'StoryControlPanel'],
    ['src/components/NutritionStoryComposer.tsx', 'NutritionStoryControlPanel'],
    ['src/components/CardioStoryComposer.tsx', 'NutritionStoryControlPanel'],
    ['src/components/MetricsStoryComposer.tsx', 'NutritionStoryControlPanel'],
]

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('barra de ações fixa no rodapé (mobile)', () => {
    it.each(PAINEIS)('%s prende as ações no rodapé', (painel) => {
        const código = ler(painel)
        // `max-lg:fixed` + ancorado no rodapé. Sem isto as ações voltam para o
        // fim de uma coluna que o usuário não alcança rolando.
        expect(código).toMatch(/max-lg:fixed/)
        expect(código).toMatch(/max-lg:bottom-0/)
    })

    it.each(PAINEIS)('%s mede onde a barra caiu de verdade', (painel) => {
        // A instrumentação é o que substitui o chute enquanto o caso do
        // aparelho real não fecha. Some quando a causa estiver provada.
        expect(ler(painel)).toMatch(/useMedirPosicaoDasAcoes\s*\(/)
    })

    it.each(COMPOSERS)('%s usa um painel que tem as ações no rodapé', (composer, painel) => {
        expect(ler(composer)).toContain(painel)
        expect(PAINEIS.some((p) => p.endsWith(`${painel}.tsx`)), `${painel} não está na lista coberta`).toBe(true)
    })

    it('os composers deixam espaço para a barra fixa não cobrir o fim do painel', () => {
        for (const [composer] of COMPOSERS) {
            expect(ler(composer), composer).toMatch(/max-lg:pb-\d+/)
        }
    })
})
