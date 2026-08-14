/**
 * Guard da auditoria 2026-08-13 (SEC-02): a exclusão de conta respondia
 * `{ok:true}` sem conferir o retorno de `admin.auth.admin.deleteUser` — o SDK
 * devolve `{ data, error }` em falha esperada (não lança), então o `catch`
 * vazio nunca via nada e a conta seguia ATIVA com o app dizendo "excluída".
 *
 * Invariante: a rota só responde sucesso quando o Auth confirmou a exclusão.
 * Falha (retornada OU lançada) → 500 genérico + evento auditável em
 * `audit_events` (`account_delete_auth_failed`), porque "fulano foi excluído?"
 * precisa de resposta meses depois — log e Sentry expiram, o banco não.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn() }))
vi.mock('@/utils/rateLimit', () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  getRequestIp: vi.fn(() => '1.2.3.4'),
}))

type AuditRow = Record<string, unknown>

function makeAdminMock(deleteUserResult: { data: unknown; error: unknown } | 'throws') {
  const auditInserts: AuditRow[] = []
  const from = vi.fn().mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {}
    const self = vi.fn().mockReturnValue(chain)
    for (const m of ['select', 'delete', 'eq', 'or', 'in', 'limit']) chain[m] = self
    chain.insert = vi.fn().mockImplementation((row: AuditRow) => {
      if (table === 'audit_events') auditInserts.push(row)
      return chain
    })
    // Toda cadeia awaitada resolve vazio e sem erro — o foco do teste é o Auth.
    ;(chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve({ data: [], error: null })
    return chain
  })
  const deleteUser =
    deleteUserResult === 'throws'
      ? vi.fn(async () => {
          throw new Error('fetch failed')
        })
      : vi.fn(async () => deleteUserResult)
  return { from, auth: { admin: { deleteUser } }, auditInserts, deleteUser }
}

async function callRoute(admin: ReturnType<typeof makeAdminMock>) {
  const { createAdminClient } = await import('@/utils/supabase/admin')
  const { createClient } = await import('@/utils/supabase/server')
  vi.mocked(createAdminClient).mockReturnValue(admin as never)
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1', email: 'aluno@x.com' } } }),
    },
  } as never)
  const { POST } = await import('@/app/api/account/delete/route')
  const res = await POST(
    new Request('http://local/api/account/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'EXCLUIR' }),
    })
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('exclusão de conta confere o Auth (SEC-02, auditoria 2026-08-13)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('deleteUser devolve { error } → rota NÃO responde sucesso', async () => {
    const admin = makeAdminMock({
      data: { user: null },
      error: { message: 'Database error deleting user', status: 500 },
    })
    const { status, body } = await callRoute(admin)
    expect(admin.deleteUser).toHaveBeenCalledWith('user-1')
    expect(body.ok, 'a conta segue ATIVA — responder ok:true aqui é mentir para o usuário').toBe(false)
    expect(status).toBe(500)
    // Sem vazar o erro interno do provedor (SEC-05):
    expect(String(body.error)).not.toMatch(/Database error/i)
  })

  it('deleteUser com { error } → grava evento auditável account_delete_auth_failed', async () => {
    const admin = makeAdminMock({
      data: { user: null },
      error: { message: 'Database error deleting user', status: 500 },
    })
    await callRoute(admin)
    const actions = admin.auditInserts.map((r) => r.action)
    expect(actions).toContain('account_delete_auth_failed')
  })

  it('deleteUser LANÇA (rede) → mesma falha auditável, nunca ok:true', async () => {
    const admin = makeAdminMock('throws')
    const { status, body } = await callRoute(admin)
    expect(body.ok).toBe(false)
    expect(status).toBe(500)
    expect(admin.auditInserts.map((r) => r.action)).toContain('account_delete_auth_failed')
  })

  it('deleteUser confirma → ok:true e evento account_deleted', async () => {
    const admin = makeAdminMock({ data: { user: { id: 'user-1' } }, error: null })
    const { status, body } = await callRoute(admin)
    expect(body.ok).toBe(true)
    expect(status).toBe(200)
    expect(admin.auditInserts.map((r) => r.action)).toContain('account_deleted')
  })
})
