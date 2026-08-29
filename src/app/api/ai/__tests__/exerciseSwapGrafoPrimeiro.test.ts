import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O grafo tem que ser consultado ANTES do Gemini.
 *
 * Guard de fiação: a ordem é o produto aqui. Se a chamada ao grafo cair depois
 * da IA — ou sair —, a rota volta a pagar por chamada e a esperar rede para
 * responder o que já está no banco, sem que nenhum teste de comportamento
 * perceba (as duas respostas têm o mesmo formato).
 */

const SRC = readFileSync(join(process.cwd(), 'src/app/api/ai/exercise-swap/route.ts'), 'utf8')
const semComentarios = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

describe('a rota de troca consulta o grafo primeiro', () => {
    it('chama o grafo', () => {
        expect(semComentarios).toMatch(/alternativasDoGrafo\s*\(/)
    })

    it('e chama ANTES de tocar na chave do Gemini', () => {
        const grafo = semComentarios.search(/alternativasDoGrafo\s*\(/)
        const chave = semComentarios.indexOf('env.gemini.apiKey')
        expect(grafo, 'a chamada ao grafo sumiu — o guard perdeu o alvo').toBeGreaterThan(-1)
        expect(chave).toBeGreaterThan(-1)
        expect(grafo, 'grafo depois da IA volta a pagar pelo que já está no banco').toBeLessThan(chave)
    })

    it('responde direto quando o grafo tem resposta', () => {
        expect(semComentarios).toMatch(/if \(doGrafo\?\.length\)[\s\S]{0,160}NextResponse\.json/)
    })

    it('e o resultado diz de onde veio', () => {
        // Sem isso não há como medir quanto do tráfego deixou de custar IA.
        expect(semComentarios).toMatch(/source:\s*'graph'/)
    })

    it('falha no grafo NÃO custa a troca ao usuário — cai na IA', () => {
        const at = semComentarios.search(/alternativasDoGrafo\s*\(/)
        const tryAntes = semComentarios.lastIndexOf('try {', at)
        expect(tryAntes).toBeGreaterThan(-1)
        expect(at - tryAntes).toBeLessThan(300)
    })

    it('a IA continua existindo como fallback', () => {
        // O grafo cobre 248 exercícios; o usuário digita nome livre.
        expect(semComentarios).toMatch(/env\.gemini\.apiKey/)
        expect(semComentarios).toMatch(/getGeminiModel|generateContent|GoogleGenerativeAI/)
    })
})
