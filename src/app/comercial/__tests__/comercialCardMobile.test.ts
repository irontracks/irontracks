import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O card de feature com imagem tem que virar UMA coluna no celular.
 *
 * O grid interno era `gridTemplateColumns: '1fr 1fr'` em style INLINE — e
 * media query nenhuma alcança inline. Medido no navegador com viewport de
 * 375px: o card de 335px ficava partido em duas faixas de 167px, o parágrafo
 * caía para **119px de largura (36% do card)** e quebrava em duas ou três
 * palavras por linha, ocupando 202px de altura.
 *
 * O grid EXTERNO (`.com-bento`) já era mobile-first com `@media (min-width:
 * 900px)`; só o de dentro não era.
 *
 * Depois da correção, no mesmo viewport: uma coluna de 333px, texto em 285px
 * (85%) e 90px de altura. Em 1276px os dois cards seguem com duas colunas de
 * 408px — o desktop não mudou.
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const CONTENT = ler('src/app/comercial/ComercialContent.tsx')
const LAYOUT = ler('src/app/comercial/layout.tsx')
/** CSS sem comentários — eles são longos aqui e empurravam a regra para fora
 *  de qualquer janela de caracteres fixa (a primeira versão deste guard
 *  reprovou por isso, medindo o comentário em vez do código). */
const CSS_LIMPO = LAYOUT.replace(/\/\*[\s\S]*?\*\//g, '')
/** O corpo da regra `.com-feat-split` de base (a primeira, fora de @media). */
const regraBase = (): string => {
    const at = CSS_LIMPO.indexOf('.com-feat-split')
    expect(at, 'a classe do card sumiu — o guard perdeu o alvo').toBeGreaterThan(-1)
    return CSS_LIMPO.slice(at, CSS_LIMPO.indexOf('}', at))
}

describe('card de feature com imagem', () => {
    it('não define colunas em style inline — inline é imune a media query', () => {
        expect(
            CONTENT,
            'volte a usar a classe `com-feat-split`: inline não colapsa no celular',
        ).not.toMatch(/gridTemplateColumns:\s*'1fr 1fr'/)
    })

    it('usa a classe que o CSS controla', () => {
        // Ancorado no que FICA: sem este caso, remover o card inteiro deixaria
        // o de cima verde e cego.
        expect(CONTENT).toMatch(/com-feat-split/)
    })

    it('a classe nasce em UMA coluna — mobile-first, como o grid externo', () => {
        expect(regraBase()).toMatch(/grid-template-columns:\s*1fr\s*;/)
    })

    it('e vira duas colunas só a partir de uma largura declarada', () => {
        expect(CSS_LIMPO).toMatch(/@media \(min-width: \d+px\) \{\s*\.com-feat-split \{[\s\S]{0,200}grid-template-columns:\s*1fr 1fr/)
    })

    it('em uma coluna a imagem tem altura própria — `fill` não ocupa espaço sozinho', () => {
        // Sem a linha de altura o wrapper colapsa e a imagem some: `next/image`
        // com `fill` é absoluto e não empurra o layout.
        expect(regraBase()).toMatch(/grid-template-rows:\s*auto \d+px/)
    })

    it('o `sizes` da imagem acompanha o layout de uma coluna', () => {
        // Com 100vw no celular o Next serve a largura certa; o `50vw` anterior
        // descrevia o layout de duas colunas que não existe mais lá.
        expect(CONTENT).toMatch(/sizes="\(max-width: 700px\) 100vw/)
    })
})

describe('o CSS da comercial vive num template literal', () => {
    it('nenhuma crase dentro do bloco de estilo — ela encerra a string', () => {
        // Aconteceu ao escrever o comentário desta correção: uma crase no
        // comentário CSS fechou o template e quebrou o build com um
        // "',' expected" a 30 linhas de distância.
        const inicio = LAYOUT.indexOf('__html: `')
        expect(inicio, 'o bloco de estilo sumiu — o guard perdeu o alvo').toBeGreaterThan(-1)
        const fim = LAYOUT.indexOf('`', inicio + 9)
        const css = LAYOUT.slice(inicio + 9, fim)
        expect(css).toContain('.com-feat-split')
    })
})
