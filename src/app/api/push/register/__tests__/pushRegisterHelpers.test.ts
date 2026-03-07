import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers extracted from push/register/route.ts for isolated testing.
// ─────────────────────────────────────────────────────────────────────────────

const normalizeToken = (v: unknown) => String(v ?? '').trim()

const normalizePlatform = (v: unknown) => {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'ios' || s === 'android' || s === 'web') return s
  return 'ios'
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('normalizeToken', () => {
  it('trims whitespace', () => {
    expect(normalizeToken('  abc123  ')).toBe('abc123')
  })

  it('returns empty string for null/undefined', () => {
    expect(normalizeToken(null)).toBe('')
    expect(normalizeToken(undefined)).toBe('')
  })

  it('converts non-string values to string', () => {
    expect(normalizeToken(42)).toBe('42')
    expect(normalizeToken(true)).toBe('true')
  })

  it('preserves valid FCM-style tokens', () => {
    const token = 'dHhpc1Rva2VuOmFiYzEyMw=='
    expect(normalizeToken(token)).toBe(token)
  })

  it('handles empty string', () => {
    expect(normalizeToken('')).toBe('')
  })
})

describe('normalizePlatform', () => {
  it('accepts "ios"', () => {
    expect(normalizePlatform('ios')).toBe('ios')
    expect(normalizePlatform('IOS')).toBe('ios')
    expect(normalizePlatform('iOS')).toBe('ios')
  })

  it('accepts "android"', () => {
    expect(normalizePlatform('android')).toBe('android')
    expect(normalizePlatform('Android')).toBe('android')
    expect(normalizePlatform('ANDROID')).toBe('android')
  })

  it('accepts "web"', () => {
    expect(normalizePlatform('web')).toBe('web')
    expect(normalizePlatform('Web')).toBe('web')
  })

  it('defaults to "ios" for unknown/invalid values', () => {
    expect(normalizePlatform('windows')).toBe('ios')
    expect(normalizePlatform('')).toBe('ios')
    expect(normalizePlatform(null)).toBe('ios')
    expect(normalizePlatform(undefined)).toBe('ios')
    expect(normalizePlatform(42)).toBe('ios')
  })

  it('trims whitespace before matching', () => {
    expect(normalizePlatform('  android  ')).toBe('android')
  })
})
