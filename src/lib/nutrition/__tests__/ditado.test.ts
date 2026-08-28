import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEPARADOR_DE_DITADO, juntarDitado } from '../ditado'
import { analyzeMeal } from '../parser'

/**
 * Lançar refeição por VOZ (28/08/2026).
 *
 * O caso que dá nome a este arquivo é o do separador: juntar dois ditados com
 * quebra de linha faz o parser tratar o primeiro como NOME da refeição e
 * descartar a comida — em silêncio. O último bloco prova isso contra o parser
 * de verdade, não contra uma suposição sobre ele.
 */

afterEach(() => vi.restoreAllMocks())

describe('juntarDitado', () => {
    it('campo vazio recebe o ditado inteiro', () => {
        expect(juntarDitado('', '150g de arroz')).toBe('150g de arroz')
        expect(juntarDitado('   ', '150g de arroz')).toBe('150g de arroz')
    })

    it('ACRESCENTA em vez de substituir — ditar é em partes, e o campo pode ter texto digitado', () => {
        expect(juntarDitado('150g de arroz', '200g de patinho'))
            .toBe(`150g de arroz${SEPARADOR_DE_DITADO}200g de patinho`)
    })

    it('não duplica separador quando o texto já termina em um', () => {
        expect(juntarDitado('150g de arroz +', 'banana')).toBe('150g de arroz + banana')
        expect(juntarDitado('arroz,', 'feijão')).toBe('arroz, feijão')
    })

    it('ditado vazio não mexe no campo', () => {
        expect(juntarDitado('150g de arroz', '   ')).toBe('150g de arroz')
        expect(juntarDitado('150g de arroz', '')).toBe('150g de arroz')
    })
})

describe('o separador não pode fazer a comida sumir', () => {
    /**
     * `isTitleLine` no parser: primeira linha FÍSICA, sem dígito, que não bate
     * exatamente com um alimento conhecido, vira o NOME da refeição. Com `\n`
     * entre os ditados, o primeiro alimento cai nessa regra e não vira nem item
     * nem `unknownLine` — desaparece.
     */
    const primeiro = 'peito de frango grelhado'
    const segundo = 'arroz branco'

    it('com quebra de linha, o primeiro ditado VIRA NOME e some da conta', () => {
        const comQuebra = analyzeMeal(`${primeiro}\n${segundo}`)
        const rotulos = comQuebra.items.map((i) => i.label.toLowerCase()).join(' | ')
        const perdido = !rotulos.includes('frango') && !comQuebra.unknownLines.some((l) => l.includes('frango'))
        expect(perdido, 'o parser mudou: a quebra de linha deixou de engolir o primeiro item').toBe(true)
    })

    it('com o separador de ITEM, os dois ditados sobrevivem', () => {
        const juntado = juntarDitado(primeiro, segundo)
        const r = analyzeMeal(juntado)
        const tudo = [...r.items.map((i) => i.label.toLowerCase()), ...r.unknownLines.map((l) => l.toLowerCase())].join(' | ')
        expect(tudo).toContain('frango')
        expect(tudo).toContain('arroz')
    })
})

/**
 * Fiação no NutritionMixer, por source-guard.
 *
 * O Mixer tem ~1650 linhas e exige Supabase, imports dinâmicos e ~20 props: um
 * teste de render ali mede o harness, não o app (regra registrada no CLAUDE.md).
 * O comportamento se prova no aparelho; o que este bloco trava é a FORMA do
 * código voltar atrás.
 */
describe('o ditado está ligado no campo da refeição', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/dashboard/nutrition/NutritionMixer.tsx'), 'utf8')

    /** Corpo do `useSpeechToText({ ... })`, por chaves balanceadas. */
    const blocoDoDitado = (): string => {
        const at = src.indexOf('useSpeechToText({')
        if (at === -1) return ''
        let prof = 0
        for (let i = src.indexOf('{', at); i < src.length; i++) {
            if (src[i] === '{') prof++
            else if (src[i] === '}') {
                prof--
                if (prof === 0) return src.slice(at, i + 1)
            }
        }
        return ''
    }

    it('o texto ditado ACRESCENTA ao campo — substituir apagaria o que o usuário digitou', () => {
        const bloco = blocoDoDitado()
        expect(bloco, 'o Mixer não chama mais useSpeechToText').not.toBe('')
        expect(bloco).toMatch(/juntarDitado\(/)
        // `setInput('...')` com literal, ou setInput(texto) direto, é substituição.
        expect(bloco, 'o ditado voltou a SOBRESCREVER o campo').not.toMatch(/setInput\(\s*texto\s*\)/)
    })

    it('existe um controle de ditado com nome acessível, e ele liga e desliga', () => {
        expect(src).toMatch(/aria-label=\{[^}]*Ditar a refeição/)
        expect(src).toMatch(/ditado\.gravando \? ditado\.parar\(\) : ditado\.iniciar\(\)/)
    })
})
