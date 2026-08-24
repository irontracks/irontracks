/**
 * A purga da telemetria estava MORTA em produção — e em silêncio.
 *
 * Medido em 24/08/2026 contra a base real: o `.in('id', ids)` do PostgREST
 * aguenta ~300 ids (~11 KB de query string) e falha com 500 (~18 KB); o
 * supabase-js devolve `TypeError: fetch failed` com `code` e `message` VAZIOS,
 * que no log da Vercel virava `[object Object] { stage: 'delete' }`. Como o
 * select traz até 1000 ids (teto do PostgREST, não os 20.000 que a constante
 * anunciava), TODA execução falhava: **10.785 linhas vencidas continuavam na
 * tabela desde 04/08/2026**, numa tabela que já foi metade do banco.
 *
 * ⚠️ A 1ª versão destes casos era source-guard (`.delete().in('id', chunk)`) e
 * passou VERDE com o bug reposto: bastou a mutação manter o NOME da variável e
 * trocar o valor (`const chunk = ids`). Guard que olha nome não mede
 * comportamento — daí o teste abaixo EXERCITAR a rota e medir o tamanho real de
 * cada chamada de delete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { deleteCalls, selectLimits, makeAdmin, state } = vi.hoisted(() => {
  const deleteCalls: number[] = []
  const selectLimits: number[] = []
  const state = { remaining: 0, deleteFailsAt: -1 }

  const makeAdmin = () => ({
    rpc: vi.fn().mockResolvedValue({ error: null }),
    from: (table: string) => {
      if (table === 'audit_events') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return {
        select: () => ({
          lt: () => ({
            limit: (n: number) => {
              selectLimits.push(n)
              // O PostgREST nunca devolve mais que 1000, independente do limit.
              const take = Math.min(n, 1000, state.remaining)
              const data = Array.from({ length: take }, (_, i) => ({ id: `id-${state.remaining - i}` }))
              return Promise.resolve({ data, error: null })
            },
          }),
        }),
        delete: () => ({
          in: (_col: string, ids: string[]) => {
            deleteCalls.push(ids.length)
            if (state.deleteFailsAt >= 0 && deleteCalls.length > state.deleteFailsAt) {
              return Promise.resolve({ error: { message: '', code: '' } })
            }
            state.remaining = Math.max(0, state.remaining - ids.length)
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  })

  return { deleteCalls, selectLimits, makeAdmin, state }
})

vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => makeAdmin() }))
vi.mock('@/utils/cron/auth', () => ({ isCronAuthorized: () => true }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn() }))

import { GET, DELETE_CHUNK, SELECT_PAGE } from '../telemetry-retention/route'

const req = () => new Request('https://irontracks.com.br/api/cron/telemetry-retention')

describe('telemetry-retention — o delete cabe na URL', () => {
  beforeEach(() => {
    deleteCalls.length = 0
    selectLimits.length = 0
    state.remaining = 0
    state.deleteFailsAt = -1
  })

  it('nenhuma chamada de delete passa do bloco medido como seguro', async () => {
    state.remaining = 1000
    const res = await GET(req())
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.purged).toBe(1000)
    expect(deleteCalls.length).toBeGreaterThan(1)
    expect(Math.max(...deleteCalls)).toBeLessThanOrEqual(DELETE_CHUNK)
    // 300 passou na medição, 500 falhou — o teto do bloco fica abaixo disso.
    expect(Math.max(...deleteCalls)).toBeLessThanOrEqual(300)
  })

  it('a soma dos blocos apaga tudo — fatiar não pode perder linha', async () => {
    state.remaining = 777
    const res = await GET(req())
    const json = await res.json()
    expect(deleteCalls.reduce((a, b) => a + b, 0)).toBe(777)
    expect(json.purged).toBe(777)
  })

  it('pagina o select: o teto por execução não cabe num request só', async () => {
    state.remaining = 5000
    await GET(req())
    // `.limit(20_000)` num select devolveria 1000 e a purga andaria 1000/dia.
    expect(selectLimits.length).toBeGreaterThan(1)
    expect(Math.max(...selectLimits)).toBeLessThanOrEqual(SELECT_PAGE)
  })

  it('sem linhas vencidas não apaga nada e responde ok', async () => {
    state.remaining = 0
    const res = await GET(req())
    const json = await res.json()
    expect(deleteCalls.length).toBe(0)
    expect(json).toMatchObject({ ok: true, purged: 0 })
  })

  it('falha no meio preserva o que já saiu — a próxima execução continua', async () => {
    state.remaining = 1000
    state.deleteFailsAt = 2 // 3ª chamada falha
    const res = await GET(req())
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('delete_failed')
    // Antes o erro devolvia `purged: 0` e apagava o rastro do progresso.
    expect(json.purged).toBe(2 * DELETE_CHUNK)
  })

  it('o erro do gateway chega ao log com TEXTO — `[object Object]` não diagnostica', async () => {
    const { logError } = await import('@/lib/logger')
    state.remaining = 500
    state.deleteFailsAt = 0
    await GET(req())

    const extra = (logError as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)?.[2] as Record<string, unknown>
    expect(extra.stage).toBe('delete')
    // `code`/`message` do gateway vêm VAZIOS; o log precisa dizer isso em texto.
    expect(extra.message).toBe('(vazia)')
    expect(extra.code).toBe('(sem code)')
    expect(extra.chunkSize).toBeLessThanOrEqual(DELETE_CHUNK)
  })
})
