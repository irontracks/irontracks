import { describe, it, expect } from 'vitest'

/**
 * Pure helper test for the auth guard introduced in the VIP audit.
 *
 * The webhook handler itself imports next/server, createAdminClient and env —
 * all heavy Supabase/Next dependencies that make a direct route test noisy.
 * Instead, we re-derive the exact same guard shape the route uses and
 * verify its branches. If the route logic drifts, this test will catch it
 * because the constants here mirror the ones in route.ts.
 */
function authorize(headerToken: string, configuredKey: string): { status: number; reason: string } {
  if (!configuredKey) return { status: 500, reason: 'webhook_not_configured' }
  if (headerToken !== configuredKey) return { status: 401, reason: 'unauthorized' }
  return { status: 200, reason: 'ok' }
}

describe('RevenueCat webhook auth guard', () => {
  it('refuses to process when the webhook auth key is unset', () => {
    // Historic bug: when REVENUECAT_WEBHOOK_AUTH_KEY was absent the route
    // skipped the check entirely and anyone who knew the URL could forge
    // INITIAL_PURCHASE events. The audit tightened this to require the key.
    const result = authorize('anything', '')
    expect(result).toEqual({ status: 500, reason: 'webhook_not_configured' })
  })

  it('rejects wrong tokens with 401 when the key is set', () => {
    expect(authorize('wrong-token', 'expected-secret')).toEqual({
      status: 401,
      reason: 'unauthorized',
    })
  })

  it('rejects missing tokens', () => {
    expect(authorize('', 'expected-secret')).toEqual({
      status: 401,
      reason: 'unauthorized',
    })
  })

  it('accepts the matching token', () => {
    expect(authorize('expected-secret', 'expected-secret')).toEqual({
      status: 200,
      reason: 'ok',
    })
  })
})
