/**
 * A espera do `globalSetup` do E2E não pode ficar presa para sempre.
 *
 * Em 18/08/2026 o job "E2E — jornada logada" ficou **46 minutos sem imprimir
 * uma única linha** do Playwright — nem o "Running N tests" — e teve de ser
 * cancelado à mão. Não era o app nem o teste: era o loop de espera do
 * `global-setup`, que chama `fetch(baseURL)` **sem timeout**.
 *
 * `fetch` sem `signal` só rejeita se a conexão falha. Se o servidor ACEITA e
 * não responde (preview da Vercel acordando, proxy pendurado), a promise fica
 * pendente para sempre — e o `deadline`, que só era consultado dentro do
 * `catch`, nunca era alcançado.
 *
 * Duas defesas, e o guard cobra as duas: teto por tentativa e o deadline
 * checado ANTES de cada tentativa.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync('e2e/global-setup.ts', 'utf8')

describe('espera do global-setup', () => {
    it('cada tentativa de fetch tem teto próprio', () => {
        expect(src, 'fetch sem signal fica pendente se o servidor aceitar e não responder')
            .toMatch(/fetch\([\s\S]{0,400}?AbortSignal\.timeout\(/)
    })

    it('o deadline é checado antes da tentativa, não só no catch', () => {
        const loop = src.slice(src.indexOf('for (;;)'), src.indexOf('const browser'))
        const antesDoTry = loop.slice(0, loop.indexOf('try {'))
        expect(antesDoTry, 'no catch só, um fetch pendurado nunca chega ao deadline')
            .toMatch(/Date\.now\(\)\s*>\s*deadline/)
    })

    it('a espera continua sendo melhor-esforço (não derruba a suíte)', () => {
        // Sem app respondendo, o certo é seguir e deixar o login falhar com
        // mensagem clara — não abortar o processo aqui.
        expect(src).toMatch(/seguindo assim mesmo/)
    })
})
