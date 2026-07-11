import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Guards da auditoria de gamificação/integridade:
 *  - revoga escrita direta de referrals (forja de indicação) e user_achievements (self-grant);
 *  - corrige o with_check tautológico de workout_checkins (w.user_id = w.user_id → auth.uid);
 *  - exercises/search usa client user-scoped (RLS silo), não admin (enumerava exercícios de todos).
 */
describe('migration gamification_integrity_lockdown', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('gamification_integrity_lockdown'))
  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''

  it('revoga escrita de referrals e user_achievements', () => {
    expect(sql).toMatch(/revoke insert, update, delete on public\.referrals from authenticated, anon/i)
    expect(sql).toMatch(/revoke insert, update, delete on public\.user_achievements from authenticated, anon/i)
  })

  it('corrige o with_check tautológico de workout_checkins (auth.uid, não w.user_id)', () => {
    // Isola o corpo dos ALTER POLICY (o comentário acima cita o padrão antigo).
    const alters = sql.slice(sql.indexOf('alter policy workout_checkins_insert'))
    expect(alters).toMatch(/w\.user_id = auth\.uid\(\)/i)
    expect(alters).toMatch(/w2\.user_id = auth\.uid\(\)/i)
    expect(alters).not.toMatch(/w\.user_id = w\.user_id/)
    expect(alters).not.toMatch(/w2\.user_id = w2\.user_id/)
  })
})

describe('exercises/search — RLS silo (não admin)', () => {
  const src = readFileSync('src/app/api/exercises/search/route.ts', 'utf8')
  it('busca em exercises via client user-scoped (supabase), não admin', () => {
    expect(src).toMatch(/await supabase\s*\n?\s*\.from\('exercises'\)/)
    // não pode voltar a usar admin.from('exercises')
    expect(src).not.toMatch(/admin\s*\n?\s*\.from\('exercises'\)/)
  })
})
