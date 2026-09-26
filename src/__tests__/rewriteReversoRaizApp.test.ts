import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Migração raiz↔/comercial — fase 3 (26/09/2026), a que encerra a migração.
 *
 * A raiz agora é a landing comercial de verdade; o app mora fisicamente em
 * `src/app/app/*`, respondendo nativamente em `/app/*`. Existem 80+ pontos de
 * navegação hardcoded (redirect/router.push/Link/window.location) apontando
 * para rotas do app SEM o prefixo `/app`, além de QR codes, links de
 * relatório/PDF já compartilhados e notificações já gravadas no banco com
 * `link: '/dashboard'`. Reescrever tudo isso quebraria essas superfícies já
 * emitidas — em vez disso, as URLs antigas continuam respondendo via REWRITE
 * REVERSO: servem por baixo dos panos o conteúdo físico de `/app/*`, sem
 * mudar a URL visível.
 *
 * Vitest não sobe servidor Next real, então este guard é de FORMA (lê
 * `next.config.ts` como texto) — o comportamento em runtime foi conferido
 * manualmente com `curl` contra o preview, mesmo método da fase 1.
 *
 * Substitui `appEspelhoTemporario.test.ts` (guard da fase 1, removido: o
 * espelho `/app` → raiz que ele travava não existe mais).
 */
describe('rewrite reverso: rotas antigas sem prefixo continuam servindo /app/*', () => {
    const config = readFileSync('next.config.ts', 'utf8')

    it.each([
        ['/dashboard', '/app/dashboard'],
        ['/dashboard/:path*', '/app/dashboard/:path*'],
        ['/auth/:path*', '/app/auth/:path*'],
        ['/wait-approval', '/app/wait-approval'],
        ['/onboarding', '/app/onboarding'],
        ['/assessments/:path*', '/app/assessments/:path*'],
        ['/marketplace', '/app/marketplace'],
        ['/checkin', '/app/checkin'],
        ['/profile', '/app/profile'],
        ['/history', '/app/history'],
        ['/relatorio/:userId', '/app/relatorio/:userId'],
        ['/social', '/app/social'],
        ['/community', '/app/community'],
        ['/excluir-conta', '/app/excluir-conta'],
        ['/para-professores', '/app/para-professores'],
        ['/r/:code', '/app/r/:code'],
        ['/admin/:path*', '/app/admin/:path*'],
        ['/offline', '/app/offline'],
    ])('%s → %s', (source, destination) => {
        const re = new RegExp(
            `source:\\s*'${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]{0,40}destination:\\s*'${destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`,
        )
        expect(config).toMatch(re)
    })

    it('vêm DEPOIS dos rewrites de /map-tiles — ordem importa em rewrites()', () => {
        const idxMapTiles = config.indexOf("source: '/map-tiles/carto/:path*'")
        const idxDashboard = config.indexOf("source: '/dashboard'")
        expect(idxMapTiles).toBeGreaterThan(-1)
        expect(idxDashboard).toBeGreaterThan(idxMapTiles)
    })

    it('a raiz nua e /comercial NÃO entram no rewrite reverso', () => {
        expect(config).not.toMatch(/source:\s*'\/'[,\s]/)
        expect(config).not.toMatch(/source:\s*'\/comercial'[\s\S]{0,60}destination:\s*'\/app/)
    })

    it('/comercial vira REDIRECT pra raiz, não rewrite — link salvo não fica morto', () => {
        expect(config).toMatch(/source:\s*'\/comercial'[\s\S]{0,40}destination:\s*'\/'/)
        const idxRedirects = config.indexOf('async redirects()')
        const idxComercial = config.indexOf("source: '/comercial'")
        expect(idxRedirects).toBeGreaterThan(-1)
        expect(idxComercial).toBeGreaterThan(idxRedirects)
    })

    it('o espelho da fase 1 (/app → raiz) não existe mais', () => {
        expect(config).not.toMatch(/source:\s*'\/app'[\s\S]{0,40}destination:\s*'\/'/)
        expect(config).not.toMatch(/source:\s*'\/app\/:path\*'[\s\S]{0,40}destination:\s*'\/:path\*'/)
    })
})
