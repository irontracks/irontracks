import { describe, it, expect } from 'vitest'
import { buildApprovalEmail, buildRejectionEmail, firstName, APP_URL, SUPPORT_EMAIL } from '@/utils/email/approvalEmail'

/**
 * Guards do e-mail de aprovação — o único contato do produto com quem esperou
 * ser liberado. A tela `/wait-approval` promete "Aguarde o e-mail de aprovação";
 * um e-mail quebrado deixa a pessoa presa achando que ainda não foi aprovada.
 */
describe('buildApprovalEmail', () => {
    it('escapa o nome — ele vem de formulário PÚBLICO', () => {
        // `access_requests.full_name` é `z.string().min(1)` numa rota aberta, e
        // ia cru pra dentro do HTML do e-mail.
        const { html } = buildApprovalEmail({ name: '<img src=x onerror=alert(1)>', accountExisted: true })
        expect(html).not.toContain('<img src=x')
        expect(html).toContain('&lt;img')
        expect(html).not.toContain('onerror=alert')
    })

    it('escapa aspas e & sem quebrar o atributo', () => {
        // Sem espaço de propósito: só o PRIMEIRO nome vai pro e-mail, então o
        // caractere perigoso precisa estar dentro dele para o caso valer.
        const { html } = buildApprovalEmail({ name: 'Ana&"Bia" Souza', accountExisted: true })
        expect(html).toContain('&quot;')
        expect(html).toContain('&amp;')
    })

    it('sempre acompanha versão em texto — HTML puro cai em spam', () => {
        const mail = buildApprovalEmail({ name: 'Roberson', accountExisted: true })
        expect(mail.text.length).toBeGreaterThan(60)
        expect(mail.text).not.toContain('<')
        // o texto precisa se sustentar sozinho: nome, o que fazer e o link
        expect(mail.text).toContain('Roberson')
        expect(mail.text).toContain(APP_URL)
    })

    it('leva o link do app nas duas versões', () => {
        const mail = buildApprovalEmail({ name: 'Ana', accountExisted: false })
        expect(mail.html).toContain(`href="${APP_URL}"`)
        expect(mail.text).toContain(APP_URL)
        // e o endereço em texto, pro caso do botão não abrir
        expect(mail.html.split(APP_URL).length - 1).toBeGreaterThanOrEqual(2)
    })

    it('a instrução muda com o caso — entrar vs. criar conta', () => {
        // 25 das 27 aprovações reais tinham conta criada: a pessoa só precisa
        // entrar. Mandar "crie sua conta" pra quem já tem trava ela.
        const existente = buildApprovalEmail({ name: 'Ana', accountExisted: true })
        const nova = buildApprovalEmail({ name: 'Ana', accountExisted: false })
        expect(existente.text).toMatch(/entrar com o mesmo e-mail e senha/i)
        expect(nova.text).toMatch(/crie sua conta/i)
        expect(existente.text).not.toBe(nova.text)
    })

    it('oferece um caminho de resposta que existe', () => {
        // `noreply@` sem reply-to faz a dúvida do usuário sumir no vazio.
        const { html, text } = buildApprovalEmail({ name: 'Ana', accountExisted: true })
        expect(text).toContain(SUPPORT_EMAIL)
        expect(html).toContain(SUPPORT_EMAIL)
    })

    it('tem preheader — senão o app de e-mail puxa o rodapé', () => {
        const { html } = buildApprovalEmail({ name: 'Ana', accountExisted: true })
        expect(html).toMatch(/display:none;max-height:0/)
    })

    it('assunto estável e sem nome dentro (evita spam por assunto único)', () => {
        const a = buildApprovalEmail({ name: 'Ana', accountExisted: true })
        const b = buildApprovalEmail({ name: 'Roberson', accountExisted: false })
        expect(a.subject).toBe(b.subject)
        expect(a.subject).toBe('Seu acesso ao IronTracks foi aprovado')
    })
})

describe('buildRejectionEmail', () => {
    it('escapa o nome — mesma origem pública do e-mail de aprovação', () => {
        const { html } = buildRejectionEmail({ name: '<b>x</b>' })
        expect(html).not.toContain('<b>x</b>')
        expect(html).toContain('&lt;b&gt;')
    })

    it('não inventa motivo — não existe campo de motivo no sistema', () => {
        const { html, text } = buildRejectionEmail({ name: 'Ana' })
        for (const body of [html, text]) {
            expect(body).not.toMatch(/porque|motivo|razão|critério/i)
        }
    })

    it('oferece um caminho de resposta', () => {
        // Recusar sem dar para onde falar é fechar a porta na cara.
        const { text } = buildRejectionEmail({ name: 'Ana' })
        expect(text).toContain(SUPPORT_EMAIL)
        expect(text).toMatch(/responder este e-mail/i)
    })

    it('não promete acesso nem manda entrar no app', () => {
        // Um link "Entrar" num e-mail de recusa é crueldade acidental.
        const { html, text } = buildRejectionEmail({ name: 'Ana' })
        expect(html).not.toContain(`href="${APP_URL}"`)
        expect(text).not.toContain(APP_URL)
    })

    it('tem versão em texto, como o de aprovação', () => {
        const { text } = buildRejectionEmail({ name: 'Ana' })
        expect(text).not.toContain('<')
        expect(text.length).toBeGreaterThan(40)
    })
})

describe('firstName', () => {
    it('usa só o primeiro nome', () => {
        expect(firstName('Roberson Marques Leal')).toBe('Roberson')
    })

    it('nome vazio ou sujo vira Atleta, nunca string vazia', () => {
        expect(firstName('')).toBe('Atleta')
        expect(firstName('   ')).toBe('Atleta')
        expect(firstName(null)).toBe('Atleta')
        expect(firstName(undefined)).toBe('Atleta')
    })

    it('corta nome absurdo — o formulário público não tem limite de tamanho', () => {
        expect(firstName('A'.repeat(500)).length).toBeLessThanOrEqual(60)
    })
})

/**
 * O dono pediu um e-mail "premium plus" (ago/2026). Estes guards travam o que
 * faz um e-mail chegar BONITO em vez de quebrado — cada item aqui é uma coisa
 * que some num refactor de CSS e ninguém percebe, porque quem vê é o usuário
 * final, não a gente.
 */
describe('e-mail premium: o que não pode quebrar', () => {
    const mail = buildApprovalEmail({ name: 'Roberson', accountExisted: true })

    it('layout em tabela, não em flex/grid — Outlook não renderiza os dois', () => {
        expect(mail.html).toContain('role="presentation"')
        expect(mail.html).not.toMatch(/display:\s*(flex|grid)/)
    })

    it('botão com fallback VML — o Outlook ignora padding em <a>', () => {
        expect(mail.html).toContain('v:roundrect')
        expect(mail.html).toContain('<!--[if mso]>')
        expect(mail.html).toContain('<w:anchorlock/>')
    })

    it('todo CSS é inline — <style> em head é removido por vários clientes', () => {
        expect(mail.html).not.toMatch(/<style[\s>]/i)
        expect(mail.html).not.toMatch(/class=/)
    })

    it('nenhuma imagem externa — cliente de e-mail bloqueia por padrão', () => {
        // A marca é TEXTO estilizado justamente por isso: se as imagens não
        // carregam, o e-mail continua inteiro.
        expect(mail.html).not.toMatch(/<img/i)
        expect(mail.html).not.toMatch(/background-image:\s*url/i)
        expect(mail.html).toContain('IRON<span')
    })

    it('trava a largura — sem isso o texto vira uma linha só no desktop', () => {
        expect(mail.html).toMatch(/max-width:560px/)
    })

    it('carrega a identidade do app: marca, cor e tagline', () => {
        expect(mail.html).toContain('#facc15')
        expect(mail.html).toContain('Sistema de Alta Performance')
    })

    it('orienta o primeiro passo em vez de só liberar o acesso', () => {
        // Chegar num app cheio sem saber por onde começar é o que faz a pessoa
        // fechar e não voltar.
        expect(mail.html).toContain('Por onde começar')
        expect(mail.text).toContain('POR ONDE COMEÇAR')
        expect(mail.text).toMatch(/1\. Monte seu treino/)
    })

    it('o e-mail de recusa usa a mesma casca, sem a festa', () => {
        const no = buildRejectionEmail({ name: 'Ana' })
        expect(no.html).toContain('Sistema de Alta Performance')
        expect(no.html).not.toContain('Acesso aprovado')
        expect(no.html).not.toContain('v:roundrect')
        expect(no.html).not.toContain('Por onde começar')
    })
})
