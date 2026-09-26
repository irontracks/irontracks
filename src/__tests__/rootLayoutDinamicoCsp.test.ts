import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * O layout raiz precisa forçar renderização dinâmica.
 *
 * O CSP do site é bloqueante com nonce POR REQUISIÇÃO (src/middleware.ts). O
 * Next só carimba esse nonce nos scripts inline que injeta (payload do RSC,
 * hidratação) quando a página é renderizada na hora. Página pré-gerada no build
 * sai sem nonce, o navegador bloqueia os scripts e nada hidrata.
 *
 * Em 26/09/2026 a fase 3 da migração raiz↔/comercial trocou o layout raiz e a
 * leitura de `headers()` sumiu com ele: a landing passou a ser pré-gerada
 * (`x-nextjs-prerender: 1`, zero `nonce=` no HTML) e ficou invisível e
 * desmontada em produção — sem erro no build, sem teste vermelho.
 */
const codigo = readFileSync('src/app/layout.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, '')

describe('layout raiz dinâmico (nonce do CSP)', () => {
    it('lê os headers da requisição', () => {
        expect(codigo).toMatch(/import\s*\{\s*headers\s*\}\s*from\s*'next\/headers'/)
        expect(codigo).toMatch(/await\s+headers\(\)/)
    })

    it('não se declara estático', () => {
        expect(codigo).not.toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-static['"]/)
    })
})
