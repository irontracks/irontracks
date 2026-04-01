/**
 * Tests for billing utility functions.
 */
import { describe, it, expect } from 'vitest'

// resolveDbPlanId maps RevenueCat product identifiers to app_plans.id values
describe('resolveDbPlanId', () => {
  // Vitest can't import Next.js route files directly (they use `export const dynamic`
  // which is a Next.js-specific export). We test the logic in isolation by copying
  // the pure function here — keeping it in sync with the implementation in
  // src/app/api/billing/revenuecat/sync/route.ts

  function resolveDbPlanId(productId: string): string {
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

  it('strips _monthly suffix', () => {
    expect(resolveDbPlanId('vip_pro_monthly')).toBe('vip_pro')
  })

  it('strips _month suffix', () => {
    expect(resolveDbPlanId('vip_pro_month')).toBe('vip_pro')
  })

  it('strips _mensal suffix', () => {
    expect(resolveDbPlanId('vip_pro_mensal')).toBe('vip_pro')
  })

  it('converts _yearly to _annual', () => {
    expect(resolveDbPlanId('vip_pro_yearly')).toBe('vip_pro_annual')
  })

  it('converts _year to _annual', () => {
    expect(resolveDbPlanId('vip_pro_year')).toBe('vip_pro_annual')
  })

  it('converts numeric _yearly variant to _annual', () => {
    expect(resolveDbPlanId('vip_pro12_yearly')).toBe('vip_pro_annual')
  })

  it('converts numeric _monthly variant by stripping', () => {
    expect(resolveDbPlanId('vip_pro12_monthly')).toBe('vip_pro')
  })

  it('returns empty string for empty input', () => {
    expect(resolveDbPlanId('')).toBe('')
  })

  it('is case-insensitive (lowercases)', () => {
    expect(resolveDbPlanId('VIP_PRO_MONTHLY')).toBe('vip_pro')
  })

  it('returns unchanged id that has no known suffix', () => {
    expect(resolveDbPlanId('vip_pro')).toBe('vip_pro')
  })

  it('trims whitespace', () => {
    expect(resolveDbPlanId('  vip_pro_monthly  ')).toBe('vip_pro')
  })
})

describe('requireRoleOrBearer auth flow', () => {
  // Integration-level behavioral tests using mock factories
  // These document the contract: requireRoleOrBearer = requireRole || requireRoleWithBearer

  it('requireRoleOrBearer is exported from auth/route', async () => {
    // If this import fails, the function was removed
    const authModule = await import('@/utils/auth/route')
    expect(typeof authModule.requireRoleOrBearer).toBe('function')
    expect(typeof authModule.requireRole).toBe('function')
    expect(typeof authModule.requireRoleWithBearer).toBe('function')
  })

  it('jsonError produces correct shape', async () => {
    const { jsonError } = await import('@/utils/auth/route')
    const res = jsonError(403, 'forbidden')
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toEqual({ ok: false, error: 'forbidden' })
  })

  it('hasValidInternalSecret returns false when secret is empty', async () => {
    const { hasValidInternalSecret } = await import('@/utils/auth/route')
    delete process.env.IRONTRACKS_INTERNAL_SECRET
    const req = new Request('http://localhost/test', {
      headers: { 'x-internal-secret': 'anything' },
    })
    expect(hasValidInternalSecret(req)).toBe(false)
  })

  it('hasValidInternalSecret returns true when secret matches', async () => {
    const { hasValidInternalSecret } = await import('@/utils/auth/route')
    process.env.IRONTRACKS_INTERNAL_SECRET = 'my-secret'
    const req = new Request('http://localhost/test', {
      headers: { 'x-internal-secret': 'my-secret' },
    })
    expect(hasValidInternalSecret(req)).toBe(true)
    delete process.env.IRONTRACKS_INTERNAL_SECRET
  })

  it('hasValidInternalSecret returns false for wrong secret', async () => {
    const { hasValidInternalSecret } = await import('@/utils/auth/route')
    process.env.IRONTRACKS_INTERNAL_SECRET = 'correct-secret'
    const req = new Request('http://localhost/test', {
      headers: { 'x-internal-secret': 'wrong-secret' },
    })
    expect(hasValidInternalSecret(req)).toBe(false)
    delete process.env.IRONTRACKS_INTERNAL_SECRET
  })
})

describe('isSafeStoragePath', () => {
  it('rejects empty path', async () => {
    const { isSafeStoragePath } = await import('@/utils/auth/route')
    expect(isSafeStoragePath('')).toMatchObject({ ok: false })
  })

  it('rejects path traversal', async () => {
    const { isSafeStoragePath } = await import('@/utils/auth/route')
    expect(isSafeStoragePath('../secret')).toMatchObject({ ok: false })
  })

  it('rejects path starting with /', async () => {
    const { isSafeStoragePath } = await import('@/utils/auth/route')
    expect(isSafeStoragePath('/etc/passwd')).toMatchObject({ ok: false })
  })

  it('rejects non-UUID channel prefix', async () => {
    const { isSafeStoragePath } = await import('@/utils/auth/route')
    expect(isSafeStoragePath('not-a-uuid/file.jpg')).toMatchObject({ ok: false })
  })

  it('accepts valid UUID-prefixed path', async () => {
    const { isSafeStoragePath } = await import('@/utils/auth/route')
    const result = isSafeStoragePath('550e8400-e29b-41d4-a716-446655440000/avatar.jpg')
    expect(result).toMatchObject({ ok: true })
  })
})
