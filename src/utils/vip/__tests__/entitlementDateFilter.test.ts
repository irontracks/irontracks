import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { safePg } from '@/utils/safePgFilter'

/**
 * Regression guard for the VIP entitlement validity filter.
 *
 * Bug (fixed): getVipPlanLimits filtered valid entitlements with
 *   .or(`valid_until.gte.${safePg(nowIso)}`)
 * safePg strips the dot from the ISO milliseconds ("…20.616Z" → "…20616Z"),
 * which PostgREST rejects with "date/time field value out of range". The query
 * failed and the user fell back to the legacy app_subscriptions tier (wrong
 * plan) or free — even with an active VIP entitlement.
 */
describe('getVipPlanLimits — entitlement validity filter', () => {
  const src = readFileSync('src/utils/vip/limits.ts', 'utf8')

  it('never runs the timestamp through safePg (it would corrupt the ISO value)', () => {
    expect(src).not.toMatch(/valid_until\.gte\.\$\{\s*safePg/)
    expect(src).not.toMatch(/safePg\(\s*nowIso/)
  })

  it('uses the raw ISO nowIso in the valid_until .or filter', () => {
    expect(src).toMatch(/valid_until\.gte\.\$\{\s*nowIso\s*\}/)
  })
})

describe('safePg must not be used on ISO timestamps', () => {
  it('demonstrates the corruption: safePg drops the millisecond dot', () => {
    const iso = '2026-06-12T12:37:20.616Z'
    // The dot before the milliseconds is stripped → an invalid timestamp.
    expect(safePg(iso)).toBe('2026-06-12T12:37:20616Z')
    expect(safePg(iso)).not.toContain('.616')
  })
})
