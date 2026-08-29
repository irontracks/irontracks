import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O grafo e a IA precisam falar a MESMA escala de similaridade.
 *
 * A UI (`AIExerciseSwap`) escreve `{alt.similarity}%` e colore por faixa; a
 * rota de IA sempre devolveu 0–100. A coluna do banco é 0–1. Enquanto o grafo
 * repassava a fração crua, uma alternativa perfeita aparecia como **"1%"**.
 *
 * Guard de forma porque o defeito é de CONTRATO entre módulos: os dois lados
 * são números válidos isoladamente, e só a tela mostrou a diferença.
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (f: string) =>
    f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const GRAFO = semComentarios(ler('src/lib/workout/exerciseSwapGraph.ts'))
const ROTA_IA = semComentarios(ler('src/app/api/ai/exercise-swap/route.ts'))
const UI = semComentarios(ler('src/components/workout/AIExerciseSwap.tsx'))

describe('escala de similaridade', () => {
    it('o grafo converte a fração do banco para percentual', () => {
        expect(
            GRAFO,
            'sem `* 100`, similaridade 1.000 vira "1%" na tela',
        ).toMatch(/Number\(a\.similarity\)[^)]*\)\s*\*\s*100|\*\s*100\s*\)/)
    })

    it('e limita a faixa antes de converter', () => {
        expect(GRAFO).toMatch(/Math\.min\(1,/)
    })

    it('a IA continua na mesma escala 0–100', () => {
        expect(ROTA_IA).toMatch(/Math\.min\(100,/)
    })

    it('a UI escreve percentual — é ela que define o contrato', () => {
        // Se algum dia a UI passar a formatar sozinha, esta é a âncora que
        // avisa que as duas fontes precisam mudar junto.
        expect(UI).toMatch(/\{alt\.similarity\}%/)
    })
})
