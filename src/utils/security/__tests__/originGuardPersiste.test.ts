import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Fiação: o middleware precisa REGISTRAR o mismatch, não só imprimi-lo.
 *
 * O `console.error` sozinho deixou a janela de observação do SEC-08 correndo 15
 * dias sem que ninguém pudesse lê-la — a retenção de runtime log da Vercel é de
 * ~1 dia. Guard de forma porque exercitar o middleware exigiria subir o Edge
 * Runtime inteiro; o comportamento do registro está em `originReport.test.ts`.
 */

const MW = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf8')
const semComentarios = MW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

describe('a guarda de origem deixa rastro que sobrevive', () => {
    it('o middleware registra o mismatch em audit_events', () => {
        expect(
            semComentarios,
            'sem isto a janela de observação vive ~1 dia e a decisão do enforce nunca chega',
        ).toMatch(/registrarMismatch\s*\(/)
    })

    it('o registro acontece ANTES de bloquear — o relato do modo enforce também importa', () => {
        const at = semComentarios.indexOf('registrarMismatch')
        const bloqueio = semComentarios.indexOf('origin_mismatch')
        expect(at).toBeGreaterThan(-1)
        expect(bloqueio).toBeGreaterThan(-1)
        expect(at, 'gravar depois do return 403 nunca executa').toBeLessThan(bloqueio)
    })

    it('o console.error continua como pista imediata', () => {
        // Ele não substitui o banco, mas é o que aparece na hora ao investigar.
        expect(semComentarios).toMatch(/\[origin-guard\]/)
    })

    it('o caminho inteiro segue dentro de try/catch', () => {
        // O que roda em toda chamada de API não pode ter caminho que lance.
        //
        // Fatiado pela CHAMADA, não pelo nome solto: `indexOf('evaluateOriginGuard')`
        // casa primeiro com a linha de IMPORT, e aí não há `try` antes — é o
        // erro nº 2 da lista de guards falsos do CLAUDE.md, cometido de novo
        // aqui e pego pelo próprio caso.
        const chamada = semComentarios.search(/evaluateOriginGuard\s*\(/)
        expect(chamada, 'a avaliação sumiu — o guard perdeu o alvo').toBeGreaterThan(-1)
        const tryAntes = semComentarios.lastIndexOf('try {', chamada)
        expect(tryAntes).toBeGreaterThan(-1)
        expect(chamada - tryAntes, 'o try tem que envolver a avaliação').toBeLessThan(400)
    })
})
