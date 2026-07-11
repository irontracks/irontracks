import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Guard da consolidação de policies PERMISSIVE de SELECT (advisor multiple_permissive_policies).
 * Merge = USING (q1 OR q2 ...) — identidade (Postgres já combina permissivas como OR).
 * Trava o escopo seguro: SÓ cmd=SELECT (nunca toca WITH CHECK / policies ALL).
 */
describe('migration perf_consolidate_select_permissive_policies', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('perf_consolidate_select_permissive_policies'))
  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''
  it('existe e é escopada a cmd=SELECT', () => {
    expect(file).toBeTruthy()
    expect(sql).toMatch(/cmd='SELECT'/)
    expect(sql).toMatch(/FOR SELECT TO %s USING \(%s\)/)
  })
  it('faz OR das quals e NÃO mexe em WITH CHECK (evita default de check das policies ALL)', () => {
    expect(sql).toMatch(/' OR \('\|\|p\.qual\|\|'\)'/)
    expect(sql).not.toMatch(/with_check/i)
  })
})
