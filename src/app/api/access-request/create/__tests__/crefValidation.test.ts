import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '@/utils/supabase/admin'
import { verifyCref } from '@/lib/cref/verifyCref'
import { POST } from '../route'

vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/cref/verifyCref', () => ({ verifyCref: vi.fn() }))
vi.mock('@/utils/rateLimit', () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  getRequestIp: vi.fn(() => '203.0.113.10'),
}))
vi.mock('@/lib/admin/adminNotifications', () => ({ notifyAdminNewSignup: vi.fn(async () => undefined) }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

function emptyQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.ilike.mockReturnValue(query)
  return query
}

describe('access-request/create — validação CREF no servidor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('bloqueia chamada direta quando o CREF não confere', async () => {
    const accessRequests = emptyQuery()
    const profiles = emptyQuery()
    const from = vi.fn((table: string) => (table === 'profiles' ? profiles : accessRequests))
    vi.mocked(createAdminClient).mockReturnValue({ from } as never)
    vi.mocked(verifyCref).mockResolvedValue({
      status: 'invalid',
      canContinue: false,
      normalizedCref: '012345-G/PR',
      message: 'O CREF foi localizado, mas o nome não confere com o cadastro oficial.',
    })

    const response = await POST(new Request('http://localhost/api/access-request/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'professor@example.com',
        phone: '(41) 99999-9999',
        full_name: 'Outra Pessoa',
        role_requested: 'teacher',
        cref: '012345-G/PR',
      }),
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ ok: false, cref_status: 'invalid' })
    expect(verifyCref).toHaveBeenCalledWith('012345-G/PR', 'Outra Pessoa')
    expect(from).toHaveBeenCalledTimes(2)
  })
})
