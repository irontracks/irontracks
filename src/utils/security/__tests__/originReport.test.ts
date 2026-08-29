import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
    ACAO_ORIGIN_GUARD,
    MAX_LINHAS_POR_INSTANCIA,
    chaveDoRelato,
    corpoDoEvento,
    deveGravar,
    marcarGravado,
    registrarMismatch,
    _resetParaTeste,
} from '../originReport'

/**
 * A janela de observação do SEC-08 não existia: o mismatch virava só
 * `console.error`, que vive ~1 dia nos runtime logs da Vercel. Medido em
 * 29/08/2026 — busca de 7 dias responde que excede a retenção, 24 h volta
 * vazia, e `audit_events` não tinha nenhuma linha de origin.
 */

const relato = (over: Partial<Parameters<typeof deveGravar>[0]> = {}) => ({
    kind: 'cross-origin',
    originHost: 'evil.example',
    host: 'irontracks.com.br',
    method: 'POST',
    path: '/api/workouts/finish',
    enforced: false,
    ...over,
})

beforeEach(() => {
    _resetParaTeste()
    vi.unstubAllEnvs()
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
})

describe('dedupe — a pergunta é QUAIS origens quebram, não quantas vezes', () => {
    it('o mesmo par só grava uma vez', () => {
        expect(deveGravar(relato())).toBe(true)
        marcarGravado(relato())
        expect(deveGravar(relato())).toBe(false)
    })

    it('origem diferente é relato novo', () => {
        marcarGravado(relato())
        expect(deveGravar(relato({ originHost: 'outra.example' }))).toBe(true)
    })

    it('rota diferente é relato novo — é ela que diz o que quebraria', () => {
        marcarGravado(relato())
        expect(deveGravar(relato({ path: '/api/ai/coach' }))).toBe(true)
    })

    it('o método NÃO abre relato novo: o par é (tipo, origem, rota)', () => {
        // Senão a mesma origem batendo com POST e PUT dobra as linhas sem
        // acrescentar nada à decisão.
        marcarGravado(relato())
        expect(deveGravar(relato({ method: 'PUT' }))).toBe(false)
        expect(chaveDoRelato(relato())).toBe(chaveDoRelato(relato({ method: 'PUT' })))
    })
})

describe('teto por instância', () => {
    it('para de gravar depois do limite, mesmo com pares novos', () => {
        for (let i = 0; i < MAX_LINHAS_POR_INSTANCIA; i += 1) {
            const r = relato({ path: `/api/rota-${i}` })
            expect(deveGravar(r)).toBe(true)
            marcarGravado(r)
        }
        expect(deveGravar(relato({ path: '/api/estourou' }))).toBe(false)
    })
})

describe('o corpo gravado', () => {
    it('usa a ação que a consulta do CLAUDE.md procura', () => {
        expect(corpoDoEvento(relato()).action).toBe(ACAO_ORIGIN_GUARD)
        expect(ACAO_ORIGIN_GUARD).toBe('origin_guard_mismatch')
    })

    it('guarda o que decide a política: tipo, origem, rota e se já bloqueia', () => {
        const m = corpoDoEvento(relato()).metadata
        expect(m).toMatchObject({
            kind: 'cross-origin',
            originHost: 'evil.example',
            path: '/api/workouts/finish',
            enforced: false,
        })
    })

    it('trunca campos longos — a tabela não é depósito', () => {
        const m = corpoDoEvento(relato({ path: '/api/' + 'x'.repeat(500) })).metadata
        expect(m.path.length).toBeLessThanOrEqual(200)
    })

    it('não carrega query string nem cabeçalho', () => {
        // Podem levar dado do usuário para uma tabela que ninguém revisa.
        const chaves = Object.keys(corpoDoEvento(relato()).metadata)
        expect(chaves).not.toContain('query')
        expect(chaves).not.toContain('headers')
        expect(chaves).not.toContain('cookie')
    })
})

describe('registrarMismatch — roda no middleware, NUNCA pode quebrar', () => {
    it('sem credencial não grava e não lança', () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
        const fetchFalso = vi.fn()
        vi.stubGlobal('fetch', fetchFalso)

        expect(() => registrarMismatch(relato())).not.toThrow()
        expect(fetchFalso).not.toHaveBeenCalled()
    })

    it('com credencial, dispara UMA escrita para audit_events', () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'chave')
        const fetchFalso = vi.fn(() => Promise.resolve(new Response(null, { status: 201 })))
        vi.stubGlobal('fetch', fetchFalso)

        registrarMismatch(relato())

        expect(fetchFalso).toHaveBeenCalledTimes(1)
        const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit]
        expect(url).toContain('/rest/v1/audit_events')
        expect(init.method).toBe('POST')
        expect(JSON.parse(String(init.body)).action).toBe(ACAO_ORIGIN_GUARD)
    })

    it('a segunda ocorrência do mesmo par não vai à rede', () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'chave')
        const fetchFalso = vi.fn(() => Promise.resolve(new Response(null, { status: 201 })))
        vi.stubGlobal('fetch', fetchFalso)

        registrarMismatch(relato())
        registrarMismatch(relato())

        expect(fetchFalso).toHaveBeenCalledTimes(1)
    })

    it('rede caindo não derruba a navegação', () => {
        // Um throw aqui viraria 500 no site inteiro — e o app nativo carrega o
        // front deste servidor, então levaria todos os aparelhos junto.
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'chave')
        vi.stubGlobal('fetch', vi.fn(() => { throw new Error('rede fora') }))

        expect(() => registrarMismatch(relato())).not.toThrow()
    })

    it('promessa rejeitada também é silenciosa', () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'chave')
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('recusado'))))

        expect(() => registrarMismatch(relato())).not.toThrow()
    })
})
