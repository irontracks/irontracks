import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * A série concluída aparecia VERDE dentro do painel de REMOVER série.
 *
 * O painel é vermelho e existe para uma coisa só: apagar. Dentro dele, o chip
 * da série já feita vinha em esmeralda com um ✓ — a cor e o símbolo de
 * sucesso, convidando ao toque que destrói.
 *
 * O `hover:` que o levaria ao vermelho **não existe no touch**: no iPhone o
 * chip ficava permanentemente verde. A pessoa lê "concluída, ok" e toca
 * achando que confirma.
 *
 * A informação — quais séries já foram feitas — é útil para escolher qual
 * tirar, e continua: no ÍCONE, não na cor. O vermelho passou para o `active:`,
 * que é o estado que o dedo de fato produz.
 */

const src = readFileSync(join(__dirname, '..', 'ExerciseCard.tsx'), 'utf8')

/** O bloco do painel "Remover qual série?". */
const painel = (() => {
    const i = src.indexOf('Remover qual série?')
    if (i === -1) return ''
    // Até o botão de FECHAR o painel. Fatiar por `setRemoveSetOpen(false)`
    // parava cedo: essa chamada também acontece dentro do onClick de cada chip,
    // e o corte engolia justamente a região que interessa medir.
    const j = src.indexOf("className=\"mt-2 w-full min-h-[44px]", i)
    return src.slice(i, j > i ? j : i + 3000)
})()

const executavel = painel.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

describe('painel destrutivo não usa cor de sucesso', () => {
    it('o guard encontrou o painel', () => {
        expect(painel).not.toBe('')
        expect(painel).toContain('Remover série')
    })

    it('nenhum verde nos chips de série', () => {
        expect(executavel, 'esmeralda é sucesso — aqui tudo é remoção').not.toMatch(/emerald-|green-/)
    })

    it('a informação de "já feita" continua, pelo ícone', () => {
        // Saber quais séries foram feitas é o que permite escolher qual tirar.
        expect(executavel).toMatch(/sDone && <CheckCircle2/)
    })

    /**
     * `hover:` não acontece em touch. Se o feedback destrutivo vive só ali, no
     * celular ele nunca aparece — que era exatamente o caso.
     */
    it('o feedback destrutivo existe no estado que o dedo produz', () => {
        expect(executavel).toMatch(/active:bg-red-/)
        expect(executavel).toMatch(/active:text-red-/)
    })
})
