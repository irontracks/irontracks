import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper functions extracted from billing/webhooks/revenuecat/route.ts
// for isolated testing without Next.js runtime dependencies.
// Keep in sync with the implementation in route.ts.
// ─────────────────────────────────────────────────────────────────────────────

const resolveDbPlanId = (productId: string): string => {
  const s = String(productId || '').trim().toLowerCase()
  if (!s) return s
  const withAnnual = s
    .replace(/\d+_yearly$/, '_annual')
    .replace(/\d+_year$/, '_annual')
    .replace(/_yearly$/, '_annual')
    .replace(/_year$/, '_annual')
  if (withAnnual !== s) return withAnnual
  return s
    .replace(/\d+_monthly$/, '')
    .replace(/\d+_month$/, '')
    .replace(/_monthly$/, '')
    .replace(/_month$/, '')
    .replace(/_mensal$/, '')
}

const ACTIVE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
])

const INACTIVE_EVENTS = new Set([
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
])

const resolveTargetStatus = (eventType: string): 'active' | 'canceled' | 'expired' | null => {
  const t = String(eventType || '').toUpperCase()
  if (ACTIVE_EVENTS.has(t)) return 'active'
  if (INACTIVE_EVENTS.has(t)) return t === 'CANCELLATION' ? 'canceled' : 'expired'
  return null
}

const resolveExpiresDate = (expiresMs: number | null | undefined): string | null => {
  if (expiresMs == null || !Number.isFinite(expiresMs)) return null
  return new Date(expiresMs).toISOString()
}

const resolveEntitlementStatus = (target: 'active' | 'canceled' | 'expired'): 'active' | 'cancelled' | 'inactive' => {
  if (target === 'active') return 'active'
  if (target === 'canceled') return 'cancelled'
  return 'inactive'
}

interface RevenueCatPayload {
  api_version?: string
  event?: { type?: string; app_user_id?: string; product_id?: string } & Record<string, unknown>
}

const isValidPayload = (body: RevenueCatPayload | null | undefined): boolean => {
  const ev = body?.event
  return !!(ev && typeof ev.type === 'string' && ev.type.length > 0
    && typeof ev.app_user_id === 'string' && ev.app_user_id.length > 0)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('resolveDbPlanId', () => {
  it('mapeia product yearly variants para _annual', () => {
    expect(resolveDbPlanId('vip_pro_yearly')).toBe('vip_pro_annual')
    expect(resolveDbPlanId('vip_pro_year')).toBe('vip_pro_annual')
    // Apple/RevenueCat usa padrão sem underscore antes do número: vip_pro12_yearly
    expect(resolveDbPlanId('vip_pro12_yearly')).toBe('vip_pro_annual')
    expect(resolveDbPlanId('vip_pro1_year')).toBe('vip_pro_annual')
  })

  it('remove sufixos monthly do produto', () => {
    expect(resolveDbPlanId('vip_pro_monthly')).toBe('vip_pro')
    expect(resolveDbPlanId('vip_pro_month')).toBe('vip_pro')
    expect(resolveDbPlanId('vip_pro1_monthly')).toBe('vip_pro')
    expect(resolveDbPlanId('vip_pro_mensal')).toBe('vip_pro')
  })

  it('lowercase + trim do input', () => {
    expect(resolveDbPlanId('  VIP_PRO_YEARLY  ')).toBe('vip_pro_annual')
  })

  it('retorna empty para entradas vazias ou nulas', () => {
    expect(resolveDbPlanId('')).toBe('')
    expect(resolveDbPlanId(null as unknown as string)).toBe('')
    expect(resolveDbPlanId(undefined as unknown as string)).toBe('')
  })

  it('retorna o id intacto se não bate com nenhum padrão conhecido', () => {
    expect(resolveDbPlanId('vip_pro')).toBe('vip_pro')
    expect(resolveDbPlanId('lifetime')).toBe('lifetime')
  })
})

describe('resolveTargetStatus', () => {
  it('mapeia eventos ativos para "active"', () => {
    expect(resolveTargetStatus('INITIAL_PURCHASE')).toBe('active')
    expect(resolveTargetStatus('RENEWAL')).toBe('active')
    expect(resolveTargetStatus('UNCANCELLATION')).toBe('active')
    expect(resolveTargetStatus('NON_RENEWING_PURCHASE')).toBe('active')
    expect(resolveTargetStatus('PRODUCT_CHANGE')).toBe('active')
  })

  it('CANCELLATION → "canceled"', () => {
    expect(resolveTargetStatus('CANCELLATION')).toBe('canceled')
  })

  it('EXPIRATION e BILLING_ISSUE → "expired"', () => {
    expect(resolveTargetStatus('EXPIRATION')).toBe('expired')
    expect(resolveTargetStatus('BILLING_ISSUE')).toBe('expired')
  })

  it('eventos não tratados → null (TEST, SUBSCRIBER_ALIAS, etc)', () => {
    expect(resolveTargetStatus('TEST')).toBeNull()
    expect(resolveTargetStatus('SUBSCRIBER_ALIAS')).toBeNull()
    expect(resolveTargetStatus('TRANSFER')).toBeNull()
    expect(resolveTargetStatus('')).toBeNull()
  })

  it('é case-insensitive', () => {
    expect(resolveTargetStatus('initial_purchase')).toBe('active')
    expect(resolveTargetStatus('Cancellation')).toBe('canceled')
  })
})

describe('resolveExpiresDate', () => {
  it('converte ms timestamp em ISO string', () => {
    const ms = Date.UTC(2026, 5, 1, 12, 0, 0)
    expect(resolveExpiresDate(ms)).toBe(new Date(ms).toISOString())
  })

  it('retorna null para valores ausentes ou inválidos', () => {
    expect(resolveExpiresDate(null)).toBeNull()
    expect(resolveExpiresDate(undefined)).toBeNull()
    expect(resolveExpiresDate(NaN)).toBeNull()
    expect(resolveExpiresDate(Infinity)).toBeNull()
  })
})

describe('resolveEntitlementStatus', () => {
  it('mapeia target → entitlement status', () => {
    expect(resolveEntitlementStatus('active')).toBe('active')
    expect(resolveEntitlementStatus('canceled')).toBe('cancelled')
    expect(resolveEntitlementStatus('expired')).toBe('inactive')
  })
})

describe('isValidPayload', () => {
  it('aceita payloads completos', () => {
    expect(isValidPayload({
      api_version: '1.0',
      event: { type: 'INITIAL_PURCHASE', app_user_id: 'user_123', product_id: 'vip_pro' },
    })).toBe(true)
  })

  it('rejeita payloads sem event', () => {
    expect(isValidPayload({})).toBe(false)
    expect(isValidPayload(null)).toBe(false)
    expect(isValidPayload(undefined)).toBe(false)
  })

  it('rejeita event sem type ou app_user_id', () => {
    expect(isValidPayload({ event: { app_user_id: 'user_123' } })).toBe(false)
    expect(isValidPayload({ event: { type: 'INITIAL_PURCHASE' } })).toBe(false)
    expect(isValidPayload({ event: { type: '', app_user_id: 'user_123' } })).toBe(false)
    expect(isValidPayload({ event: { type: 'INITIAL_PURCHASE', app_user_id: '' } })).toBe(false)
  })
})
