import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regression F2 (auditoria do treino em dupla): o canal de broadcast team_logs:<id>
 * carrega os eventos ao vivo (log_update/pause/resume/challenge/workout_edit/
 * exercise_share) e era PÚBLICO — qualquer autenticado que soubesse o UUID da sessão
 * podia escutar/injetar. Precisa ser `private: true` para acionar a Realtime
 * Authorization (migration team_logs_broadcast_realtime_authz, que só libera membros).
 * Os demais canais da dupla usam postgres_changes → gateados pela RLS das tabelas.
 */
describe('team_logs — canal de broadcast privado', () => {
  const src = readFileSync('src/contexts/team/useTeamBroadcast.ts', 'utf8')

  it('o canal team_logs é criado com private: true', () => {
    // Casa o .channel(`team_logs:...`, { config: { private: true, broadcast: {...} } })
    const m = src.match(/\.channel\(\s*`team_logs:\$\{[^`]*`\s*,\s*\{\s*config:\s*\{([^}]*)/)
    expect(m).toBeTruthy()
    expect(m![1]).toMatch(/private:\s*true/)
  })
})
