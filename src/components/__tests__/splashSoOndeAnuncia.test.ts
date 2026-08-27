import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * O splash do root cobria toda página pública que não estivesse numa lista.
 *
 * `AppLoadingOverlay` vive no layout raiz e só sai quando alguém dispara
 * `irontracks:app:ready` — ou no timeout de 12 s. Quem dispara o evento são
 * DUAS telas: a raiz (`login-gate`) e o dashboard. Todo o resto dependia de
 * estar numa lista de exceções escrita à mão.
 *
 * Ficavam de fora, medido em 27/08/2026: `/terms` e `/excluir-conta` — as duas
 * server components ESTÁTICAS, sem nada para anunciar. Cobertas por 12 s, e aos
 * 8 s o `LoadingScreen` acende "Voltar ao início", ou seja, o app anuncia que
 * travou numa página que já tinha carregado. A segunda é o caminho de exclusão
 * de conta que a App Store exige acessível.
 *
 * A correção é a INVERSÃO: cobrir só quem anuncia. Assim página pública nova
 * nasce dispensando o overlay, em vez de nascer presa até alguém lembrar de
 * acrescentá-la à lista — que é como as duas ficaram presas.
 */

const overlay = readFileSync(join(__dirname, '..', 'AppLoadingOverlay.tsx'), 'utf8')
const executavel = overlay.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

describe('o splash cobre só quem anuncia prontidão', () => {
    it('não existe mais lista de exceções', () => {
        // A lista era o defeito: cobria tudo e dependia de alguém lembrar.
        expect(executavel).not.toMatch(/skipPaths/)
    })

    it('a regra é allowlist do que COBRE', () => {
        expect(executavel).toMatch(/anunciaProntidao/)
        expect(executavel).toMatch(/p === '\/'/)
        expect(executavel).toMatch(/startsWith\('\/dashboard'\)/)
        expect(executavel).toMatch(/if \(pathname && !anunciaProntidao\(pathname\)\)/)
    })

    /**
     * A allowlist tem que casar com quem REALMENTE dispara o evento. Se uma
     * terceira tela passar a anunciar e não entrar aqui, ela dispensa o overlay
     * cedo demais; se uma sair, fica coberta por 12 s.
     */
    it('quem dispara o evento é exatamente quem a regra cobre', () => {
        const quemDispara = execSync(
            "grep -rl \"irontracks:app:ready\" src | grep -v AppLoadingOverlay | grep -v __tests__ || true",
            { encoding: 'utf8' },
        ).trim().split('\n').filter(Boolean).sort()
        expect(quemDispara).toEqual([
            'src/app/(app)/dashboard/IronTracksAppClientImpl.tsx', // rota /dashboard*
            'src/app/login-gate.tsx',                              // rota /
        ])
    })

    it('as páginas estáticas que ficavam presas continuam sem anunciar nada', () => {
        for (const pagina of ['src/app/terms/page.tsx', 'src/app/excluir-conta/page.tsx']) {
            const src = readFileSync(pagina, 'utf8')
            expect(src, `${pagina} não dispara ready — por isso não pode ser coberta`).not.toMatch(/irontracks:app:ready/)
        }
    })
})
