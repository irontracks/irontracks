import { describe, it, expect } from 'vitest'
import { createSupabaseMock } from '@/__tests__/helpers/supabaseMock'

// ─────────────────────────────────────────────────────────────────────────────
// DB integration tests for VIP grant history query pattern.
// Tests the query logic used by api/admin/vip/grant-history/route.ts.
// ─────────────────────────────────────────────────────────────────────────────

type GrantHistoryRow = {
  id: string
  granted_to_user_id: string
  granted_by_user_id: string
  plan_id: string
  trial_days: number
  created_at: string
}

/** Mirrors query logic from grant-history/route.ts */
async function queryGrantHistory(
  client: ReturnType<typeof createSupabaseMock>['client'],
  limit: number
): Promise<GrantHistoryRow[]> {
  // The mock's .then() handler simulates the Supabase promise resolution
  return new Promise((resolve) => {
    const chain = (client as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          order: (col: string, opts: object) => {
            limit: (n: number) => {
              then: (cb: (v: { data: GrantHistoryRow[] | null; error: unknown }) => void) => void
            }
          }
        }
      }
    }).from('vip_grant_history')
      .select('id, granted_to_user_id, granted_by_user_id, plan_id, trial_days, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    chain.then(({ data, error }) => {
      if (error || !data) resolve([])
      else resolve(data)
    })
  })
}

function makeGrantRow(overrides: Partial<GrantHistoryRow> = {}): GrantHistoryRow {
  return {
    id: `g-${Math.random().toString(36).slice(2)}`,
    granted_to_user_id: 'u-target',
    granted_by_user_id: 'u-admin',
    plan_id: 'vip_monthly',
    trial_days: 7,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('VIP grant history DB query pattern', () => {
  it('returns history rows when they exist', async () => {
    const rows = [makeGrantRow(), makeGrantRow()]
    const { client } = createSupabaseMock({ tables: { vip_grant_history: rows } })

    const result = await queryGrantHistory(client, 50)
    expect(result).toHaveLength(2)
  })

  it('returns empty array when no history exists', async () => {
    const { client } = createSupabaseMock({ tables: { vip_grant_history: [] } })
    const result = await queryGrantHistory(client, 50)
    expect(result).toHaveLength(0)
  })

  it('respects limit parameter', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeGrantRow({ id: String(i) }))
    const { client } = createSupabaseMock({ tables: { vip_grant_history: rows } })

    const result = await queryGrantHistory(client, 3)
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('returns empty array on DB error', async () => {
    const { client } = createSupabaseMock({ forceError: 'permission denied' })
    const result = await queryGrantHistory(client, 50)
    expect(result).toHaveLength(0)
  })

  it('each row has required fields', async () => {
    const rows = [makeGrantRow({ trial_days: 14, plan_id: 'vip_yearly' })]
    const { client } = createSupabaseMock({ tables: { vip_grant_history: rows } })

    const result = await queryGrantHistory(client, 50)
    expect(result[0]).toHaveProperty('granted_to_user_id')
    expect(result[0]).toHaveProperty('granted_by_user_id')
    expect(result[0]).toHaveProperty('plan_id')
    expect(result[0].trial_days).toBe(14)
  })
})
