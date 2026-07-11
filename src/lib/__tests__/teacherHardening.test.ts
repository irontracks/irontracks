import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Guards do hardening da auditoria do professor (defesa em profundidade):
 *  - revoga escrita de authenticated nas tabelas service-role-only (marketplace/tiers/inbox);
 *  - dropa appointments_insert_own (fecha spoofing de calendário cross-user);
 *  - teachers SELECT usa is_admin() (não email hardcoded);
 *  - approve_access_request ganha guard interno is_admin()/service_role;
 *  - students/status resolve com autoCreate só para admin (mata linha órfã do teacher).
 */
const dir = 'supabase/migrations'
const readMig = (needle: string) => {
  const f = readdirSync(dir).find((x) => x.includes(needle))
  return f ? readFileSync(path.join(dir, f), 'utf8') : ''
}

describe('migration teacher_area_hardening_grants_and_policies', () => {
  const sql = readMig('teacher_area_hardening_grants_and_policies')

  it('revoga escrita das tabelas service-role-only', () => {
    for (const t of ['marketplace_payments', 'marketplace_subscriptions', 'teacher_tiers', 'coach_inbox_states']) {
      expect(sql).toMatch(new RegExp(`revoke insert, update, delete[\\s\\S]*public\\.${t} from authenticated`, 'i'))
    }
  })

  it('dropa appointments_insert_own', () => {
    expect(sql).toMatch(/drop policy if exists appointments_insert_own on public\.appointments/i)
  })

  it('teachers SELECT usa is_admin() (não email hardcoded)', () => {
    // Isola a cláusula using() do CREATE POLICY (o comentário acima menciona o email antigo).
    const using = sql.match(/create policy teachers_select_self_or_admin[\s\S]*?using\s*\(([\s\S]*?)\);/i)?.[1] || ''
    expect(using).toMatch(/or public\.is_admin\(\)/i)
    expect(using).not.toMatch(/djmkapple@gmail\.com/)
    expect(using).toMatch(/email = \(auth\.jwt\(\) ->> 'email'\)/)
  })
})

describe('migration approve_access_request_internal_authz_guard', () => {
  const sql = readMig('approve_access_request_internal_authz_guard')

  it('adiciona o guard is_admin()/service_role e preserva os branches', () => {
    expect(sql).toMatch(/IF NOT public\.is_admin\(\) AND coalesce\(auth\.role\(\), ''\) <> 'service_role' THEN/)
    expect(sql).toMatch(/RAISE EXCEPTION 'Unauthorized'/)
    // invariantes do corpo (não perdeu branch)
    expect(sql).toMatch(/SET role\s*=\s*'teacher'/)
    expect(sql).toMatch(/INSERT INTO public\.students/)
    expect(sql).toMatch(/INSERT INTO public\.audit_events/)
  })
})

describe('students/status — autoCreate só para admin', () => {
  const src = readFileSync('src/app/api/admin/students/status/route.ts', 'utf8')
  it('resolve com autoCreate: auth.role === admin', () => {
    expect(src).toMatch(/resolveStudentRow\(admin,\s*\{\s*id,\s*email,\s*autoCreate:\s*auth\.role === 'admin'\s*\}\)/)
  })
})
