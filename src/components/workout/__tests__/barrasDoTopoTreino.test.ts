/**
 * Guard de CLASSE das faixas fixas no TOPO do treino ativo.
 *
 * Irmão do `barrasDoRodapeTreino.test.ts`, e existe pela mesma razão — só que a
 * lição veio pelo outro lado da tela.
 *
 * INCIDENTE (12/09/2026, medido no aparelho): o banner de consentimento do
 * professor ("Prof. X quer controlar seu treino") era `fixed` com
 * `top: max(env(safe-area-inset-top), 56px)` — o topo ABSOLUTO da viewport, que
 * é exatamente a faixa que o `WorkoutHeader` ocupa. Como o banner tem fundo de
 * 12% de opacidade, o header vazava por baixo: "Prof. MK quer controlar seu
 * treino" impresso por cima de "Upper B - Peito + Braços", e os botões
 * Aceitar/Recusar empilhados sobre os do header. Num convite REAL o toque caiu
 * no alvo errado e o controle foi RECUSADO — o aluno não tinha como mirar.
 *
 * ⚠️ Isto NÃO se resolve com z-index. Duas faixas disputando o mesmo espaço
 * físico: quem fica por cima esconde a outra, qualquer que seja o z. A
 * convivência é geométrica — quem chega depois se posiciona ABAIXO do header,
 * pela altura REAL que ele publica em `--it-workout-header-h`.
 *
 * Este guard varre o treino ativo e o shell do dashboard atrás de qualquer
 * elemento fixado no topo e exige que ele declare como convive com o header.
 * Faixa nova = vermelho pedindo a decisão, não bug em produção.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const raiz = process.cwd()

const ler = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8')

/** Comentário não é código: sem isto o guard acusa a própria explicação (jeito nº 2). */
const semComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const VARIAVEL = '--it-workout-header-h'

describe('o header publica a própria altura', () => {
    const header = semComentarios(ler('src/components/workout/WorkoutHeader.tsx'))

    it('mede o elemento real e publica a variável', () => {
        expect(header).toMatch(/setProperty\(\s*['"`]--it-workout-header-h['"`]/)
        // `bottom` e não `height`: é a distância do topo da viewport até o fim do
        // header, já com a safe-area embutida — o `top` de quem vem depois.
        expect(header).toMatch(/getBoundingClientRect\(\)\.bottom/)
    })

    it('devolve o topo ao sair do treino (senão a faixa fica com um vão para sempre)', () => {
        expect(header).toMatch(/removeProperty\(\s*['"`]--it-workout-header-h['"`]/)
    })

    it('⚠️ guarda o ResizeObserver — jsdom não tem, e sem a guarda o header cai', () => {
        expect(header).toMatch(/typeof ResizeObserver !== ['"`]undefined['"`]/)
    })
})

describe('quem fica no topo do treino consome a altura do header', () => {
    /**
     * Arquivos varridos. O do shell entrou porque é onde o banner do professor
     * mora — o guard do RODAPÉ aprendeu essa mesma lição em 24/08/2026, quando
     * varria só `components/workout` e deixou passar uma barra que vivia em
     * `app/(app)/dashboard`.
     */
    const ALVOS = [
        'src/app/(app)/dashboard/IronTracksAppClientImpl.tsx',
    ]

    /**
     * Faixas fixas no topo que NÃO precisam da variável, com o motivo.
     * Lista vazia hoje — e ela não pode virar papel de parede: cada entrada
     * nova é uma decisão de que aquele elemento pode cobrir o header.
     */
    const NAO_DISPUTA_O_TOPO: Array<{ trecho: string; porque: string }> = []

    it.each(ALVOS)('%s: todo `fixed` ancorado no topo usa a variável', (rel) => {
        const src = semComentarios(ler(rel))

        // `style={{ top: ... }}` num elemento com `fixed` na mesma tag.
        const fixadosNoTopo = [...src.matchAll(/className="[^"]*\bfixed\b[^"]*"[^>]*style=\{\{\s*top:\s*([^}]+)\}\}/g)]
            .map((m) => m[1].trim())

        const semVariavel = fixadosNoTopo.filter((top) => {
            if (top.includes(VARIAVEL)) return false
            return !NAO_DISPUTA_O_TOPO.some((e) => top.includes(e.trecho))
        })

        expect(
            semVariavel,
            `Elemento fixo no topo do treino sem \`${VARIAVEL}\`: ele vai cair EM CIMA do ` +
            `WorkoutHeader (foi assim que o convite do professor virou impossível de aceitar). ` +
            `Posicione por \`top: var(${VARIAVEL}, <fallback>)\` ou declare em NAO_DISPUTA_O_TOPO ` +
            `dizendo por que pode cobrir o header.`,
        ).toEqual([])
    })

    it('o banner de consentimento do professor está fiado na variável', () => {
        const shell = semComentarios(ler('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx'))
        // Ancorado no que VAI FICAR (o componente e a variável), nunca na string
        // que a correção apagou — jeito nº 6 da lista de guards falsos.
        // `<StudentControlConsent`, com o sinal de menor: sem ele o indexOf casa
        // com o `dynamic(() => import(...))` lá no topo do arquivo e o guard mede
        // a lista de imports em vez do JSX — falso positivo que este próprio
        // teste pegou ao nascer.
        const i = shell.indexOf('<StudentControlConsent')
        expect(i, 'o banner de consentimento sumiu do shell').toBeGreaterThan(0)
        const bloco = shell.slice(Math.max(0, i - 600), i)
        expect(
            bloco,
            'o banner voltou a se ancorar no topo absoluto da tela, em cima do header',
        ).toContain(VARIAVEL)
    })

    it('o extrator enxerga um fixo no topo (auto-teste — guard que não pega é guard falso)', () => {
        const sabotado = `<div className="fixed inset-x-0 z-[60]" style={{ top: 'max(env(safe-area-inset-top, 0px), 56px)' }}>`
        const achados = [...sabotado.matchAll(/className="[^"]*\bfixed\b[^"]*"[^>]*style=\{\{\s*top:\s*([^}]+)\}\}/g)]
        expect(achados).toHaveLength(1)
        expect(achados[0][1]).not.toContain(VARIAVEL)
    })
})
