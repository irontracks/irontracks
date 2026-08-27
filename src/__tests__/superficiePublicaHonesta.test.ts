import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

/**
 * O que o app AFIRMA para quem ainda não é usuário.
 *
 * Três defeitos na superfície pública, e nenhum deles é estético:
 *
 * 1. A landing trazia TRÊS depoimentos inventados — nome, profissão e texto —
 *    sob "O que quem treina está dizendo". Depoimento fabricado apresentado
 *    como real é publicidade enganosa (CDC art. 37).
 * 2. Privacidade e Termos exibiam `new Date()` em "Atualizado em": todo dia o
 *    documento anunciava ter sido revisado hoje. É a única pista que o usuário
 *    tem de QUAL versão aceitou, e ela mentia diariamente.
 * 3. A tela de login dizia `v1.0` com o app na 1.21 — 21 releases parado,
 *    porque era um literal digitado à mão. Conferido contra a API da Apple.
 */

const comercial = readFileSync('src/app/comercial/ComercialContent.tsx', 'utf8')
const privacy = readFileSync('src/app/privacy/page.tsx', 'utf8')
const terms = readFileSync('src/app/terms/page.tsx', 'utf8')
const login = readFileSync('src/components/LoginScreen.tsx', 'utf8')
const versao = readFileSync('src/lib/appVersion.ts', 'utf8')

/** Só o código: a nota que explica a regra não pode acusar a si mesma. */
const executavel = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

describe('a landing não inventa gente', () => {
    it('não existe array de depoimento com nome e avatar', () => {
        const codigo = executavel(comercial)
        // A assinatura do defeito: objeto com `name` + `role` + `text`, que é
        // como um depoimento fabricado se escreve.
        expect(codigo).not.toMatch(/name:\s*'[^']+',\s*role:\s*'[^']+',\s*text:/)
        expect(codigo).not.toMatch(/initials:/)
    })

    it('nenhuma afirmação de volume de usuários sem número que a sustente', () => {
        const codigo = executavel(comercial)
        // "Avaliado com 5 estrelas na App Store Brasil" ao lado de três clientes
        // imaginários sugeria uma base que a nota (média de poucas avaliações)
        // não sustenta. A nota sozinha continua verdadeira.
        expect(codigo).not.toMatch(/Avaliado com 5 estrelas/)
        expect(codigo, 'a nota é verificável e pode ficar').toMatch(/Nota 5,0 na App Store/)
    })
})

describe('documento legal tem data de revisão FIXA', () => {
    for (const [nome, src] of [['privacidade', privacy], ['termos', terms]] as const) {
        it(`${nome}: "Atualizado em" não vem do relógio`, () => {
            const codigo = executavel(src)
            expect(codigo).not.toMatch(/Atualizado em:[^<]*new Date\(\)/)
            expect(codigo).toMatch(/REVISADO_EM/)
            expect(codigo, 'a data precisa ser um literal dd/mm/aaaa').toMatch(/const REVISADO_EM = '\d{2}\/\d{2}\/\d{4}'/)
        })

        it(`${nome}: o ano do rodapé também não gira sozinho`, () => {
            expect(executavel(src)).not.toMatch(/new Date\(\)\.getFullYear\(\)/)
        })
    }
})

describe('a versão exibida acompanha a que está na loja', () => {
    it('o login não traz literal de versão', () => {
        const codigo = executavel(login)
        expect(codigo).not.toMatch(/'v\d+\.\d+'/)
        expect(codigo).toMatch(/appVersionLabel\(\)/)
    })

    /**
     * A verdade do iOS é o `MARKETING_VERSION` do pbxproj — é ele que o dono
     * bumpa no release. Este caso compara os dois: bumpar o iOS e esquecer a
     * web vira CI vermelho em vez de virar número errado na cara do usuário.
     */
    it('APP_VERSION espelha o MARKETING_VERSION do projeto iOS', () => {
        const pbx = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8')
        const noXcode = [...new Set([...pbx.matchAll(/MARKETING_VERSION = ([\d.]+)/g)].map((m) => m[1]))]
        expect(noXcode, 'o pbxproj tem versões divergentes entre si').toHaveLength(1)

        const declarada = /APP_VERSION = '([\d.]+)'/.exec(versao)?.[1]
        expect(declarada, `a web diz ${declarada} e o iOS publica ${noXcode[0]}`).toBe(noXcode[0])
    })
})

describe('o modo de login morto não volta', () => {
    it("authMode nunca é comparado com 'menu'", () => {
        // Não existia `setAuthMode('menu')` no repo: o estado era inalcançável e
        // levava junto 158 linhas, incluindo um modal que gravava em
        // `access_requests` e que ninguém conseguia abrir.
        expect(executavel(login)).not.toMatch(/authMode === 'menu'/)
    })

    it('o fluxo de solicitar acesso continua existindo pelo cadastro', () => {
        const hook = readFileSync('src/hooks/useLoginScreen.ts', 'utf8')
        expect(hook, 'o signup cria o access_request antes do signUp').toMatch(/createAccessRequest/)
    })
})
