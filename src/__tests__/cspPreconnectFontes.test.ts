import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCspHeader } from '@/utils/security/headers'

/**
 * `preconnect` é regido por `connect-src` — e o layout do app apontava para
 * `fonts.googleapis.com`, que não está lá.
 *
 * Apareceu como violação REAL em produção em 28/08/2026, um dia depois de o CSP
 * entrar em modo bloqueante. É exatamente o caso que o CLAUDE.md previu ao
 * mandar reler a janela: "origem legítima que não apareceu nas três leituras
 * aparece agora como quebra, não como relatório".
 *
 * A saída foi REMOVER, não liberar: a Inter vem de `next/font/google`, que a
 * self-hospeda no build, então o app não pede nada ao Google em runtime. Quem
 * usa Google Fonts é a landing, cujo layout já traz os próprios preconnects.
 *
 * Migração raiz↔/comercial, fase 3 (26/09/2026): a IDENTIDADE dos dois
 * arquivos se inverteu. `src/app/layout.tsx` agora É a landing (promovida de
 * `comercial/layout.tsx`) — quem deve TER os preconnects do Google. O layout
 * do app (ex-root, hoje `src/app/app/layout.tsx`) é quem NÃO deve ter.
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (f: string) =>
    f.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

describe('preconnect e CSP não podem se contradizer', () => {
    it('o layout do APP não faz preconnect para as fontes do Google', () => {
        const appLayout = semComentarios(ler('src/app/app/layout.tsx'))
        expect(
            appLayout,
            '`preconnect` cai em connect-src: ou a origem entra na política, ou o link sai',
        ).not.toMatch(/rel="(preconnect|dns-prefetch)"\s+href="https:\/\/fonts\.(googleapis|gstatic)\.com"/)
    })

    it('a landing (raiz) continua com os dela — é quem usa Google Fonts de verdade', () => {
        const raiz = semComentarios(ler('src/app/layout.tsx'))
        expect(raiz).toMatch(/rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"/)
        expect(raiz).toMatch(/fonts\.googleapis\.com\/css2/)
    })

    it('e a política continua permitindo a folha e os arquivos daquela página', () => {
        // Removi o preconnect, não o uso: a landing carrega o CSS por
        // `style-src` e os arquivos por `font-src`. Mexer nesses dois quebraria
        // a landing.
        const csp = buildCspHeader('nonce-teste')
        expect(csp).toMatch(/style-src[^;]*fonts\.googleapis\.com/)
        expect(csp).toMatch(/font-src[^;]*fonts\.gstatic\.com/)
    })

    it('todo host de preconnect do layout do app está no connect-src', () => {
        // Guard de CLASSE: o defeito não era este host, era a regra. Preconnect
        // novo para origem fora da política volta a virar violação em produção,
        // e o custo de descobrir isso é uma janela de CSP.
        const appLayout = ler('src/app/app/layout.tsx')
        const csp = buildCspHeader('nonce-teste')
        const connectSrc = csp.split(';').find((d) => d.trim().startsWith('connect-src')) ?? ''

        const hosts = [...appLayout.matchAll(/rel="(?:preconnect|dns-prefetch)"\s+href="https:\/\/([^"]+)"/g)]
            .map((m) => m[1])

        expect(hosts.length, 'este teste só faz sentido se o layout do app tiver preconnects').toBeGreaterThan(0)

        for (const host of hosts) {
            const permitido =
                connectSrc.includes(host) ||
                // curingas do próprio connect-src (ex.: `*.supabase.co`)
                connectSrc.split(/\s+/).some((p) => {
                    const limpo = p.replace(/^https:\/\//, '')
                    return limpo.startsWith('*.') && host.endsWith(limpo.slice(1))
                })
            expect(permitido, `preconnect para ${host} não está no connect-src`).toBe(true)
        }
    })
})
