import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers and constants extracted from vip/limits.ts for isolated testing.
// ─────────────────────────────────────────────────────────────────────────────

type VipTierLimits = {
  chat_daily: number
  wizard_weekly: number
  insights_weekly: number
  history_days: number | null
  nutrition_macros: boolean
  analytics: boolean
  offline: boolean
  chef_ai: boolean
}

const FREE_LIMITS: VipTierLimits = {
  chat_daily: 0,
  wizard_weekly: 0,
  insights_weekly: 0,
  history_days: 30,
  nutrition_macros: false,
  analytics: false,
  offline: false,
  chef_ai: false,
}

const UNLIMITED_LIMITS: VipTierLimits = {
  chat_daily: 9999,
  wizard_weekly: 9999,
  insights_weekly: 9999,
  history_days: null,
  nutrition_macros: true,
  analytics: true,
  offline: true,
  chef_ai: true,
}

const normalizePlanId = (raw: unknown) => {
  try {
    const base = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
    if (!base) return null
    const cleaned = base.replace(/[^a-z0-9_]/g, '')
    return cleaned || null
  } catch {
    return null
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('VIP Tier Limits constants', () => {
  it('FREE_LIMITS has all required keys', () => {
    expect(FREE_LIMITS).toHaveProperty('chat_daily')
    expect(FREE_LIMITS).toHaveProperty('wizard_weekly')
    expect(FREE_LIMITS).toHaveProperty('insights_weekly')
    expect(FREE_LIMITS).toHaveProperty('history_days')
    expect(FREE_LIMITS).toHaveProperty('nutrition_macros')
    expect(FREE_LIMITS).toHaveProperty('analytics')
    expect(FREE_LIMITS).toHaveProperty('offline')
    expect(FREE_LIMITS).toHaveProperty('chef_ai')
  })

  it('FREE_LIMITS blocks AI features', () => {
    expect(FREE_LIMITS.chat_daily).toBe(0)
    expect(FREE_LIMITS.wizard_weekly).toBe(0)
    expect(FREE_LIMITS.insights_weekly).toBe(0)
    expect(FREE_LIMITS.chef_ai).toBe(false)
  })

  it('FREE_LIMITS limits history to 30 days', () => {
    expect(FREE_LIMITS.history_days).toBe(30)
  })

  it('UNLIMITED_LIMITS allows everything with high quotas', () => {
    expect(UNLIMITED_LIMITS.chat_daily).toBeGreaterThan(100)
    expect(UNLIMITED_LIMITS.wizard_weekly).toBeGreaterThan(100)
    expect(UNLIMITED_LIMITS.insights_weekly).toBeGreaterThan(100)
    expect(UNLIMITED_LIMITS.history_days).toBeNull()
    expect(UNLIMITED_LIMITS.nutrition_macros).toBe(true)
    expect(UNLIMITED_LIMITS.analytics).toBe(true)
    expect(UNLIMITED_LIMITS.offline).toBe(true)
    expect(UNLIMITED_LIMITS.chef_ai).toBe(true)
  })
})

describe('normalizePlanId', () => {
  it('normalizes a valid plan id', () => {
    expect(normalizePlanId('vip_monthly')).toBe('vip_monthly')
    expect(normalizePlanId('VIP_YEARLY')).toBe('vip_yearly')
  })

  it('replaces spaces with underscores', () => {
    expect(normalizePlanId('vip  monthly')).toBe('vip_monthly')
    expect(normalizePlanId('Premium Plan')).toBe('premium_plan')
  })

  it('removes special characters', () => {
    expect(normalizePlanId('vip-plan.v2')).toBe('vipplanv2')
  })

  it('returns null for empty/null/undefined', () => {
    expect(normalizePlanId('')).toBeNull()
    expect(normalizePlanId(null)).toBeNull()
    expect(normalizePlanId(undefined)).toBeNull()
  })

  it('handles numeric input', () => {
    expect(normalizePlanId(42)).toBe('42')
  })
})
