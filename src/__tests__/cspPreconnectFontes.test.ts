import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCspHeader } from '@/utils/security/headers'

/**
 * `preconnect` é regido por `connect-src` — e o layout raiz apontava para
 * `fonts.googleapis.com`, que não está lá.
 *
 * Apareceu como violação REAL em produção em 28/08/2026, um dia depois de o CSP
 * entrar em modo bloqueante. É exatamente o caso que o CLAUDE.md previu ao
 * mandar reler a janela: "origem legítima que não apareceu nas três leituras
 * aparece agora como quebra, não como relatório".
 *
 * A saída foi REMOVER, não liberar: a Inter vem de `next/font/google`, que a
 * self-hospeda no build, então o app não pede nada ao Google em runtime. Quem
 * usa Google Fonts é `/comercial`, cujo layout já traz os próprios preconnects.
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (f: string) =>
    f.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

describe('preconnect e CSP não podem se contradizer', () => {
    it('o layout raiz não faz preconnect para as fontes do Google', () => {
        const raiz = semComentarios(ler('src/app/layout.tsx'))
        expect(
            raiz,
            '`preconnect` cai em connect-src: ou a origem entra na política, ou o link sai',
        ).not.toMatch(/rel="(preconnect|dns-prefetch)"\s+href="https:\/\/fonts\.(googleapis|gstatic)\.com"/)
    })

    it('a /comercial continua com os dela — é quem usa Google Fonts de verdade', () => {
        const comercial = semComentarios(ler('src/app/comercial/layout.tsx'))
        expect(comercial).toMatch(/rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"/)
        expect(comercial).toMatch(/fonts\.googleapis\.com\/css2/)
    })

    it('e a política continua permitindo a folha e os arquivos daquela página', () => {
        // Removi o preconnect, não o uso: `/comercial` carrega o CSS por
        // `style-src` e os arquivos por `font-src`. Mexer nesses dois quebraria
        // a landing.
        const csp = buildCspHeader('nonce-teste')
        expect(csp).toMatch(/style-src[^;]*fonts\.googleapis\.com/)
        expect(csp).toMatch(/font-src[^;]*fonts\.gstatic\.com/)
    })

    it('todo host de preconnect do layout raiz está no connect-src', () => {
        // Guard de CLASSE: o defeito não era este host, era a regra. Preconnect
        // novo para origem fora da política volta a virar violação em produção,
        // e o custo de descobrir isso é uma janela de CSP.
        const raiz = ler('src/app/layout.tsx')
        const csp = buildCspHeader('nonce-teste')
        const connectSrc = csp.split(';').find((d) => d.trim().startsWith('connect-src')) ?? ''

        const hosts = [...raiz.matchAll(/rel="(?:preconnect|dns-prefetch)"\s+href="https:\/\/([^"]+)"/g)]
            .map((m) => m[1])

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
