import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCspHeader } from '@/utils/security/headers'

/**
 * `preconnect` é regido por `connect-src` — e o layout do app apontava para
 * `fonts.googleapis.com`, que não está lá.
 *
 * Apareceu como violação REAL em produção em 28/08/2026, um dia depois de o CSP
 * entrar em modo bloqueante. A saída foi REMOVER, não liberar: a Inter vem de
 * `next/font/google`, que a self-hospeda no build, então o app não pede nada ao
 * Google em runtime. Quem usa Google Fonts é a landing, com os próprios
 * preconnects.
 *
 * ⚠️ O que renderiza numa página do app é a SOMA de layouts: o raiz
 * (`src/app/layout.tsx`, que envolve landing E app) + o do app
 * (`src/app/app/layout.tsx`). Na fase 3 da migração raiz↔/comercial
 * (26/09/2026) este guard olhava só o do app — e o CSS e as fontes da landing
 * foram parar no RAIZ, vazando para todas as páginas do app em produção:
 * `html, body { height: auto !important }` por cima do `height: 100%` do app e
 * o `preconnect` do Google de volta. O guard ficou verde com o defeito no ar.
 * Hoje ele cobra os DOIS layouts que o app herda.
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (f: string) =>
    f.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const RAIZ = 'src/app/layout.tsx'
const APP = 'src/app/app/layout.tsx'
const LANDING = 'src/app/(landing)/layout.tsx'
/** Tudo que o navegador recebe numa página do app. */
const HERDADOS_PELO_APP = [RAIZ, APP]

const PRECONNECT_GOOGLE = /rel="(preconnect|dns-prefetch)"\s+href="https:\/\/fonts\.(googleapis|gstatic)\.com"/

describe('preconnect e CSP não podem se contradizer', () => {
    it.each(HERDADOS_PELO_APP)('%s não faz preconnect para as fontes do Google', (rel) => {
        expect(
            semComentarios(ler(rel)),
            '`preconnect` cai em connect-src: ou a origem entra na política, ou o link sai',
        ).not.toMatch(PRECONNECT_GOOGLE)
    })

    it.each(HERDADOS_PELO_APP)('%s não carrega a folha do Google Fonts', (rel) => {
        // A folha passa no CSP (style-src permite), mas é IP de usuário do app
        // entregue ao Google a cada abertura — o motivo de o app ter removido.
        expect(semComentarios(ler(rel))).not.toMatch(/fonts\.googleapis\.com\/css2/)
    })

    it('a landing continua com os dela — é quem usa Google Fonts de verdade', () => {
        const landing = semComentarios(ler(LANDING))
        expect(landing).toMatch(/rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"/)
        expect(landing).toMatch(/fonts\.googleapis\.com\/css2/)
    })

    it('e a política continua permitindo a folha e os arquivos daquela página', () => {
        // Removi o preconnect, não o uso: a landing carrega o CSS por
        // `style-src` e os arquivos por `font-src`. Mexer nesses dois quebraria
        // a landing.
        const csp = buildCspHeader('nonce-teste')
        expect(csp).toMatch(/style-src[^;]*fonts\.googleapis\.com/)
        expect(csp).toMatch(/font-src[^;]*fonts\.gstatic\.com/)
    })

    it('todo host de preconnect que chega ao app está no connect-src', () => {
        // Guard de CLASSE: o defeito não era um host, era a regra. Preconnect
        // novo para origem fora da política volta a virar violação em produção.
        const csp = buildCspHeader('nonce-teste')
        const connectSrc = csp.split(';').find((d) => d.trim().startsWith('connect-src')) ?? ''

        const hosts = HERDADOS_PELO_APP.flatMap((rel) =>
            [...ler(rel).matchAll(/rel="(?:preconnect|dns-prefetch)"\s+href="https:\/\/([^"]+)"/g)].map((m) => m[1]),
        )
        expect(hosts.length, 'este teste só faz sentido se houver preconnect no app').toBeGreaterThan(0)

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

describe('o layout raiz não carrega nada de um lado só', () => {
    /**
     * O raiz envolve landing E app. CSS global escrito ali vale para os dois —
     * foi assim que `html, body { height: auto !important }` da landing chegou
     * a todas as páginas do app. CSS de um lado mora no layout daquele lado.
     */
    const raiz = semComentarios(ler(RAIZ))

    it('sem <style> nem dangerouslySetInnerHTML no raiz', () => {
        expect(raiz).not.toMatch(/<style[\s>]/)
        expect(raiz).not.toMatch(/dangerouslySetInnerHTML/)
    })

    it('sem import de folha de estilo no raiz', () => {
        expect(raiz).not.toMatch(/^import\s+['"][^'"]+\.css['"]/m)
    })

    it('o override de altura da landing mora só no layout da landing', () => {
        // Ancorado no que FICA (o layout da landing precisa dele: ela rola o
        // documento), não só no que sai.
        expect(semComentarios(ler(LANDING))).toMatch(/height:\s*auto\s*!important/)
        for (const rel of HERDADOS_PELO_APP) {
            expect(semComentarios(ler(rel)), rel).not.toMatch(/height:\s*auto\s*!important/)
        }
    })
})
