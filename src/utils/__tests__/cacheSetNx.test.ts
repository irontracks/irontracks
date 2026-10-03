import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * `cacheSetNxStatus` nunca funcionou em produção (achado em 03/10/2026).
 *
 * Ela fazia `POST /set/<chave>/<valor>?NX=true&EX=<ttl>` SEM corpo. Na API REST
 * do Upstash cada par da query vira argumento do comando — `?EX=100` é
 * `... EX 100` —, então aquilo chegava como `SET chave valor NX true EX 100`:
 * sintaxe inválida, HTTP 400, e a função devolvia `'unavailable'` SEMPRE.
 *
 * Sintomas medidos no banco, todos da mesma causa:
 *   - lembrete de refeição: 75 de 160 avisos duplicados (todo horário redondo
 *     cai em duas passadas do cron, e a trava nunca barrava a segunda);
 *   - like em story: 30 curtidas, ZERO notificações (`cacheSetNx` é fail-closed);
 *   - webhook da RevenueCat: `'unavailable'` responde 503 — todo evento.
 *
 * Nenhum teste pegava porque NENHUM exercitava a função contra o protocolo do
 * Upstash: os testes dos chamadores mockam o módulo inteiro. Este emulador
 * implementa o protocolo como a documentação descreve (comando no caminho, pares
 * da query como argumentos, ou array JSON no corpo para a raiz) e a semântica de
 * `SET ... NX EX`.
 */

const memoria = new Map<string, string>()

function executar(args: string[]): Response {
    const [cmd, ...resto] = args
    if (String(cmd).toLowerCase() !== 'set' || resto.length < 2) {
        return new Response(JSON.stringify({ error: 'ERR unknown command' }), { status: 400 })
    }
    const [chave, valor, ...opcoes] = resto
    let nx = false
    for (let i = 0; i < opcoes.length; i++) {
        const o = String(opcoes[i]).toLowerCase()
        if (o === 'nx') nx = true
        else if (o === 'ex' && /^\d+$/.test(String(opcoes[i + 1] ?? ''))) i++
        else return new Response(JSON.stringify({ error: 'ERR syntax error' }), { status: 400 })
    }
    if (nx && memoria.has(chave)) return new Response(JSON.stringify({ result: null }), { status: 200 })
    memoria.set(chave, String(valor))
    return new Response(JSON.stringify({ result: 'OK' }), { status: 200 })
}

const BASE = 'https://exemplo.upstash.io'

const fetchUpstash = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const corpo = init?.body == null ? null : String(init.body)
    // SDK com auto-pipeline: POST /pipeline com [[cmd, ...args], ...], resposta
    // é a lista de { result } / { error } na mesma ordem.
    if (url.pathname === '/pipeline') {
        const cmds = JSON.parse(corpo ?? '[]') as unknown[][]
        const saidas = await Promise.all(cmds.map(async (c) => {
            const r = executar(c.map(String))
            return (await r.json()) as Record<string, unknown>
        }))
        return new Response(JSON.stringify(saidas), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    // SDK sem pipeline: POST na raiz com o comando como array JSON.
    if (url.pathname === '/' || url.pathname === '') {
        const arr = JSON.parse(corpo ?? '[]') as unknown[]
        return executar(arr.map(String))
    }
    // REST por caminho: /set/a/b + pares da query como argumentos + corpo no fim.
    const args = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    for (const [k, v] of url.searchParams) args.push(k, v)
    if (corpo != null) args.push(corpo)
    return executar(args)
})

vi.mock('@/utils/env', () => ({
    env: { upstash: { get restUrl() { return BASE }, get restToken() { return 'tok' } } },
}))

const avisos: unknown[][] = []
vi.mock('@/lib/logger', () => ({
    logWarn: vi.fn(),
    logError: vi.fn(),
    logInfo: vi.fn(),
    logWarnRemote: (...a: unknown[]) => { avisos.push(a) },
}))

beforeEach(() => {
    memoria.clear()
    avisos.length = 0
    fetchUpstash.mockClear()
    vi.stubGlobal('fetch', fetchUpstash)
    vi.resetModules()
    ;(globalThis as Record<string, unknown>).__irontracksCacheRedis = undefined
})
afterEach(() => { vi.unstubAllGlobals() })

describe('cacheSetNxStatus contra o protocolo do Upstash', () => {
    it('primeira vez cria, segunda acusa duplicata', async () => {
        const { cacheSetNxStatus } = await import('@/utils/cache')
        expect(await cacheSetNxStatus('med-reminder:a:2026-10-03:06:00', '1', 3600)).toBe('set')
        expect(await cacheSetNxStatus('med-reminder:a:2026-10-03:06:00', '1', 3600)).toBe('exists')
        expect(await cacheSetNxStatus('med-reminder:b:2026-10-03:06:00', '1', 3600)).toBe('set')
    })

    it('a variante booleana segue a mesma régua (like de story manda push na 1ª vez)', async () => {
        const { cacheSetNx } = await import('@/utils/cache')
        expect(await cacheSetNx('social:like:push:s:u', '1', 300)).toBe(true)
        expect(await cacheSetNx('social:like:push:s:u', '1', 300)).toBe(false)
    })

    it('Upstash fora devolve "unavailable" E avisa o Sentry (logWarn é mudo em produção)', async () => {
        fetchUpstash.mockImplementationOnce(async () => new Response('boom', { status: 500 }))
        const { cacheSetNxStatus } = await import('@/utils/cache')
        expect(await cacheSetNxStatus('webhook:revenuecat:event:x', '1', 60)).toBe('unavailable')
        expect(avisos.length).toBeGreaterThan(0)
    })
})

describe('a forma da chamada', () => {
    it('não volta a montar opções do SET na query sem corpo', () => {
        const src = readFileSync(join(__dirname, '..', 'cache.ts'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, ' ')
            .replace(/^\s*\/\/.*$/gm, '')
        expect(src).not.toMatch(/\?NX=/)
    })
})
