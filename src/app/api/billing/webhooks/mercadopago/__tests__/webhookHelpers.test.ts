import { describe, it, expect } from 'vitest'
import crypto from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper functions extracted from billing/webhooks/mercadopago/route.ts
// for isolated testing without Next.js runtime dependencies.
// ─────────────────────────────────────────────────────────────────────────────

const parseSignature = (raw: string) => {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  let ts = ''
  let v1 = ''
  for (const part of parts) {
    const [k, v] = part.split('=').map((s) => (s || '').trim())
    if (k === 'ts') ts = v || ''
    if (k === 'v1') v1 = v || ''
  }
  return { ts, v1 }
}

const verifyWebhook = (opts: { secret: string; xSignature: string; xRequestId: string; dataId: string }) => {
  const { ts, v1 } = parseSignature(opts.xSignature)
  if (!ts || !v1) return false
  const TOLERANCE_MS = 5 * 60 * 1000
  const tsMs = Number(ts) * 1000
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > TOLERANCE_MS) return false
  const manifest = `id:${opts.dataId};request-id:${opts.xRequestId};ts:${ts};`
  const hashed = crypto.createHmac('sha256', opts.secret).update(manifest).digest('hex')
  return hashed.toLowerCase() === v1.toLowerCase()
}

const mapSubscriptionStatus = (status: string) => {
  const s = (status || '').toLowerCase()
  if (['authorized', 'approved'].includes(s)) return 'active'
  if (['paused'].includes(s)) return 'past_due'
  if (['cancelled', 'canceled'].includes(s)) return 'cancelled'
  return 'pending'
}

const addInterval = (start: Date, interval: string) => {
  const d = new Date(start)
  if (String(interval || '').toLowerCase() === 'year') {
    d.setMonth(d.getMonth() + 12)
    return d
  }
  d.setMonth(d.getMonth() + 1)
  return d
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('parseSignature', () => {
  it('extracts ts and v1 from valid header', () => {
    const result = parseSignature('ts=1700000000,v1=abc123')
    expect(result).toEqual({ ts: '1700000000', v1: 'abc123' })
  })

  it('handles spaces and extra commas', () => {
    const result = parseSignature('  ts=123 , v1=def , ')
    expect(result).toEqual({ ts: '123', v1: 'def' })
  })

  it('returns empty strings for missing parts', () => {
    expect(parseSignature('')).toEqual({ ts: '', v1: '' })
    expect(parseSignature('foo=bar')).toEqual({ ts: '', v1: '' })
  })
})

describe('verifyWebhook', () => {
  const SECRET = 'my-test-secret'
  const DATA_ID = 'pay-001'
  const REQUEST_ID = 'req-xyz'

  const createValidSignature = (ts: number) => {
    const manifest = `id:${DATA_ID};request-id:${REQUEST_ID};ts:${ts};`
    const hash = crypto.createHmac('sha256', SECRET).update(manifest).digest('hex')
    return `ts=${ts},v1=${hash}`
  }

  it('accepts valid signature within time window', () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const sig = createValidSignature(nowSec)
    expect(verifyWebhook({
      secret: SECRET,
      xSignature: sig,
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
    })).toBe(true)
  })

  it('rejects tampered hash', () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const sig = `ts=${nowSec},v1=definitely-wrong-hash`
    expect(verifyWebhook({
      secret: SECRET,
      xSignature: sig,
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
    })).toBe(false)
  })

  it('rejects expired timestamp (>5 min)', () => {
    const oldTs = Math.floor(Date.now() / 1000) - 400 // 6+ minutes ago
    const sig = createValidSignature(oldTs)
    expect(verifyWebhook({
      secret: SECRET,
      xSignature: sig,
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
    })).toBe(false)
  })

  it('rejects empty signature', () => {
    expect(verifyWebhook({
      secret: SECRET,
      xSignature: '',
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
    })).toBe(false)
  })
})

describe('mapSubscriptionStatus', () => {
  it.each([
    ['authorized', 'active'],
    ['approved', 'active'],
    ['paused', 'past_due'],
    ['cancelled', 'cancelled'],
    ['canceled', 'cancelled'],
    ['pending', 'pending'],
    ['unknown', 'pending'],
    ['', 'pending'],
  ])('maps "%s" → "%s"', (input, expected) => {
    expect(mapSubscriptionStatus(input)).toBe(expected)
  })
})

describe('addInterval', () => {
  it('adds 1 month for monthly interval', () => {
    const start = new Date('2025-01-15T10:00:00Z')
    const result = addInterval(start, 'month')
    expect(result.getMonth()).toBe(1) // February
    expect(result.getDate()).toBe(15)
  })

  it('adds 12 months for yearly interval', () => {
    const start = new Date('2025-03-01T10:00:00Z')
    const result = addInterval(start, 'year')
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(2) // March
  })

  it('defaults to monthly for unknown interval', () => {
    const start = new Date('2025-06-01T10:00:00Z')
    const result = addInterval(start, 'weekly')
    expect(result.getMonth()).toBe(6) // July
  })

  it('does not mutate the original date', () => {
    const start = new Date('2025-01-01T00:00:00Z')
    const original = start.getTime()
    addInterval(start, 'month')
    expect(start.getTime()).toBe(original)
  })
})
