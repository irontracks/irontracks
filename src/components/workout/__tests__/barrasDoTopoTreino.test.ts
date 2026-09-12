/**
 * Guard de CLASSE das faixas fixas no TOPO do treino ativo.
 *
 * Irmão do `barrasDoRodapeTreino.test.ts`, e nasceu da mesma lição pelo outro
 * lado da tela.
 *
 * INCIDENTE (12/09/2026, medido no aparelho com um convite REAL): o banner de
 * consentimento do professor ("Prof. X quer controlar seu treino") é `fixed` e
 * estava ancorado no topo ABSOLUTO da viewport — a faixa que o `WorkoutHeader`
 * ocupa. Como ele tem fundo de 12% de opacidade, o header vazava por baixo: dois
 * textos sobrepostos e os botões Aceitar/Recusar empilhados sobre os do header.
 * O toque caiu no alvo errado e o controle foi RECUSADO.
 *
 * ⚠️ **A PRIMEIRA correção mediu a altura do HEADER e só mudou o bug de lugar.**
 * O banner desceu e passou a cobrir a TIRA de navegação (os números dos
 * exercícios) — `WorkoutExerciseRail` é IRMÃ do header e também vive fora do
 * contêiner que rola. O dono viu na tela e disse "ainda está bugado".
 *
 * É por isso que este guard não se contenta em perguntar "usa a variável?" —
 * essa pergunta passou VERDE com o bug vivo. Guard de FORMA não substitui a
 * régua certa. O que ele exige é a FONTE da medida: `--it-workout-topo-h` tem
 * de sair do `top` do CONTÊINER QUE ROLA, que é por construção onde a região
 * fixa do topo acaba — de uma, de duas ou de cinco faixas. Medir um irmão
 * qualquer deixa os outros descobertos, e foi exatamente o que aconteceu.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const raiz = process.cwd()
const ler = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8')

/** Comentário não é código: sem isto o guard acusa a própria explicação (jeito nº 2). */
const semComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const VARIAVEL = '--it-workout-topo-h'
const ATIVO = 'src/components/ActiveWorkout.tsx'
const SHELL = 'src/app/(app)/dashboard/IronTracksAppClientImpl.tsx'

describe('a régua do topo sai do contêiner que ROLA', () => {
    const ativo = semComentarios(ler(ATIVO))

    it('publica a variável', () => {
        expect(ativo).toMatch(/setProperty\(\s*['"`]--it-workout-topo-h['"`]/)
    })

    it('⚠️ mede o `top` do contêiner rolável — não a altura de um irmão do topo', () => {
        // A medida é `top` (onde o conteúdo começa), nunca `height`/`bottom` de
        // header ou tira: só o contêiner rolável inclui TODAS as faixas fixas.
        expect(ativo).toMatch(/getBoundingClientRect\(\)\.top/)

        // E o ref medido tem de estar no elemento que rola. Sem isto alguém pode
        // apontar o mesmo ref para o header e o guard não perceberia — que é
        // literalmente o defeito que esta rodada produziu.
        const refDoConteudo = /ref=\{conteudoRef\}[^>]*className="[^"]*overflow-y-auto/
        expect(
            ativo,
            'o ref medido precisa estar no contêiner com overflow-y-auto: medir um ' +
            'irmão do topo (header OU tira) deixa o outro descoberto.',
        ).toMatch(refDoConteudo)
    })

    it('devolve o topo ao sair do treino', () => {
        expect(ativo).toMatch(/removeProperty\(\s*['"`]--it-workout-topo-h['"`]/)
    })

    it('⚠️ guarda o ResizeObserver — jsdom não tem, e sem a guarda a tela cai', () => {
        expect(ativo).toMatch(/typeof ResizeObserver !== ['"`]undefined['"`]/)
    })

    it('nenhum irmão do topo publica a variável por conta própria', () => {
        // Se o header (ou a tira) voltar a publicar, a medida deixa de incluir o
        // outro e o bug volta inteiro. A régua é UMA só.
        for (const rel of [
            'src/components/workout/WorkoutHeader.tsx',
            'src/components/workout/WorkoutExerciseRail.tsx',
        ]) {
            expect(
                semComentarios(ler(rel)),
                `${rel} não pode publicar ${VARIAVEL}: medir um irmão do topo é o ` +
                `defeito que esta rodada já produziu — a tira ficou coberta.`,
            ).not.toContain(`setProperty('${VARIAVEL}'`)
        }
    })
})

describe('quem fica no topo do treino consome a régua', () => {
    /**
     * Faixas fixas no topo que NÃO precisam da variável, com o motivo.
     * Nasce VAZIA, e não pode virar papel de parede: cada entrada é a decisão
     * consciente de que aquele elemento pode cobrir o header e a tira.
     */
    const NAO_DISPUTA_O_TOPO: Array<{ trecho: string; porque: string }> = []

    it('todo `fixed` ancorado no topo do shell usa a variável', () => {
        const src = semComentarios(ler(SHELL))
        const fixadosNoTopo = [...src.matchAll(/className="[^"]*\bfixed\b[^"]*"[^>]*style=\{\{\s*top:\s*([^}]+)\}\}/g)]
            .map((m) => m[1].trim())

        const semRegua = fixadosNoTopo.filter((top) =>
            !top.includes(VARIAVEL) && !NAO_DISPUTA_O_TOPO.some((e) => top.includes(e.trecho)),
        )

        expect(
            semRegua,
            `Elemento fixo no topo sem \`${VARIAVEL}\`: ele cai EM CIMA do header e da ` +
            `tira de navegação (foi assim que o convite do professor virou impossível de ` +
            `aceitar). Posicione por \`top: var(${VARIAVEL}, <fallback>)\` ou declare em ` +
            `NAO_DISPUTA_O_TOPO dizendo por que pode cobri-los.`,
        ).toEqual([])
    })

    it('o banner de consentimento do professor está fiado na régua', () => {
        const shell = semComentarios(ler(SHELL))
        // `<StudentControlConsent`, com o sinal de menor: sem ele o indexOf casa
        // com o `dynamic(() => import(...))` no topo do arquivo e o guard mede a
        // lista de imports em vez do JSX — falso positivo que este teste já teve.
        const i = shell.indexOf('<StudentControlConsent')
        expect(i, 'o banner de consentimento sumiu do shell').toBeGreaterThan(0)
        expect(
            shell.slice(Math.max(0, i - 600), i),
            'o banner voltou a se ancorar sem a régua do topo',
        ).toContain(VARIAVEL)
    })

    it('o extrator enxerga um fixo no topo (auto-teste — guard que não pega é guard falso)', () => {
        const sabotado = `<div className="fixed inset-x-0 z-[60]" style={{ top: 'max(env(safe-area-inset-top, 0px), 56px)' }}>`
        const achados = [...sabotado.matchAll(/className="[^"]*\bfixed\b[^"]*"[^>]*style=\{\{\s*top:\s*([^}]+)\}\}/g)]
        expect(achados).toHaveLength(1)
        expect(achados[0][1]).not.toContain(VARIAVEL)
    })
})
