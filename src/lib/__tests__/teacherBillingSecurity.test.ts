import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Guards da auditoria de billing do professor:
 *  ALTA — forja de cobrança: revoga INSERT/UPDATE/DELETE de authenticated/anon em
 *         student_charges/student_subscriptions (escritas legítimas são service-role);
 *         + hardening: revoga escrita de authenticated em teachers.
 *  MÉDIA — simulate-teacher-payment concede plano real sem pagamento: gate de ambiente
 *          bloqueia em produção sem opt-in explícito.
 */
describe('migration teacher_billing_forge_lockdown', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('teacher_billing_forge_lockdown'))

  it('existe no repo', () => {
    expect(file).toBeTruthy()
  })

  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''

  it('revoga escrita de authenticated/anon em student_charges e student_subscriptions', () => {
    expect(sql).toMatch(/revoke insert, update, delete on public\.student_charges from authenticated, anon/i)
    expect(sql).toMatch(/revoke insert, update, delete on public\.student_subscriptions from authenticated, anon/i)
  })

  it('revoga escrita de authenticated/anon em teachers', () => {
    expect(sql).toMatch(/revoke insert, update, delete, truncate on public\.teachers from authenticated, anon/i)
  })
})

describe('simulate-teacher-payment — gate de ambiente', () => {
  const src = readFileSync('src/app/api/admin/simulate-teacher-payment/route.ts', 'utf8')

  it('bloqueia em produção sem ALLOW_SIMULATE_TEACHER_PAYMENT=true', () => {
    expect(src).toMatch(/NODE_ENV\s*===\s*'production'\s*&&\s*process\.env\.ALLOW_SIMULATE_TEACHER_PAYMENT\s*!==\s*'true'/)
    expect(src).toMatch(/disabled_in_production/)
  })

  it('mantém o gate admin-only (requireRole)', () => {
    expect(src).toMatch(/requireRole\(\['admin'\]\)/)
  })
})
