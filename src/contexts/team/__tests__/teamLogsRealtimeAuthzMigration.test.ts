import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Regression guard da migration team_logs_broadcast_realtime_authz (F2, 2026-07-11):
 * políticas em realtime.messages que só liberam SELECT/INSERT no tópico team_logs:<uuid>
 * para membros da sessão (via can_view_team_session). Par do client change (private:true)
 * no PR do canal team_logs. Trava o SQL versionado no repo.
 */
describe('migration team_logs_broadcast_realtime_authz (F2)', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('team_logs_broadcast_realtime_authz'))

  it('existe no repo', () => {
    expect(file).toBeTruthy()
  })

  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''

  it('cria policies de SELECT e INSERT em realtime.messages', () => {
    expect(sql).toMatch(/on realtime\.messages for select to authenticated/i)
    expect(sql).toMatch(/on realtime\.messages for insert to authenticated/i)
  })

  it('amarra ao tópico team_logs:<uuid> e à membership via can_view_team_session', () => {
    expect(sql).toMatch(/\^team_logs:\[0-9a-fA-F-\]\{36\}\$/)
    expect(sql).toMatch(/can_view_team_session\(/)
    expect(sql).toMatch(/split_part\(\s*\(select realtime\.topic\(\)\)/)
  })
})
