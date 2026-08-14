/**
 * Testes do PIPELINE grant/revoke do webhook da RevenueCat
 * (POST /api/billing/webhooks/revenuecat).
 *
 * Aqui é onde o VIP é CONCEDIDO ou REVOGADO a partir de um evento
 * server-to-server da RevenueCat; é dinheiro real. Estes testes travam os
 * invariantes que, se quebrarem, viram VIP indevido (grátis/vitalício) ou VIP
 * negado a quem pagou.
 *
 * ⚠️ Histórico (auditoria de cobranças 14/08/2026, achado A2): a versão anterior
 * deste arquivo CRISTALIZAVA a regra errada — exigia CANCELLATION → 'cancelled'
 * imediato e agrupava BILLING_ISSUE com EXPIRATION. Pela doc da RevenueCat,
 * CANCELLATION é o desligamento da RENOVAÇÃO (acesso segue até expiration_at_ms;
 * só reembolso corta na hora) e BILLING_ISSUE é retry/grace period. A suíte
 * verde protegia o bug. A matriz abaixo segue a semântica corrigida.
 *
 * Invariantes travados:
 *  1. (DINHEIRO) Evento ATIVO SEM expiração não escreve janela null (viraria
 *     VIP vitalício) — nem no entitlement nem na assinatura — e não CRIA linha.
 *  2. Matriz de eventos: ativos → active; CANCELLATION → mantém acesso +
 *     cancel_at_period_end (reembolso CUSTOMER_SUPPORT revoga já); BILLING_ISSUE
 *     → past_due (grace period estende a janela); EXPIRATION → inactive.
 *  3. VOCABULÁRIO de status: só valores que existem nos CHECKs do banco. O bug
 *     real: 'canceled'/'expired' não existem em app_subscriptions_status_check,
 *     o update falhava com 23514 e o evento se perdia (dedup já marcado).
 *  4. Dedup à prova de perda (A3): Upstash fora → 503 (retry), duplicata → 200;
 *     falha de escrita depois de marcar → libera a chave do evento.
 *  5. Escopo por cadeia/tempo (A6): evento antigo ou de outra cadeia de compra
 *     não rebobina a linha atual.
 *  6. lifetime_grant (C5): concessão administrativa vitalícia é intocável.
 *  7. Auth 401 e L4 (grant negado quando a API da RevenueCat desmente o evento).
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
  cacheSetNxStatus: vi.fn(async () => 'set'),
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
import { cacheSetNxStatus, cacheDelete } from '@/utils/cache'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'
import { POST } from '../route'

// Vocabulário aceito pelos CHECKs reais do banco (conferido em produção,
// 14/08/2026). Se um teste capturar um status fora daqui, o update REAL falharia
// com 23514 — não afrouxe a lista, corrija o código.
const DB_SUB_STATUSES = ['pending', 'active', 'past_due', 'cancelled', 'inactive']
const DB_ENT_STATUSES = ['active', 'trialing', 'past_due', 'inactive', 'cancelled', 'revoked']

// ── Mock encadeável do admin client, no estilo de authRole.test.ts. Roteia por
//    tabela e CAPTURA os payloads de update/insert pra assertar o que foi gravado.
//    app_subscriptions tem DUAS consultas (por cadeia, com .contains, e fallback
//    por recência) — o mock distingue pelo uso de .contains. user_entitlements
//    idem, distinguindo pelo .eq('provider_subscription_id', …).
type Row = Record<string, unknown> | null
type AdminConfig = {
  plan?: { id: string } | null // resultado de app_plans lookup
  existingSub?: Row // fallback por recência
  subByChain?: Row // match por metadata.original_transaction_id
  existingEnt?: Row // fallback por recência
  entByProduct?: Row // match por provider_subscription_id=productId
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
    let usedContains = false
    const eqCols: string[] = []
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn((col: string) => { eqCols.push(col); return chain })
    chain.in = vi.fn(() => chain)
    chain.contains = vi.fn(() => { usedContains = true; return chain })
    chain.order = vi.fn(() => chain)
    chain.limit = vi.fn(() => chain)
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'app_plans') return { data: config.plan ?? null, error: null }
      if (table === 'app_subscriptions') {
        return { data: usedContains ? (config.subByChain ?? null) : (config.existingSub ?? null) }
      }
      if (table === 'user_entitlements') {
        return { data: eqCols.includes('provider_subscription_id') ? (config.entByProduct ?? null) : (config.existingEnt ?? null) }
      }
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
type EventOverrides = {
  type?: string
  app_user_id?: string
  product_id?: string
  id?: string
  expiration_at_ms?: number | null
  cancel_reason?: string
  grace_period_expiration_at_ms?: number
  original_transaction_id?: string
  event_timestamp_ms?: number
}
function makeEvent(o: EventOverrides = {}) {
  const ev: Record<string, unknown> = {
    id: o.id ?? 'evt-abc-123',
    type: o.type ?? 'INITIAL_PURCHASE',
    app_user_id: o.app_user_id ?? 'user-1',
    product_id: o.product_id ?? 'vip_pro_monthly',
  }
  if (o.expiration_at_ms !== undefined) ev.expiration_at_ms = o.expiration_at_ms
  if (o.cancel_reason !== undefined) ev.cancel_reason = o.cancel_reason
  if (o.grace_period_expiration_at_ms !== undefined) ev.grace_period_expiration_at_ms = o.grace_period_expiration_at_ms
  if (o.original_transaction_id !== undefined) ev.original_transaction_id = o.original_transaction_id
  if (o.event_timestamp_ms !== undefined) ev.event_timestamp_ms = o.event_timestamp_ms
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
  return { status: res.status, json, headers: res.headers }
}

const EXP_MS = Date.UTC(2027, 0, 1)
const EXP_ISO = new Date(EXP_MS).toISOString()

function baseAdmin(extra: AdminConfig = {}) {
  return makeAdmin({
    plan: { id: 'vip_pro' },
    existingSub: { id: 'sub-1', status: 'active' },
    existingEnt: { id: 'ent-1' },
    ...extra,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(cacheSetNxStatus).mockResolvedValue('set')
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
// Invariante 1 (DINHEIRO): janela null nunca é escrita nem cria linha
// ══════════════════════════════════════════════════════════════════════════════
describe('RevenueCat webhook — guard da janela null (VIP vitalício)', () => {
  it('RENEWAL ativo SEM expiração NÃO grava valid_until nem current_period_end', async () => {
    const { client, captures } = baseAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'RENEWAL' }) })

    expect(status).toBe(200)
    expect(json.status).toBe('active')
    expect(captures.entUpdate).not.toBeNull()
    expect(captures.entUpdate!.status).toBe('active')
    // O invariante do dinheiro: nenhuma dessas chaves pode aparecer com null.
    expect('valid_until' in captures.entUpdate!).toBe(false)
    expect('current_period_end' in captures.entUpdate!).toBe(false)
    // A assinatura tem a MESMA classe de bug: current_period_end null vira
    // acesso sem prazo no fallback legado do resolvedor.
    expect(captures.subUpdate).not.toBeNull()
    expect('current_period_end' in captures.subUpdate!).toBe(false)
  })

  it('RENEWAL ativo COM expiração grava valid_until = data da expiração (contraprova)', async () => {
    const { client, captures } = baseAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { status } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'RENEWAL', expiration_at_ms: EXP_MS }) })

    expect(status).toBe(200)
    expect(captures.entUpdate!.valid_until).toBe(EXP_ISO)
    expect(captures.entUpdate!.current_period_end).toBe(EXP_ISO)
    expect(captures.subUpdate!.current_period_end).toBe(EXP_ISO)
  })

  it('ativação SEM expiração e SEM linha prévia não CRIA assinatura nem entitlement (alerta)', async () => {
    const { client, captures } = makeAdmin({ plan: { id: 'vip_pro' }, existingSub: null, existingEnt: null })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { status } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'INITIAL_PURCHASE' }) })

    expect(status).toBe(200)
    expect(captures.subInsert).toBeNull()
    expect(captures.entInsert).toBeNull()
    expect(vi.mocked(logError)).toHaveBeenCalled()
  })

  it('ativação COM expiração e SEM linha prévia cria assinatura e entitlement com a janela', async () => {
    const { client, captures } = makeAdmin({ plan: { id: 'vip_pro' }, existingSub: null, existingEnt: null })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { status } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'INITIAL_PURCHASE', expiration_at_ms: EXP_MS }) })

    expect(status).toBe(200)
    expect(captures.subInsert!.current_period_end).toBe(EXP_ISO)
    expect(captures.entInsert!.valid_until).toBe(EXP_ISO)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Invariante 2: matriz de eventos (semântica corrigida — A1/A2)
// ══════════════════════════════════════════════════════════════════════════════
describe('RevenueCat webhook — matriz de eventos', () => {
  const activeTypes = ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE']

  it.each(activeTypes)('%s → active', async (type) => {
    const { client, captures } = baseAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent({ type, expiration_at_ms: EXP_MS }) })
    expect(status).toBe(200)
    expect(json).toMatchObject({ ok: true, event: type, status: 'active' })
    expect(captures.subUpdate!.cancel_at_period_end).toBe(false)
  })

  it('CANCELLATION (auto-renew OFF) MANTÉM o acesso até a expiração — não revoga', async () => {
    const { client, captures } = baseAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'CANCELLATION', expiration_at_ms: EXP_MS }) })
    expect(json).toMatchObject({ ok: true, action: 'schedule_cancel', status: 'active' })
    // Assinatura fica ATIVA com cancel_at_period_end; entitlement fica ATIVO
    // com a janela do período já pago — o resolvedor corta sozinho na data.
    expect(captures.subUpdate!.status).toBe('active')
    expect(captures.subUpdate!.cancel_at_period_end).toBe(true)
    expect(captures.subUpdate!.current_period_end).toBe(EXP_ISO)
    expect(captures.entUpdate!.status).toBe('active')
    expect(captures.entUpdate!.valid_until).toBe(EXP_ISO)
  })

  it('CANCELLATION por reembolso (CUSTOMER_SUPPORT) revoga NA HORA', async () => {
    const { client, captures } = baseAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', expiration_at_ms: EXP_MS }) })
    expect(json).toMatchObject({ ok: true, action: 'refund_revoke' })
    expect(captures.subUpdate!.status).toBe('cancelled')
    expect(captures.entUpdate!.status).toBe('cancelled')
  })

  it('BILLING_ISSUE vira past_due e o grace period ESTENDE a janela', async () => {
    const graceMs = Date.UTC(2027, 0, 16)
    const { client, captures } = baseAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'BILLING_ISSUE', grace_period_expiration_at_ms: graceMs }) })
    expect(json).toMatchObject({ ok: true, action: 'past_due' })
    // past_due está na lista aceita pelo resolvedor VIP — o acesso CONTINUA
    // durante o retry da Apple; só EXPIRATION encerra.
    expect(captures.subUpdate!.status).toBe('past_due')
    expect(captures.entUpdate!.status).toBe('past_due')
    expect(captures.entUpdate!.valid_until).toBe(new Date(graceMs).toISOString())
  })

  it('BILLING_ISSUE sem grace period não mexe na janela', async () => {
    const { client, captures } = baseAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    await callPost({ api_version: '1.0', event: makeEvent({ type: 'BILLING_ISSUE' }) })
    expect(captures.entUpdate!.status).toBe('past_due')
    expect('valid_until' in captures.entUpdate!).toBe(false)
  })

  it('EXPIRATION encerra: assinatura e entitlement → inactive', async () => {
    const { client, captures } = baseAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'EXPIRATION', expiration_at_ms: EXP_MS }) })
    expect(json).toMatchObject({ ok: true, action: 'expire' })
    expect(captures.subUpdate!.status).toBe('inactive')
    expect(captures.entUpdate!.status).toBe('inactive')
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
// Invariante 3: vocabulário de status — só o que os CHECKs do banco aceitam.
// O bug real que isto trava: 'canceled'/'expired' não existem no CHECK, o update
// falhava com 23514 e o evento se perdia. Produção ficou com assinaturas Apple
// presas em 'active' vencidas por causa disso.
// ══════════════════════════════════════════════════════════════════════════════
describe('RevenueCat webhook — vocabulário de status compatível com o banco', () => {
  const allTypes = ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE', 'CANCELLATION', 'BILLING_ISSUE', 'EXPIRATION']

  it.each(allTypes)('%s grava statuses que existem nos CHECKs', async (type) => {
    const { client, captures } = baseAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    await callPost({ api_version: '1.0', event: makeEvent({ type, expiration_at_ms: EXP_MS }) })
    expect(captures.subUpdate).not.toBeNull()
    expect(DB_SUB_STATUSES).toContain(captures.subUpdate!.status)
    expect(captures.entUpdate).not.toBeNull()
    expect(DB_ENT_STATUSES).toContain(captures.entUpdate!.status)
  })

  it.each(allTypes)('%s com reembolso/sem reembolso nunca escreve canceled/expired (single-l)', async (type) => {
    const { client, captures } = baseAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    await callPost({ api_version: '1.0', event: makeEvent({ type, cancel_reason: 'CUSTOMER_SUPPORT', expiration_at_ms: EXP_MS }) })
    for (const payload of [captures.subUpdate, captures.entUpdate]) {
      if (!payload) continue
      expect(payload.status).not.toBe('canceled')
      expect(payload.status).not.toBe('expired')
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Invariante 4 (A3): dedup não pode PERDER evento
// ══════════════════════════════════════════════════════════════════════════════
describe('RevenueCat webhook — dedup à prova de perda', () => {
  it('duplicata real → 200 deduped, sem tocar no banco', async () => {
    vi.mocked(cacheSetNxStatus).mockResolvedValue('exists')
    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent({ expiration_at_ms: EXP_MS }) })
    expect(status).toBe(200)
    expect(json).toMatchObject({ ok: true, deduped: true })
    expect(vi.mocked(createAdminClient)).not.toHaveBeenCalled()
  })

  it('Upstash fora → 503 + Retry-After (o provedor REENVIA; antes era 200 e o evento morria)', async () => {
    vi.mocked(cacheSetNxStatus).mockResolvedValue('unavailable')
    const { status, headers } = await callPost({ api_version: '1.0', event: makeEvent({ expiration_at_ms: EXP_MS }) })
    expect(status).toBe(503)
    expect(headers.get('retry-after')).toBeTruthy()
    expect(vi.mocked(createAdminClient)).not.toHaveBeenCalled()
  })

  it('falha de escrita DEPOIS de marcar o dedup libera a chave do evento (retry reprocessa)', async () => {
    const { client } = baseAdmin({ entUpdError: { message: 'db down' } })
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { status } = await callPost({ api_version: '1.0', event: makeEvent({ id: 'evt-777', type: 'RENEWAL', expiration_at_ms: EXP_MS }) })
    expect(status).toBe(500)
    expect(vi.mocked(cacheDelete)).toHaveBeenCalledWith('webhook:revenuecat:event:evt-777')
  })

  it('falha no UPDATE do entitlement (tabela primária do VIP) responde 500, não 200', async () => {
    const { client } = baseAdmin({ entUpdError: { message: 'boom' } })
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { status } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'RENEWAL', expiration_at_ms: EXP_MS }) })
    expect(status).toBe(500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Invariante 5 (A6): evento antigo/de outra cadeia não rebobina a linha atual
// ══════════════════════════════════════════════════════════════════════════════
describe('RevenueCat webhook — escopo por cadeia e por tempo', () => {
  it('evento mais ANTIGO que o último processado na linha é ignorado (stale)', async () => {
    const { client, captures } = baseAdmin({
      existingSub: { id: 'sub-1', status: 'active', metadata: { event_timestamp_ms: 2_000 } },
      existingEnt: { id: 'ent-1', metadata: { event_timestamp_ms: 2_000 } },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'EXPIRATION', event_timestamp_ms: 1_000, expiration_at_ms: EXP_MS }) })
    expect(json).toMatchObject({ sub_skipped: 'stale_event', ent_skipped: 'stale_event' })
    expect(captures.subUpdate).toBeNull()
    expect(captures.entUpdate).toBeNull()
  })

  it('CANCELLATION de uma cadeia ANTIGA não derruba a recompra dona da linha', async () => {
    const { client, captures } = baseAdmin({
      subByChain: null, // a cadeia antiga não tem linha própria
      existingSub: { id: 'sub-nova', status: 'active', metadata: { original_transaction_id: 'OT-NOVA' } },
      existingEnt: { id: 'ent-nova', metadata: { original_transaction_id: 'OT-NOVA' } },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'CANCELLATION', original_transaction_id: 'OT-ANTIGA', expiration_at_ms: EXP_MS }) })
    expect(json).toMatchObject({ sub_skipped: 'foreign_chain', ent_skipped: 'foreign_chain' })
    expect(captures.subUpdate).toBeNull()
    expect(captures.entUpdate).toBeNull()
  })

  it('compra NOVA (grant) pode assumir a linha mesmo vindo de outra cadeia', async () => {
    const { client, captures } = baseAdmin({
      subByChain: null,
      existingSub: { id: 'sub-1', status: 'inactive', metadata: { original_transaction_id: 'OT-ANTIGA' } },
      existingEnt: { id: 'ent-1', metadata: { original_transaction_id: 'OT-ANTIGA' } },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'INITIAL_PURCHASE', original_transaction_id: 'OT-NOVA', expiration_at_ms: EXP_MS }) })
    expect(json).toMatchObject({ ok: true, status: 'active' })
    expect(captures.subUpdate).not.toBeNull()
    expect(captures.subUpdate!.status).toBe('active')
    // A linha registra a cadeia nova — o metadata é MERGE, com os campos novos vencendo.
    expect((captures.subUpdate!.metadata as Record<string, unknown>).original_transaction_id).toBe('OT-NOVA')
  })

  it('linha preferida é a da MESMA cadeia quando ela existe', async () => {
    const { client, captures } = baseAdmin({
      subByChain: { id: 'sub-da-cadeia', status: 'active', metadata: { original_transaction_id: 'OT-1' } },
      existingSub: { id: 'sub-mais-recente', status: 'active' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    await callPost({ api_version: '1.0', event: makeEvent({ type: 'EXPIRATION', original_transaction_id: 'OT-1', expiration_at_ms: EXP_MS }) })
    // O update aconteceu (na linha da cadeia) — sem skip.
    expect(captures.subUpdate).not.toBeNull()
    expect(captures.subUpdate!.status).toBe('inactive')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Invariante 6 (C5): lifetime_grant é intocável pelo webhook
// ══════════════════════════════════════════════════════════════════════════════
describe('RevenueCat webhook — lifetime_grant (concessão administrativa)', () => {
  it.each(['EXPIRATION', 'CANCELLATION', 'RENEWAL'])('%s não altera entitlement com lifetime_grant', async (type) => {
    const { client, captures } = baseAdmin({
      existingEnt: { id: 'ent-review', metadata: { lifetime_grant: true, grant_reason: 'Conta Apple App Review' } },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { json } = await callPost({ api_version: '1.0', event: makeEvent({ type, expiration_at_ms: EXP_MS }) })
    expect(json).toMatchObject({ ent_skipped: 'lifetime_grant' })
    expect(captures.entUpdate).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Metadata é MERGE, não substituição — o paper trail (grant_reason etc.) fica
// ══════════════════════════════════════════════════════════════════════════════
describe('RevenueCat webhook — metadata preservada', () => {
  it('update do entitlement preserva chaves antigas do metadata', async () => {
    const { client, captures } = baseAdmin({
      existingEnt: { id: 'ent-1', metadata: { chave_antiga: 'fica', original_transaction_id: 'OT-1' } },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    await callPost({ api_version: '1.0', event: makeEvent({ type: 'RENEWAL', original_transaction_id: 'OT-1', expiration_at_ms: EXP_MS }) })
    const meta = captures.entUpdate!.metadata as Record<string, unknown>
    expect(meta.chave_antiga).toBe('fica')
    expect(meta.original_transaction_id).toBe('OT-1')
    expect(meta.event_type).toBe('RENEWAL')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Invariante 7: auth e verificação L4
// ══════════════════════════════════════════════════════════════════════════════
describe('RevenueCat webhook — auth e L4', () => {
  it('Bearer errado → 401 sem tocar no banco', async () => {
    const { status } = await callPost({ api_version: '1.0', event: makeEvent() }, { token: 'errado' })
    expect(status).toBe(401)
    expect(vi.mocked(createAdminClient)).not.toHaveBeenCalled()
  })

  it('sem Authorization → 401', async () => {
    const { status } = await callPost({ api_version: '1.0', event: makeEvent() }, { token: null })
    expect(status).toBe(401)
  })

  it('L4: API RevenueCat desmente a ativação → grant negado, sem escrita', async () => {
    process.env.REVENUECAT_SECRET_API_KEY = 'sk-test'
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ subscriber: { entitlements: {} } }),
    })) as never)
    const { client, captures } = baseAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    const { status, json } = await callPost({ api_version: '1.0', event: makeEvent({ type: 'INITIAL_PURCHASE', expiration_at_ms: EXP_MS }) })
    expect(status).toBe(200)
    expect(json).toMatchObject({ ok: true, skipped: 'not_verified' })
    expect(captures.subUpdate).toBeNull()
    expect(captures.entUpdate).toBeNull()
  })

  it('payload sem event.id → 400 (dedup estanque)', async () => {
    const ev = makeEvent()
    delete (ev as Record<string, unknown>).id
    const { status, json } = await callPost({ api_version: '1.0', event: ev })
    expect(status).toBe(400)
    expect(json).toMatchObject({ ok: false, error: 'missing_event_id' })
  })
})
