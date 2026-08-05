import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Ninguém curte o próprio story (achado da auditoria do visualizador, 05/08/2026).
 *
 * A barra de emoji já era escondida para o autor, mas o CORAÇÃO continuava
 * clicável: ele curtia a si mesmo e o contador subia. A tela foi corrigida, e
 * este arquivo trava a defesa que importa — a do SERVIDOR, porque a UI é só a
 * primeira porta e a rota aceita chamada direta.
 *
 * DESCURTIR segue liberado de propósito: já existem curtidas próprias gravadas
 * antes desta regra, e bloquear o DELETE prenderia o usuário nelas.
 */

const ME = '11111111-1111-1111-1111-111111111111'
const OUTRO = '22222222-2222-2222-2222-222222222222'
const STORY = '33333333-3333-3333-3333-333333333333'

/** Quem é o autor do story que o `createAdminClient` vai devolver. */
let authorId = ME
const inserts: unknown[] = []
const deletes: unknown[] = []

vi.mock('@/utils/auth/route', () => ({
  requireUser: async () => ({ ok: true, user: { id: ME }, supabase: authSupabase() }),
}))

vi.mock('@/utils/rateLimit', () => ({
  checkRateLimitAsync: async () => ({ allowed: true }),
  getRequestIp: () => '127.0.0.1',
}))

vi.mock('@/utils/cache', () => ({ cacheSetNx: async () => false }))
vi.mock('@/lib/social/notifyFollowers', () => ({ insertNotifications: async () => undefined }))
vi.mock('@/lib/logger', () => ({ logError: () => undefined, logWarn: () => undefined }))

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { author_id: authorId }, error: null }) }),
      }),
    }),
  }),
}))

/** Client do usuário: registra o que a rota tentou escrever. */
function authSupabase() {
  return {
    from: (table: string) => ({
      insert: async (row: unknown) => { inserts.push({ table, row }); return { error: null } },
      delete: () => ({
        eq: () => ({ eq: async () => { deletes.push({ table }); return { error: null } } }),
      }),
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    }),
  }
}

const post = async (body: Record<string, unknown>) => {
  const { POST } = await import('../route')
  const res = await POST(new Request('http://localhost/api/social/stories/like', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return { status: res.status, json: await res.json() as Record<string, unknown> }
}

beforeEach(() => {
  authorId = ME
  inserts.length = 0
  deletes.length = 0
})

describe('curtir o próprio story', () => {
  it('é recusado com 403 e NÃO grava nada', async () => {
    const { status, json } = await post({ storyId: STORY, like: true })
    expect(status).toBe(403)
    expect(json.error).toBe('own_story')
    expect(inserts).toHaveLength(0)
  })

  it('também é recusado no caminho de TOGGLE (sem `like` no corpo)', async () => {
    // O toggle sem curtida existente cai no INSERT — a mesma escrita, por outra porta.
    const { status, json } = await post({ storyId: STORY })
    expect(status).toBe(403)
    expect(json.error).toBe('own_story')
    expect(inserts).toHaveLength(0)
  })

  it('DESCURTIR o próprio story continua funcionando', async () => {
    const { status } = await post({ storyId: STORY, like: false })
    expect(status).toBe(200)
    expect(deletes).toHaveLength(1)
  })
})

describe('story de outra pessoa segue normal', () => {
  it('curtir grava', async () => {
    authorId = OUTRO
    const { status } = await post({ storyId: STORY, like: true })
    expect(status).toBe(200)
    expect(inserts).toHaveLength(1)
  })

  it('o toggle também grava', async () => {
    authorId = OUTRO
    const { status } = await post({ storyId: STORY })
    expect(status).toBe(200)
    expect(inserts).toHaveLength(1)
  })
})
