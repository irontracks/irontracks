import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Regression guard da correção de autorização do treino em dupla (migration
 * team_invite_authz_and_participant_limit, auditoria 2026-07-11):
 *
 *   F1 (crítico) — auto-convite forjado dava acesso a sessão privada alheia.
 *     accept_team_invite passou a exigir que o EMISSOR (from_uid) seja host ou
 *     participante da sessão.
 *   Limite de 5 participantes — antes só no cliente; agora accept_team_invite e
 *     join_team_session_by_code validam a contagem no servidor (corrida-safe).
 *
 * Guarda a INTENÇÃO versionada em SQL — se a migration sumir ou perder as travas,
 * o teste quebra. (A verificação do estado ao vivo do banco é feita na auditoria.)
 */
describe('migration team_invite_authz_and_participant_limit', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('team_invite_authz_and_participant_limit'))

  it('existe no diretório de migrations', () => {
    expect(file, 'migration de authz do treino em dupla sumiu do repo').toBeTruthy()
  })

  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''

  it('accept_team_invite valida que o emissor (from_uid) pertence à sessão (fecha F1)', () => {
    expect(sql).toMatch(/inv\.from_uid\s*=\s*ts_host\s+OR\s+public\.jsonb_participants_has_uid\(\s*session_parts\s*,\s*inv\.from_uid\s*\)/i)
    expect(sql).toMatch(/Inviter is not part of this team session/i)
  })

  it('accept_team_invite enforça o limite de 5 participantes no servidor', () => {
    expect(sql).toMatch(/accept_team_invite[\s\S]*jsonb_array_length\(\s*session_parts\s*\)\s*>=\s*5[\s\S]*Team session is full/i)
  })

  it('join_team_session_by_code também enforça o limite de 5', () => {
    expect(sql).toMatch(/join_team_session_by_code[\s\S]*jsonb_array_length\(\s*session_parts\s*\)\s*>=\s*5[\s\S]*Team session is full/i)
  })

  it('as duas RPCs continuam SECURITY DEFINER com search_path travado', () => {
    expect((sql.match(/SECURITY DEFINER/gi) || []).length).toBeGreaterThanOrEqual(2)
    expect((sql.match(/SET search_path TO 'public'/gi) || []).length).toBeGreaterThanOrEqual(2)
  })
})
