import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Migração raiz↔/comercial (23/09/2026) — fase 1 de 3.
 *
 * `/app` precisa responder com o MESMO conteúdo que a raiz hoje (login,
 * dashboard, auth) para a build nativa nova (que vai apontar
 * `capacitor.config.ts` para `/app`) ter algo pra carregar ANTES da migração
 * de rotas de verdade acontecer. Sem este rewrite, quem atualizasse pro
 * build novo veria 404 no lugar do dashboard.
 *
 * Vitest não sobe um servidor Next real, então este guard é de FORMA (lê o
 * `next.config.ts` como texto) — o comportamento em runtime (`/app`,
 * `/app/dashboard`, `/app/privacy` devolvendo o mesmo HTML que as rotas sem
 * prefixo, e `/comercial`/`/api/*` intocados) foi conferido manualmente com
 * `curl` contra o dev server antes deste commit.
 *
 * ⚠️ Este rewrite é TEMPORÁRIO. Remover só na fase 3 (quando as pastas forem
 * fisicamente movidas para dentro de `src/app/app/` e a landing subir para a
 * raiz) — remover antes derruba o app pra quem já está na build nova.
 */
describe('rewrite temporário /app → raiz (migração de domínio)', () => {
    const config = readFileSync('next.config.ts', 'utf8')

    it('espelha /app sozinho para a raiz', () => {
        expect(config).toMatch(/source:\s*'\/app'[\s\S]{0,40}destination:\s*'\/'/)
    })

    it('espelha /app/:path* para /:path*, sem afetar /api nem /comercial', () => {
        expect(config).toMatch(/source:\s*'\/app\/:path\*'[\s\S]{0,40}destination:\s*'\/:path\*'/)
        // Os dois rewrites do /app vivem DEPOIS dos de /map-tiles, nunca antes —
        // ordem importa em `rewrites()`, e um /app genérico demais na frente
        // poderia sombrear outra regra futura.
        const idxMapTiles = config.indexOf("source: '/map-tiles/carto/:path*'")
        const idxApp = config.indexOf("source: '/app'")
        expect(idxMapTiles).toBeGreaterThan(-1)
        expect(idxApp).toBeGreaterThan(idxMapTiles)
    })
})
