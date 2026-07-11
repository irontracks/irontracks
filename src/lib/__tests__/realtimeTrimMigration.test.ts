import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/** Guard: direct_channels (sem assinante realtime) removida da publication supabase_realtime. */
describe('migration perf_realtime_drop_unused_direct_channels', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('perf_realtime_drop_unused_direct_channels'))
  it('remove direct_channels da publication', () => {
    expect(file).toBeTruthy()
    const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''
    expect(sql).toMatch(/alter publication supabase_realtime drop table public\.direct_channels/i)
  })
})
