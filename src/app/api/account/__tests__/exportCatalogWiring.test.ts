/**
 * Fiação do export LGPD (SEC-03): o motor da rota precisa EXECUTAR uma query
 * para cada entrada 'own' e 'via' do catálogo — catálogo certo + motor certo
 * já falharam separados em outras áreas (lição nº 3 do CLAUDE.md: as pontas
 * corretas e ninguém ligando as duas).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/auth/route', () => ({ requireUser: vi.fn() }))
vi.mock('@/utils/rateLimit', () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  getRequestIp: vi.fn(() => '1.2.3.4'),
}))

import { USER_DATA_CATALOG } from '@/lib/account/userDataCatalog'

function makeUserClient() {
  const queriedTables: string[] = []
  const from = vi.fn().mockImplementation((table: string) => {
    queriedTables.push(table)
    const chain: Record<string, unknown> = {}
    const self = vi.fn().mockReturnValue(chain)
    for (const m of ['select', 'eq', 'or', 'in', 'limit']) chain[m] = self
    ;(chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
      // Uma linha com id — mantém as cadeias 'via' resolvíveis (mãe com filhos).
      resolve({ data: [{ id: 'row-1' }], error: null })
    return chain
  })
  return { from, queriedTables }
}

describe('export LGPD consome o catálogo inteiro (SEC-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('toda entrada own/via gera query; skip não gera e sai listada com motivo', async () => {
    const client = makeUserClient()
    const { requireUser } = await import('@/utils/auth/route')
    vi.mocked(requireUser).mockResolvedValue({
      ok: true,
      user: { id: 'user-1', email: 'x@y.z', created_at: '2026-01-01' },
      supabase: client,
    } as never)

    const { GET } = await import('@/app/api/account/export/route')
    const res = await GET(new Request('http://local/api/account/export'))
    const body = (await res.json()) as { ok: boolean; data: Record<string, unknown[]>; skipped: Record<string, string> }
    expect(body.ok).toBe(true)

    for (const [table, entry] of Object.entries(USER_DATA_CATALOG)) {
      if (entry.export.kind === 'skip') {
        expect(client.queriedTables, `'${table}' é skip e não deveria ser consultada`).not.toContain(table)
        expect(body.skipped[table], `'${table}' pulada sem motivo no payload`).toBeTruthy()
      } else {
        expect(client.queriedTables, `'${table}' está no catálogo e o motor não a consultou`).toContain(table)
        expect(body.data[table], `'${table}' consultada mas fora do payload`).toBeDefined()
      }
    }
  })
})
