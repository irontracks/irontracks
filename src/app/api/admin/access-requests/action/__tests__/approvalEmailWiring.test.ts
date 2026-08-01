import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guards da rota de aprovação. Antes da auditoria (ago/2026) esta rota tinha
 * ZERO cobertura, e o envio de e-mail falhava em silêncio de três jeitos.
 * Cada teste aqui trava um dos buracos encontrados.
 */
const ROUTE = 'src/app/api/admin/access-requests/action/route.ts'
const src = readFileSync(ROUTE, 'utf8')

describe('rota de aprovação: envio de e-mail', () => {
    it('não monta HTML nem chama a Resend inline — usa o módulo verificável', () => {
        // O `fetch(...).catch(() => null)` inline era a raiz de tudo: sem
        // checagem de `res.ok`, sem versão texto, sem escape do nome.
        expect(src).not.toContain('api.resend.com')
        expect(src).toContain('sendTransactionalEmail')
        expect(src).toContain('buildApprovalEmail')
    })

    it('a mensagem ao admin depende do RESULTADO do envio', () => {
        // Dizia "Acesso liberado e e-mail enviado." sem nenhuma prova de envio.
        expect(src).toMatch(/emailResult\.ok\s*\n?\s*\?/)
        expect(src).toMatch(/e-mail de aprovação enviado/)
        expect(src).toMatch(/e-mail NÃO foi enviado/)
    })

    it('email_warning só sai quando o envio falhou de verdade', () => {
        // O aviso na UI existia desde sempre e era inalcançável, porque a função
        // de envio nunca lançava e o catch nunca era atingido.
        expect(src).toMatch(/emailResult\.ok \? \{\} : \{/)
        expect(src).toContain('email_warning: true')
        expect(src).toContain('describeEmailFailure')
    })

    it('grava o resultado do envio em audit_events', () => {
        // "Fulano recebeu o e-mail?" precisa ter resposta meses depois: log da
        // Vercel expira e o Sentry não recebe erro de rota server neste projeto.
        expect(src).toContain('approval_email_sent')
        expect(src).toContain('approval_email_failed')
        expect(src).toMatch(/provider_id: emailResult\.id/)
    })

    it('não usa logWarn para falha de envio — é no-op em produção', () => {
        // `logWarn` tem `if (IS_PROD) return`: o sinal morria antes de sair.
        expect(src).not.toMatch(/logWarn\([^)]*[Ee]mail/)
        expect(src).not.toMatch(/logWarn\([^)]*WhatsApp/)
    })

    it('falha de e-mail NÃO derruba a aprovação já gravada', () => {
        // A RPC é transacional e já commitou; lançar aqui devolveria 500 pro
        // admin depois do acesso ter sido liberado de verdade.
        expect(src).toMatch(/const emailResult = await sendApprovalEmail\(/)
        expect(src).not.toMatch(/await sendApprovalEmail\([\s\S]{0,400}throw/)
    })
})
