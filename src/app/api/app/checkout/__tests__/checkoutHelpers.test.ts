import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers extracted from app/checkout/route.ts for isolated testing.
// ─────────────────────────────────────────────────────────────────────────────

const resolveBaseUrl = (headers: Record<string, string | null>) => {
  const env = (process.env.APP_BASE_URL || '').trim().replace(/\/$/, '')
  if (env) return env
  const origin = (headers['origin'] || '').trim().replace(/\/$/, '')
  if (origin) return origin
  return 'http://localhost:3000'
}

const toDateOnly = (iso: string | null) => {
  try {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  } catch {
    return null
  }
}

const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('checkout helpers', () => {
  describe('resolveBaseUrl', () => {
    it('uses APP_BASE_URL when set', () => {
      const prev = process.env.APP_BASE_URL
      process.env.APP_BASE_URL = 'https://app.irontracks.com.br'
      try {
        expect(resolveBaseUrl({ origin: 'https://other.com' })).toBe('https://app.irontracks.com.br')
      } finally {
        process.env.APP_BASE_URL = prev
      }
    })

    it('strips trailing slash from APP_BASE_URL', () => {
      const prev = process.env.APP_BASE_URL
      process.env.APP_BASE_URL = 'https://app.irontracks.com.br/'
      try {
        expect(resolveBaseUrl({ origin: null })).toBe('https://app.irontracks.com.br')
      } finally {
        process.env.APP_BASE_URL = prev
      }
    })

    it('falls back to origin header', () => {
      const prev = process.env.APP_BASE_URL
      delete process.env.APP_BASE_URL
      try {
        expect(resolveBaseUrl({ origin: 'https://mysite.com' })).toBe('https://mysite.com')
      } finally {
        process.env.APP_BASE_URL = prev
      }
    })

    it('returns localhost as last resort', () => {
      const prev = process.env.APP_BASE_URL
      delete process.env.APP_BASE_URL
      try {
        expect(resolveBaseUrl({ origin: null })).toBe('http://localhost:3000')
      } finally {
        process.env.APP_BASE_URL = prev
      }
    })
  })

  describe('toDateOnly', () => {
    it('extracts date from ISO string', () => {
      expect(toDateOnly('2026-03-18T14:30:00.000Z')).toBe('2026-03-18')
    })

    it('handles date-only string', () => {
      expect(toDateOnly('2026-01-01T00:00:00.000Z')).toBe('2026-01-01')
    })

    it('returns null for null input', () => {
      expect(toDateOnly(null)).toBe(null)
    })

    it('returns null for invalid date', () => {
      expect(toDateOnly('not-a-date')).toBe(null)
    })

    it('returns null for empty string', () => {
      expect(toDateOnly('')).toBe(null)
    })
  })

  describe('onlyDigits', () => {
    it('extracts digits from CPF', () => {
      expect(onlyDigits('123.456.789-01')).toBe('12345678901')
    })

    it('extracts digits from CNPJ', () => {
      expect(onlyDigits('12.345.678/0001-90')).toBe('12345678000190')
    })

    it('handles pure digits', () => {
      expect(onlyDigits('11999998888')).toBe('11999998888')
    })

    it('handles null/undefined', () => {
      expect(onlyDigits(null)).toBe('')
      expect(onlyDigits(undefined)).toBe('')
    })

    it('handles empty string', () => {
      expect(onlyDigits('')).toBe('')
    })
  })
})
