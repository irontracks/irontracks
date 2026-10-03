import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it, expect } from 'vitest'

import { caminhoDoApp, PREFIXOS_DO_APP } from '@/utils/navigation/appPath'

/**
 * "Sair" abria o Safari no iPhone e a conta seguia logada no app (02/10/2026).
 *
 * O app nativo carrega `server.url = https://irontracks.com.br/app`, e o
 * Capacitor iOS só mantém dentro do app a navegação cujo endereço COMEÇA com
 * esse texto (`WebViewDelegationHandler`: `navURL.absoluteString.starts(with:
 * bridge.config.serverURL.absoluteString)`). O resto vai para o Safari — mesmo
 * no mesmo domínio. `window.location.href = '/auth/logout'` caía fora.
 *
 * A regra abaixo é a MESMA do Swift, lida do `capacitor.config.ts` real: se o
 * server.url mudar, o teste muda junto.
 */

const RAIZ = join(__dirname, '..', '..', '..', '..')
const SRC = join(RAIZ, 'src')
const cap = readFileSync(join(RAIZ, 'capacitor.config.ts'), 'utf8')
const SERVER_URL = /'(https:\/\/irontracks\.com\.br[^']*)'/.exec(cap)?.[1] ?? ''
const ORIGEM = new URL(SERVER_URL).origin
const ficaNoApp = (destino: string) => new URL(destino, SERVER_URL).toString().startsWith(SERVER_URL)

describe('a regra do Capacitor, aplicada ao destino', () => {
    it('o server.url do app nativo tem caminho — é ele que torna a regra estrita', () => {
        expect(SERVER_URL).toBe('https://irontracks.com.br/app')
        // O defeito em uma linha: mesmo domínio, fora do app.
        expect(ficaNoApp('/auth/logout')).toBe(false)
    })

    it('todo destino do app, depois de caminhoDoApp, fica dentro do app', () => {
        for (const p of PREFIXOS_DO_APP) {
            for (const d of [p, `${p}/x`, `${p}?next=/dashboard`]) {
                expect(ficaNoApp(caminhoDoApp(d)), d).toBe(true)
            }
        }
        expect(ficaNoApp(caminhoDoApp('/auth/logout'))).toBe(true)
        expect(ficaNoApp(caminhoDoApp(`${ORIGEM}/dashboard?_r=1`, ORIGEM))).toBe(true)
    })

    it('a raiz é a landing — para o app ela é /app', () => {
        expect(caminhoDoApp('/')).toBe('/app')
        expect(caminhoDoApp('/?next=/dashboard')).toBe('/app?next=/dashboard')
    })

    it('preserva consulta e âncora, e não toca no que já está certo ou é de fora', () => {
        expect(caminhoDoApp('/dashboard?tab=profile#x')).toBe('/app/dashboard?tab=profile#x')
        expect(caminhoDoApp('/app/dashboard')).toBe('/app/dashboard')
        expect(caminhoDoApp('/api/x')).toBe('/api/x')
        expect(caminhoDoApp('/rotas-novas')).toBe('/rotas-novas')  // '/r' casa só segmento inteiro
        expect(caminhoDoApp('https://www.mercadopago.com.br/x', ORIGEM)).toBe('https://www.mercadopago.com.br/x')
        expect(caminhoDoApp('mailto:a@b.c', ORIGEM)).toBe('mailto:a@b.c')
    })
})

describe('a lista de prefixos acompanha os rewrites', () => {
    it('todo rewrite /x → /app/x do next.config tem prefixo aqui, e vice-versa', () => {
        const cfg = readFileSync(join(RAIZ, 'next.config.ts'), 'utf8')
        const fontes = [...cfg.matchAll(/source: '(\/[^':]+?)(?:\/:path\*|\/:\w+)?',\s*destination: '\/app\//g)]
            .map((m) => m[1])
        expect(fontes.length).toBeGreaterThan(10)
        expect([...new Set(fontes)].sort()).toEqual([...PREFIXOS_DO_APP].sort())
    })
})

// ── Classe: navegação de página inteira para rota do app sem /app ───────────

const executavel = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

function arquivos(dir: string): string[] {
    const out: string[] = []
    for (const nome of readdirSync(dir)) {
        const p = join(dir, nome)
        if (statSync(p).isDirectory()) {
            if (nome === '__tests__' || nome === 'node_modules') continue
            out.push(...arquivos(p))
        } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
            out.push(p)
        }
    }
    return out
}

const PREF = PREFIXOS_DO_APP.map((p) => p.slice(1).replace('-', '\\-')).join('|')

describe('a classe, varrida em src/', () => {
    const todos = arquivos(SRC).map((p) => ({ rel: relative(SRC, p), codigo: executavel(readFileSync(p, 'utf8')) }))

    it('window.location não recebe caminho cru do app (nem a raiz)', () => {
        // Literal começando com "/" que não seja "/app": "/dashboard", "/auth/…",
        // "/?next=…". `caminhoDoApp(...)`/`navegarNoApp(...)` não casam aqui.
        const padrao = new RegExp(`location\\.(?:href\\s*=\\s*|replace\\(\\s*|assign\\(\\s*)\\(?\\s*['"\`]/(?!app\\b|/)`)
        const culpados = todos.filter(({ codigo }) => padrao.test(codigo)).map(({ rel }) => rel)
        expect(culpados, 'use navegarNoApp()/caminhoDoApp() — fora de /app o iPhone abre o Safari').toEqual([])
    })

    it('link de navegação completa para rota do app não usa o caminho cru', () => {
        // `<a>` cru sempre recarrega a página. `<Link>` só recarrega quando o
        // destino é route handler — no app, os de `/auth/*` (login, logout,
        // callback). `<Link>` para PÁGINA navega por dentro do Next e não passa
        // pelo filtro do Capacitor, por isso fica de fora (acusá-lo seria o
        // jeito nº 8 de guard falso: largo demais).
        const anchorCru = new RegExp(`<a\\b[^>]*?href=\\{?\\s*['"\`]/(?:${PREF})(?:[/?#'"\`])`)
        const rotaDeAuth = /href=\{?\s*['"`]\/auth\//
        const culpados = todos
            .filter(({ rel }) => rel.endsWith('.tsx'))
            .filter(({ codigo }) => anchorCru.test(codigo) || rotaDeAuth.test(codigo))
            .map(({ rel }) => rel)
        expect(culpados).toEqual([])
    })

    it('destino montado com new URL(... window.location.origin) passa por caminhoDoApp', () => {
        const padrao = new RegExp(`new URL\\(\\s*['"\`]/(?:${PREF})[^'"\`]*['"\`]\\s*,\\s*window\\.location\\.origin`)
        const culpados = todos.filter(({ codigo }) => padrao.test(codigo)).map(({ rel }) => rel)
        expect(culpados).toEqual([])
    })

    it('o sair da conta e o recarregar passam pelo ajudante', () => {
        const handlers = executavel(readFileSync(join(SRC, 'hooks/useAppHandlers.ts'), 'utf8'))
        expect(handlers).toMatch(/navegarNoApp\(\s*'\/auth\/logout'/)
        const refresh = executavel(readFileSync(join(SRC, 'utils/app/hardRefresh.ts'), 'utf8'))
        expect(refresh).toMatch(/location\.replace\(\s*caminhoDoApp\(/)
        // HTML devolvido pelo callback de OAuth navega por JS: o destino também.
        const callback = executavel(readFileSync(join(SRC, 'app/app/auth/callback/route.ts'), 'utf8'))
        expect(callback).toMatch(/caminhoDoApp\(safeNext\)/)
    })
})
