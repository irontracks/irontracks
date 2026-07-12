import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Guard da migration de hygiene da área de professor: revoga TRUNCATE/anon-writes residuais
 * e corrige a policy de storage (coluna s.name -> objects.name). Defense-in-depth.
 */
describe('migration teacher_area_grant_hygiene_and_storage_policy_fix', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('teacher_area_grant_hygiene_and_storage_policy_fix'))
  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''

  it('revoga TRUNCATE das tabelas de coach/billing', () => {
    expect(file).toBeTruthy()
    expect(sql).toMatch(/revoke truncate on public\.coach_inbox_states from authenticated, anon/i)
    expect(sql).toMatch(/revoke truncate on public\.student_charges from authenticated, anon/i)
    expect(sql).toMatch(/revoke truncate on public\.student_subscriptions from authenticated, anon/i)
  })
  it('revoga writes de anon em exercise_execution_submissions', () => {
    expect(sql).toMatch(/revoke insert, update, delete on public\.exercise_execution_submissions from anon/i)
  })
  it('corrige a policy de storage para objects.name (não s.name)', () => {
    // a policy recriada usa objects.name; o único s.name que sobra é na frase do comentário
    expect(sql).toMatch(/storage\.foldername\(objects\.name\)/)
    const createClause = sql.slice(sql.indexOf('create policy execution_videos_select_own_teacher_admin'))
    expect(createClause).not.toMatch(/storage\.foldername\(s\.name\)/)
  })
})
