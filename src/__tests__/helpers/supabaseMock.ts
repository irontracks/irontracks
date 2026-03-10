import { vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// supabaseMock — reusable Supabase client mock for DB integration-style tests.
// 
// Usage:
//   const { client, mocks } = createSupabaseMock({ profiles: [{ id: 'u1', email: 'a@b.com' }] })
//   const { data } = await client.from('profiles').select('id').eq('id', 'u1').maybeSingle()
// ─────────────────────────────────────────────────────────────────────────────

type TableData = Record<string, unknown>

interface MockOptions {
  /** Seed data per table name */
  tables?: Record<string, TableData[]>
  /** Force a specific error for all queries */
  forceError?: string | null
}

type QueryResult<T> = { data: T | null; error: { message: string } | null }

function buildQueryChain<T extends TableData>(rows: T[], error: string | null) {
  let filtered = [...rows]
  let limited = false
  let limitCount = Infinity

  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: unknown) => {
      if (!error) filtered = filtered.filter(r => r[col] === val)
      return chain
    }),
    neq: vi.fn((col: string, val: unknown) => {
      if (!error) filtered = filtered.filter(r => r[col] !== val)
      return chain
    }),
    ilike: vi.fn((col: string, val: unknown) => {
      if (!error) {
        const pattern = String(val || '').replace(/%/g, '.*').toLowerCase()
        filtered = filtered.filter(r => new RegExp(pattern).test(String(r[col] || '').toLowerCase()))
      }
      return chain
    }),
    in: vi.fn((col: string, vals: unknown[]) => {
      if (!error) filtered = filtered.filter(r => vals.includes(r[col]))
      return chain
    }),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn((n: number) => {
      limitCount = n
      limited = true
      return chain
    }),
    range: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    // Terminal methods
    maybeSingle: vi.fn((): QueryResult<T> => {
      if (error) return { data: null, error: { message: error } }
      return { data: filtered[0] ?? null, error: null }
    }),
    single: vi.fn((): QueryResult<T> => {
      if (error) return { data: null, error: { message: error } }
      if (filtered.length === 0) return { data: null, error: { message: 'Row not found' } }
      return { data: filtered[0], error: null }
    }),
    // Default resolution — select returns array
    then: vi.fn((resolve: (v: QueryResult<T[]>) => void) => {
      if (error) resolve({ data: null, error: { message: error } })
      else resolve({ data: limited ? filtered.slice(0, limitCount) : filtered, error: null })
    }),
  }

  // Make the chain itself thenable for await
  Object.defineProperty(chain, Symbol.toStringTag, { value: 'MockQueryChain' })

  return chain
}

export function createSupabaseMock(options: MockOptions = {}) {
  const { tables = {}, forceError = null } = options

  const mocks = {
    from: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  }

  mocks.from.mockImplementation((tableName: string) => {
    const rows = (tables[tableName] ?? []) as TableData[]
    return buildQueryChain(rows, forceError)
  })

  const client = mocks as unknown as ReturnType<typeof createSupabaseMock>['client']

  return { client, mocks }
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>
