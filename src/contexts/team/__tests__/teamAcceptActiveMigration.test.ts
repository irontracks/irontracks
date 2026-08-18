import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Regression guard da migration team_accept_active_and_revoke_anon (2026-07-11):
 *   #7 — accept_team_invite rejeita sessão não-ativa (não entrar em sessão morta).
 *   F6 — revoga EXECUTE de anon nas RPCs de dupla e da função de trigger.
 * Garante que as travas continuem versionadas em SQL.
 */
describe('migration team_accept_active_and_revoke_anon', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('team_accept_active_and_revoke_anon'))

  it('existe no repo', () => {
    expect(file).toBeTruthy()
  })

  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''

  it('#7: accept_team_invite rejeita sessão não-ativa', () => {
    expect(sql).toMatch(/ts_status\s*<>\s*'active'/i)
    expect(sql).toMatch(/Team session is not active/i)
  })

  it('#7 preserva as travas do #314 (F1 do emissor + limite de 5)', () => {
    expect(sql).toMatch(/Inviter is not part of this team session/i)
    expect(sql).toMatch(/jsonb_array_length\(\s*session_parts\s*\)\s*>=\s*5/i)
  })

  it('F6: revoga EXECUTE de anon em join/leave e da função de trigger (inclui PUBLIC)', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.join_team_session_by_code\(text\) FROM anon/i)
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.leave_team_session\(uuid\) FROM anon/i)
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.invites_create_notification\(\) FROM PUBLIC/i)
  })
})
