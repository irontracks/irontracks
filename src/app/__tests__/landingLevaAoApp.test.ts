import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A landing leva ao APP por `/app` — nunca pela raiz do domínio.
 *
 * Até a fase 3 da migração raiz↔/comercial (26/09/2026) a raiz ERA o app, e a
 * landing apontava "Usar no navegador", "Entrar" e o convite do VIP para
 * `https://irontracks.com.br`. Depois da inversão a raiz passou a ser a própria
 * landing: os três botões só recarregavam a página, sem erro nenhum — no ar,
 * no cartão de visita do app.
 *
 * Varre a PASTA da landing, não um arquivo: componente novo nasce coberto.
 */

const DIR = join(process.cwd(), 'src', 'app', '(landing)')
const arquivos = readdirSync(DIR, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))
    .map((f) => ({ rel: f, src: readFileSync(join(DIR, f), 'utf8') }))

/** Código sem comentários — a nota que explica a regra não pode acusar a si mesma. */
const codigo = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

describe('landing → app', () => {
    it('a varredura enxerga a landing', () => {
        expect(arquivos.length).toBeGreaterThan(0)
    })

    it('nenhum link aponta para a raiz absoluta do domínio', () => {
        const culpados = arquivos.flatMap(({ rel, src }) => {
            const c = codigo(src)
            const direto = /href=\{?\s*["'`]https:\/\/(www\.)?irontracks\.com\.br\/?["'`]/.test(c)
            // Constante com a raiz usada como href (a forma exata do defeito).
            const constantes = [...c.matchAll(/const\s+(\w+)\s*=\s*["'`]https:\/\/(?:www\.)?irontracks\.com\.br\/?["'`]/g)].map((m) => m[1])
            const viaConstante = constantes.some((nome) => new RegExp(`href=\\{${nome}\\}`).test(c))
            return direto || viaConstante ? [rel] : []
        })
        expect(culpados, 'a raiz é a landing: link pro app vai em /app').toEqual([])
    })

    it('existe caminho da landing para o app em /app', () => {
        // Ancorado no que FICA: sem este caso, apagar todos os botões de entrar
        // deixaria o de cima verde.
        const temApp = arquivos.some(({ src }) => /["'`]\/app["'`]/.test(codigo(src)))
        expect(temApp).toBe(true)
    })
})
