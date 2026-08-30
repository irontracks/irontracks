import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Fiação do "Treinar em casa".
 *
 * O COMPORTAMENTO está em `lib/workout/__tests__/adaptarAmbiente.test.ts` (11
 * casos sobre função pura). Aqui trava-se o que só a ligação garante: o item
 * existe no menu da SESSÃO, o modal mostra antes de aplicar, e a aplicação usa
 * o mesmo `swapExerciseName` da troca individual — não um segundo caminho.
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (f: string) =>
    f.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const HEADER = semComentarios(ler('src/components/workout/WorkoutHeader.tsx'))
const MODAL = semComentarios(ler('src/components/workout/AdaptarAmbienteModal.tsx'))

describe('o atalho mora no menu da sessão', () => {
    it('existe e abre o modal', () => {
        expect(HEADER).toMatch(/setAdaptarAberto\(true\)/)
        expect(HEADER).toContain('Treinar em casa')
    })

    it('fica desabilitado sem exercícios', () => {
        const at = HEADER.indexOf('setAdaptarAberto(true)')
        expect(HEADER.slice(at, at + 300)).toMatch(/disabled=\{exercises\.length === 0\}/)
    })

    it('o modal é carregado sob demanda', () => {
        // Ele puxa a biblioteca inteira e o grafo; quem nunca toca não paga.
        expect(HEADER).toMatch(/dynamic\(\(\) => import\('\.\/AdaptarAmbienteModal'\)/)
    })
})

describe('aplica pelo MESMO caminho da troca individual', () => {
    it('usa swapExerciseName', () => {
        // Um segundo caminho de troca divergiria do primeiro — é o padrão que
        // este repo já pagou caro em 14 renderers de série.
        expect(HEADER).toMatch(/aoTrocar=\{\(indice, nome\) => swapExerciseName\(indice, nome\)\}/)
    })

    it('e passa os nomes na ORDEM do treino', () => {
        // O plano devolve `indice`, e é por ele que a troca acontece: embaralhar
        // aqui trocaria o exercício errado.
        expect(HEADER).toMatch(/exercicios=\{\(exercises \?\? \[\]\)\.map/)
    })
})

describe('mostra antes de aplicar', () => {
    it('o plano é montado sem aplicar nada', () => {
        expect(MODAL).toMatch(/planejarAdaptacao\s*\(/)
        const at = MODAL.indexOf('planejarAdaptacao(')
        expect(MODAL.slice(Math.max(0, at - 400), at)).not.toMatch(/aoTrocar\(/)
    })

    it('a aplicação depende de um clique explícito', () => {
        expect(MODAL).toMatch(/onClick=\{aplicar\}/)
    })

    it('os exercícios SEM alternativa são declarados', () => {
        // Silenciar faria alguém aplicar achando que o treino virou caseiro e
        // encontrar uma polia no meio.
        expect(MODAL).toMatch(/semAlternativa/)
        expect(MODAL).toMatch(/ficam como estão/i)
    })

    it('e o caso "já dá para fazer em casa" tem resposta própria', () => {
        expect(MODAL).toMatch(/já dá para fazer em casa/i)
    })
})

describe('o modal sai por portal', () => {
    it('usa FullscreenPortal', () => {
        // Mesma classe do guard da Nutrição: modal filho de contêiner rolável
        // herda stacking context e containing block.
        expect(MODAL).toMatch(/<FullscreenPortal>/)
    })
})
