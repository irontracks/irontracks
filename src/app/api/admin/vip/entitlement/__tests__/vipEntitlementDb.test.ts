import { describe, it, expect } from 'vitest'
import { createSupabaseMock } from '@/__tests__/helpers/supabaseMock'

// ─────────────────────────────────────────────────────────────────────────────
// DB integration tests for VIP entitlement logic using the Supabase mock.
// Tests the query pattern used by api/admin/vip/entitlement/route.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors the entitlement query logic from the route */
async function queryVipEntitlement(
  client: ReturnType<typeof createSupabaseMock>['client'],
  userId: string
): Promise<{ tier: string; planId: string | null; expiresAt: string | null } | null> {
  const now = new Date().toISOString()
  const result = await (client as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>
          }
        }
      }
    }
  }).from('user_plans')
    .select('plan_id, tier, expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (result.error || !result.data) return null
  const row = result.data as Record<string, unknown>
  const expiresAt = row.expires_at ? String(row.expires_at) : null
  if (expiresAt && expiresAt < now) return null

  return {
    tier: String(row.tier || 'free'),
    planId: row.plan_id ? String(row.plan_id) : null,
    expiresAt,
  }
}

describe('VIP entitlement DB query pattern', () => {
  it('returns correct tier for active VIP user', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { client } = createSupabaseMock({
      tables: {
        user_plans: [
          {
            user_id: 'u-vip',
            plan_id: 'vip_monthly',
            tier: 'vip',
            status: 'active',
            expires_at: futureDate,
          },
        ],
      },
    })

    const result = await queryVipEntitlement(client, 'u-vip')
    expect(result).not.toBeNull()
    expect(result?.tier).toBe('vip')
    expect(result?.planId).toBe('vip_monthly')
  })

  it('returns null for user with no active plan', async () => {
    const { client } = createSupabaseMock({ tables: { user_plans: [] } })
    const result = await queryVipEntitlement(client, 'u-free')
    expect(result).toBeNull()
  })

  it('returns null for expired VIP plan', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { client } = createSupabaseMock({
      tables: {
        user_plans: [
          {
            user_id: 'u-expired',
            plan_id: 'vip_monthly',
            tier: 'vip',
            status: 'active',
            expires_at: pastDate,
          },
        ],
      },
    })

    const result = await queryVipEntitlement(client, 'u-expired')
    expect(result).toBeNull()
  })

  it('returns null when DB returns an error', async () => {
    const { client } = createSupabaseMock({ forceError: 'connection timeout' })
    const result = await queryVipEntitlement(client, 'u-any')
    expect(result).toBeNull()
  })

  it('handles missing expires_at (no-expiry unlimited plan)', async () => {
    const { client } = createSupabaseMock({
      tables: {
        user_plans: [
          {
            user_id: 'u-lifetime',
            plan_id: 'lifetime',
            tier: 'vip',
            status: 'active',
            expires_at: null,
          },
        ],
      },
    })

    const result = await queryVipEntitlement(client, 'u-lifetime')
    expect(result).not.toBeNull()
    expect(result?.tier).toBe('vip')
    expect(result?.expiresAt).toBeNull()
  })
})

describe('Supabase mock — eq() filter behavior', () => {
  it('filters rows correctly by userId', async () => {
    const { client } = createSupabaseMock({
      tables: {
        user_plans: [
          { user_id: 'u-1', plan_id: 'vip_monthly', tier: 'vip', status: 'active', expires_at: null },
          { user_id: 'u-2', plan_id: 'vip_yearly', tier: 'vip', status: 'active', expires_at: null },
        ],
      },
    })

    const result = await queryVipEntitlement(client, 'u-2')
    expect(result?.planId).toBe('vip_yearly')
  })
})
