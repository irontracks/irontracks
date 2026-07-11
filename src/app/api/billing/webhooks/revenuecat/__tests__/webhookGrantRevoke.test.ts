/**
 * Testes do PIPELINE grant/revoke do webhook da RevenueCat
 * (POST /api/billing/webhooks/revenuecat).
 *
 * Contexto: a auditoria de cobertura marcou este handler como UNTESTED — só o
 * auth-guard tinha teste (`__tests__/auth.test.ts`, sobre a lógica pura de
 * comparação de token). Aqui é onde o VIP é CONCEDIDO ou REVOGADO a partir de um
 * evento server-to-server da RevenueCat; é dinheiro real. Estes testes travam os
 * invariantes que, se quebrarem, viram VIP indevido (grátis/vitalício) ou VIP
 * negado a quem pagou.
 *
 * Abordagem: exercitamos o HANDLER POST de verdade, construindo um Request com o
 * header de auth correto e mockando as dependências pesadas/externas
 * (createAdminClient, cache/cacheSetNx, rateLimit, logger, notifyFollowers,
 * waitUntil). A verificação L4 (`revenuecatHasActiveEntitlement`) é inline no
 * módulo e usa `fetch` global + `env.revenuecat.secretKey` — então controlamos o
 * comportamento dela via `process.env` + stub de `fetch`, sem precisar mockar o
 * módulo do route.
 *
 * `env` (src/utils/env.ts) lê `process.env` de forma LAZY (getters). Mas o route
 * captura `WEBHOOK_AUTH_KEY = env.revenuecat.webhookAuthKey.trim()` no load do
 * módulo — por isso setamos a var ANTES do primeiro import do route (topo do
 * arquivo). `secretKey`/`entitlementId` são lidos por-chamada, então dá pra
 * ligar/desligar a verificação L4 por teste.
 *
 * Invariantes travados:
 *  1. (DINHEIRO) Evento ATIVO SEM expiração (RENEWAL malformado) NÃO sobrescreve
 *     valid_until com null — senão o entitlement vira VIP vitalício. Guard ~L331.
 *  2. Mapeamento evento→status: INITIAL_PURCHASE/RENEWAL/UNCANCELLATION/
 *     NON_RENEWING_PURCHASE/PRODUCT_CHANGE → ativo; CANCELLATION → canceled;
 *     EXPIRATION/BILLING_ISSUE → expired; desconhecido → skipped.
 *  3. Auth no nível HTTP: sem/errado Bearer → 401 (exercita o safeEqual real). O
 *     fail-closed de secret ausente e a lógica pura de comparação já estão
 *     cobertos em `auth.test.ts` — não duplicamos aqui, só citamos.
 *  4. Verificação L4: `verified === false` (API confirma que NÃO tem entitlement)
 *     → grant NEGADO, sem escrever no banco; `null` (sem secret / API fora) e
 *     `true` → fail-open, grant segue.
 *  + Bônus: dedup por event.id (cacheSetNx=false → deduped, sem escrita) e
 *     payload inválido / missing event id → 4xx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ── DEVE vir antes do primeiro import do route: em ESM os `import` são içados
//    acima do código de módulo, então setar process.env aqui direto rodaria TARDE
//    demais. vi.hoisted() executa ANTES dos imports — e o route congela
//    WEBHOOK_AUTH_KEY = env.revenuecat.webhookAuthKey.trim() no load. ────────────
const WEBHOOK_SECRET = 'test-webhook-secret'
vi.hoisted(() => {
  process.env.REVENUECAT_WEBHOOK_AUTH_KEY = 'test-webhook-secret'
})

// Dependências pesadas/externas mockadas. env e dbError ficam REAIS (env é lazy
// sobre process.env; dbError só loga + devolve NextResponse genérica).
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/utils/cache', () => ({
  cacheSetNx: vi.fn(async () => true),
  cacheDelete: vi.fn(async () => {}),
}))
vi.mock('@/utils/rateLimit', () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  getRequestIp: vi.fn(() => '203.0.113.7'),
}))
vi.mock('@/lib/logger', () => ({ logWarn: vi.fn(), logError: vi.fn() }))
vi.mock('@/lib/social/notifyFollowers', () => ({ insertNotifications: vi.fn(async () => {}) }))
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))

import { createAdminClient } from '@/utils/supabase/admin'
import { cacheSetNx } from '@/utils/cache'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { POST } from '../route'

// ── Mock encadeável do admin client, no estilo de authRole.test.ts. Roteia por
//    tabela e CAPTURA os payloads de update/insert pra assertar o que foi gravado.
type AdminConfig = {
  plan?: { id: string } | null // resultado de app_plans lookup
  existingSub?: { id: string; status?: string } | null
  existingEnt?: { id: string } | null
  subUpdateError?: unknown
  subInsertError?: unknown
  entUpdError?: unknown
  entInsError?: unknown
}
type Captures = {
  subUpdate: Record<string, unknown> | null
  subInsert: Record<string, unknown> | null
  entUpdate: Record<string, unknown> | null
  entInsert: Record<string, unknown> | null
}

function makeAdmin(config: AdminConfig = {}) {
  const captures: Captures = { subUpdate: null, subInsert: null, entUpdate: null, entInsert: null }
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.in = vi.fn(() => chain)
    chain.order = vi.fn(() => chain)
    chain.limit = vi.fn(() => chain)
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'app_plans') return { data: config.plan ?? null, error: null }
      if (table === 'app_subscriptions') return { data: config.existingSub ?? null }
      if (table === 'user_entitlements') return { data: config.existingEnt ?? null }
      return { data: null }
    })
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      if (table === 'app_subscriptions') captures.subUpdate = payload
      if (table === 'user_entitlements') captures.entUpdate = payload
      // .update(...).eq(...) é terminal e resolve { error }
      return {
        eq: vi.fn(async () => ({
          error: table === 'app_subscriptions' ? (config.subUpdateError ?? null) : (config.entUpdError ?? null),
        })),
      }
    })
    chain.insert = vi.fn(async (payload: Record<string, unknown>) => {
      if (table === 'app_subscriptions') { captures.subInsert = payload; return { error: config.subInsertError ?? null } }
      if (table === 'user_entitlements') { captures.entInsert = payload; return { error: config.entInsError ?? null } }
      return { error: null }
    })
    return chain
  })
  return { client: { from } as never, captures }
}

// ── Helpers de request/resposta ───────────────────────────────────────────────
type EventOverrides = { type?: string; app_user_id?: string; product_id?: string; id?: string; expiration_at_ms?: number | null }
function makeEvent(o: EventOverrides = {}) {
  const ev: Record<string, unknown> = {
    id: o.id ?? 'evt-abc-123',
    type: o.type ?? 'INITIAL_PURCHASE',
    app_user_id: o.app_user_id ?? 'user-1',
    product_id: o.product_id ?? 'vip_pro_monthly',
  }
  if (o.expiration_at_ms !== undefined) ev.expiration_at_ms = o.expiration_at_ms
  return ev
}
function makeRequest(body: unknown, opts: { token?: string | null } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.token !== null) headers.authorization = `Bearer ${opts.token ?? WEBHOOK_SECRET}`
  return new Request('https://irontracks.com.br/api/billing/webhooks/revenuecat', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}
async function callPost(body: unknown, opts?: { token?: string | null }) {
  const res = await POST(makeRequest(body, opts ?? {}))
  const json = (await res.json()) as Record<string, unknown>
  return { status: res.status, json }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(cacheSetNx).mockResolvedValue(true)
  vi.mocked(checkRateLimitAsync).mockResolvedValue({ allowed: true } as never)
  vi.mocked(getRequestIp).mockReturnValue('203.0.113.7')
  // L4 desligada por padrão (sem secret → revenuecatHasActiveEntitlement=null → fail-open)
  delete process.env.REVENUECAT_SECRET_API_KEY
  delete process.env.REVENUECAT_SECRET_KEY
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.REVENUECAT_SECRET_API_KEY
  delete process.env.REVENUECAT_SECRET_KEY
})

// ══════════════════════════════════════════════════════════════════════════════
// Invariante 1 (DINHEIRO): guard do valid_until=null no evento ativo malformado
// ══════════════════════════════════════════════════════════════════════════════
describe('RevenueCat webhook — guard valid_until=null (VIP vitalício)', () => {
  it('RENEWAL ativo SEM expiração NÃO grava valid_until (mantém a janela existente)', async () => {
    const { client, captures } = makeAdmin({
      plan: { id: 'vip_pro' },
      existingSub: { id: 'sub-1', status: 'active' },
      existingEnt: { id: 'ent-1' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    // RENEWAL sem expiration_at_ms → expiresDate = null. O guard ~L331 tem que
    // OMITIR valid_until/current_period_end do update do entitlement.
    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'RENEWAL' }) })

    expect(status).toBe(200)
    expect(json.status).toBe('active')
    expect(captures.entUpdate).not.toBeNull()
    expect(captures.entUpdate!.status).toBe('active')
    // O invariante do dinheiro: nenhuma dessas chaves pode aparecer com null.
    expect('valid_until' in captures.entUpdate!).toBe(false)
    expect('current_period_end' in captures.entUpdate!).toBe(false)
  })

  it('RENEWAL ativo COM expiração grava valid_until = data da expiração (contraprova)', async () => {
    const { client, captures } = makeAdmin({
      plan: { id: 'vip_pro' },
      existingSub: { id: 'sub-1', status: 'active' },
      existingEnt: { id: 'ent-1' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const expMs = Date.UTC(2027, 0, 1) // 2027-01-01
    const { status } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'RENEWAL', expiration_at_ms: expMs }) })

    expect(status).toBe(200)
    expect(captures.entUpdate).not.toBeNull()
    expect(captures.entUpdate!.valid_until).toBe(new Date(expMs).toISOString())
    expect(captures.entUpdate!.current_period_end).toBe(new Date(expMs).toISOString())
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Invariante 2: mapeamento evento → status
// ══════════════════════════════════════════════════════════════════════════════
describe('RevenueCat webhook — mapeamento evento→status', () => {
  const activeTypes = ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE']

  it.each(activeTypes)('%s → targetStatus "active"', async (type) => {
    const { client } = makeAdmin({
      plan: { id: 'vip_pro' },
      existingSub: { id: 'sub-1', status: 'active' },
      existingEnt: { id: 'ent-1' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent({ type, expiration_at_ms: Date.UTC(2027, 0, 1) }) })
    expect(status).toBe(200)
    expect(json).toMatchObject({ ok: true, event: type, status: 'active' })
  })

  it('CANCELLATION → "canceled" e marca cancel_at_period_end', async () => {
    const { client, captures } = makeAdmin({
      plan: { id: 'vip_pro' },
      existingSub: { id: 'sub-1', status: 'active' },
      existingEnt: { id: 'ent-1' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'CANCELLATION' }) })
    expect(json).toMatchObject({ ok: true, status: 'canceled' })
    expect(captures.subUpdate!.cancel_at_period_end).toBe(true)
    // entitlement mapeia canceled → 'cancelled'
    expect(captures.entUpdate!.status).toBe('cancelled')
  })

  it.each(['EXPIRATION', 'BILLING_ISSUE'])('%s → "expired" (entitlement inactive)', async (type) => {
    const { client, captures } = makeAdmin({
      plan: { id: 'vip_pro' },
      existingSub: { id: 'sub-1', status: 'active' },
      existingEnt: { id: 'ent-1' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { json } = await callPost({ api_version: '1.0', event: makeEvent({ type }) })
    expect(json).toMatchObject({ ok: true, status: 'expired' })
    expect(captures.entUpdate!.status).toBe('inactive')
    expect(captures.subUpdate!.cancel_at_period_end).toBe(false)
  })

  it('evento desconhecido (TEST) → skipped, sem tocar no admin client', async () => {
    const createAdmin = vi.mocked(createAdminClient)
    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'TEST' }) })
    expect(status).toBe(200)
    expect(json).toMatchObject({ ok: true, skipped: true })
    expect(createAdmin).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Invariante 3: auth no nível HTTP (safeEqual real). Fail-closed de secret ausente
// e a comparação pura já estão em auth.test.ts — aqui só o comportamento do handler.
// ══════════════════════════════════════════════════════════════════════════════
describe('RevenueCat webhook — auth (handler)', () => {
  it('Bearer errado → 401 unauthorized, sem processar', async () => {
    const createAdmin = vi.mocked(createAdminClient)
    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent() }, { token: 'token-errado' })
    expect(status).toBe(401)
    expect(json).toMatchObject({ ok: false, error: 'unauthorized' })
    expect(createAdmin).not.toHaveBeenCalled()
    expect(cacheSetNx).not.toHaveBeenCalled()
  })

  it('sem header Authorization → 401', async () => {
    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent() }, { token: null })
    expect(status).toBe(401)
    expect(json).toMatchObject({ ok: false, error: 'unauthorized' })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Invariante 4: verificação L4 (revenuecatHasActiveEntitlement)
// ══════════════════════════════════════════════════════════════════════════════
describe('RevenueCat webhook — L4 (confirmação na API RevenueCat)', () => {
  it('verified === false (API confirma que NÃO tem entitlement) → grant NEGADO, sem escrita', async () => {
    process.env.REVENUECAT_SECRET_API_KEY = 'sk-test'
    // subscriber existe mas SEM o entitlement 'vip' → revenuecatHasActiveEntitlement=false
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ subscriber: { entitlements: {} } }) })))

    const { client, captures } = makeAdmin({ plan: { id: 'vip_pro' } })
    const createAdmin = vi.mocked(createAdminClient).mockReturnValue(client)

    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'INITIAL_PURCHASE' }) })

    expect(status).toBe(200)
    expect(json).toMatchObject({ ok: true, skipped: 'not_verified' })
    // Nada foi concedido: admin client nem chegou a ser criado.
    expect(createAdmin).not.toHaveBeenCalled()
    expect(captures.subInsert).toBeNull()
    expect(captures.entInsert).toBeNull()
  })

  it('verified === null (API fora / erro no fetch) → fail-open, grant SEGUE', async () => {
    process.env.REVENUECAT_SECRET_API_KEY = 'sk-test'
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))

    const { client, captures } = makeAdmin({ plan: { id: 'vip_pro' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'INITIAL_PURCHASE', expiration_at_ms: Date.UTC(2027, 0, 1) }) })

    expect(status).toBe(200)
    expect(json).toMatchObject({ ok: true, status: 'active' })
    // grant concedido: inseriu entitlement novo (não havia linha prévia)
    expect(captures.entInsert).not.toBeNull()
    expect(captures.entInsert!.status).toBe('active')
  })

  it('verified === true (entitlement válido na API) → grant SEGUE', async () => {
    process.env.REVENUECAT_SECRET_API_KEY = 'sk-test'
    const future = new Date(Date.UTC(2030, 0, 1)).toISOString()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ subscriber: { entitlements: { vip: { expires_date: future } } } }),
    })))

    const { client, captures } = makeAdmin({ plan: { id: 'vip_pro' }, existingEnt: { id: 'ent-1' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'INITIAL_PURCHASE', expiration_at_ms: Date.UTC(2027, 0, 1) }) })

    expect(status).toBe(200)
    expect(json).toMatchObject({ ok: true, status: 'active' })
    expect(captures.entUpdate).not.toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Bônus: replay protection e validação de payload
// ══════════════════════════════════════════════════════════════════════════════
describe('RevenueCat webhook — dedup e payload', () => {
  it('cacheSetNx=false (replay ou Upstash fora) → deduped, sem criar admin client', async () => {
    vi.mocked(cacheSetNx).mockResolvedValue(false)
    const createAdmin = vi.mocked(createAdminClient)
    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent() })
    expect(status).toBe(200)
    expect(json).toMatchObject({ ok: true, deduped: true })
    expect(createAdmin).not.toHaveBeenCalled()
  })

  it('payload sem event → 400 invalid_payload', async () => {
    const { status, json } = await callPost({ api_version: '1.0' })
    expect(status).toBe(400)
    expect(json).toMatchObject({ ok: false, error: 'invalid_payload' })
  })

  it('event sem id → 400 missing_event_id (mantém o dedup à prova d’água)', async () => {
    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent({ id: '' }) })
    expect(status).toBe(400)
    expect(json).toMatchObject({ ok: false, error: 'missing_event_id' })
  })

  it('rate limit estourado → 429', async () => {
    vi.mocked(checkRateLimitAsync).mockResolvedValue({ allowed: false } as never)
    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent() })
    expect(status).toBe(429)
    expect(json).toMatchObject({ ok: false, error: 'rate_limited' })
  })
})
