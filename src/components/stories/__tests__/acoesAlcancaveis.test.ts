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

/**
 * ⚠️ A ordem dos blocos é a correção de 01/09/2026, medida no aparelho.
 *
 * Com a legenda ANTES dos controles, o seletor de estilo caía por baixo da
 * barra de ações (medido no usuário: barra de 749 a 852 numa tela de 852) —
 * ele conseguia postar e salvar e não conseguia trocar cor nem layout. Voltar
 * a legenda para cima reintroduz exatamente esse defeito, e o teste de render
 * não pegaria: em jsdom nada tem altura.
 */
describe('ordem dos blocos: controles antes da legenda', () => {
    it.each(COMPOSERS.map(([c]) => c))('%s põe o painel de controle ANTES da legenda', (composer) => {
        const código = ler(composer)
        const painel = Math.min(
            ...['<StoryControlPanel', '<NutritionStoryControlPanel']
                .map((t) => código.indexOf(t))
                .filter((i) => i >= 0),
        )
        const legenda = código.indexOf('<CustomTextPanel')
        expect(painel).toBeGreaterThan(0)
        expect(legenda, 'a legenda existe').toBeGreaterThan(0)
        expect(painel, 'estilo e layout vêm primeiro — são a razão de existir do composer').toBeLessThan(legenda)
    })

    it('a folga do rodapé é maior que a barra medida (103px)', () => {
        for (const [composer] of COMPOSERS) {
            // pb-32 = 128px > 103px. Com pb-24 (96px) a barra cobria o fim do
            // painel — o layout ficava atrás dela.
            expect(ler(composer), composer).toMatch(/max-lg:pb-32/)
        }
    })
})

/**
 * A barra fixa não pode cobrir o campo da legenda enquanto se escreve.
 *
 * Relato do dono (01/09/2026, com print): metade do campo ficava por baixo da
 * barra POSTAR/SALVAR. São duas defesas, e as duas precisam existir — a barra
 * sai da frente durante o foco (CSS) e o campo sobe para o meio da tela ao ser
 * tocado (o teclado do iPhone ainda vai comer metade do espaço).
 */
describe('escrever a legenda com a barra fixa na tela', () => {
    const css = ler('src/app/globals.css')

    it('a barra some enquanto o campo está focado', () => {
        expect(css).toMatch(/body:has\(\.story-caption-field:focus\)\s*\.story-actions-bar/)
        // Só no mobile: no desktop a barra nem é fixa.
        const bloco = css.slice(css.indexOf('.story-caption-field:focus') - 400, css.indexOf('.story-caption-field:focus'))
        expect(bloco).toMatch(/@media \(max-width: 1023px\)/)
    })

    it.each(PAINEIS)('%s marca a barra com a classe que o CSS procura', (painel) => {
        expect(ler(painel)).toContain('story-actions-bar')
    })

    it('o campo tem a classe e sobe ao receber foco', () => {
        const campo = ler('src/components/stories/CustomTextPanel.tsx')
        expect(campo).toContain('story-caption-field')
        expect(campo).toMatch(/onFocus=\{subirAcimaDaBarra\}/)
        // `center`, não `nearest`: com o teclado aberto, `nearest` deixa o campo
        // colado na barra de novo.
        expect(campo).toMatch(/block:\s*'center'/)
    })
})

/**
 * ⚠️ `h-full` no conteúdo TRAVA a rolagem — foi a causa raiz.
 *
 * Medido no navegador com a estrutura do composer (contêiner de 400px,
 * conteúdo de 680px):
 *
 *   h-full      → scrollHeight 432  (só 32px de rolagem: o fim é inalcançável)
 *   min-h-full  → scrollHeight 840  (rola tudo)
 *   sem altura  → scrollHeight 840
 *
 * Com `height: 100%` o contêiner de rolagem não enxerga a altura real do
 * conteúdo, e nenhum padding-bottom resolve: o usuário chega ao "fim" da
 * rolagem com o último bloco ainda por baixo da barra fixa. Foi por isso que a
 * caixa da legenda continuou cortada depois de duas correções — e por que a
 * mudança de ordem só pareceu resolver (o estilo entrou na área alcançável, a
 * legenda saiu dela).
 *
 * `min-h-full` preserva o motivo de existir do `h-full` (o `items-center`
 * centraliza quando o conteúdo é curto) e deixa crescer quando é longo.
 */
describe('a rolagem alcança o fim do painel', () => {
    it.each(COMPOSERS.map(([c]) => c))('%s não trava o scroll com h-full', (composer) => {
        const código = ler(composer)
        const conteúdo = código.match(/className="p-4 sm:p-8 flex flex-col[^"]*"/)?.[0] ?? ''
        expect(conteúdo, 'o conteúdo do scroll existe').toBeTruthy()
        expect(conteúdo, 'h-full trava a rolagem — use min-h-full').not.toMatch(/(^|\s)h-full(\s|")/)
        expect(conteúdo).toMatch(/min-h-full/)
    })
})
