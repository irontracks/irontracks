import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Guards da parte 2 da auditoria de gamificação/execução:
 *  - iron_rank_leaderboard: teto por set (LEAST 1000/100) + opt-out real (showIronRank);
 *  - trigger ees_guard_review_fields: aluno não auto-aprova (preserva status/feedback/reviewed_*);
 *  - revoga escrita de anon nas tabelas de dado de saúde.
 */
describe('migration leaderboard_cap_optout_and_submission_review_guard', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('leaderboard_cap_optout_and_submission_review_guard'))
  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''

  it('iron_rank_leaderboard: teto por set + log legado', () => {
    expect(sql).toMatch(/LEAST\(COALESCE\(s\.weight, 0\), 1000\) \* LEAST\(COALESCE\(public\.try_parse_numeric\(s\.reps::text\), 0\), 100\)/)
    expect(sql).toMatch(/SUM\(LEAST\(public\.set_volume_from_log\(j\.value\), 100000\)\)/)
  })

  it('iron_rank_leaderboard: opt-out real via showIronRank', () => {
    expect(sql).toMatch(/left join public\.user_settings us on us\.user_id = p\.id/i)
    expect(sql).toMatch(/COALESCE\(\(us\.preferences->>'showIronRank'\)::boolean, true\) = true/i)
  })

  it('trigger ees_guard_review_fields preserva os campos de revisão para não-professor', () => {
    expect(sql).toMatch(/create trigger ees_guard_review_fields before update on public\.exercise_execution_submissions/i)
    expect(sql).toMatch(/new\.status := old\.status/)
    expect(sql).toMatch(/new\.reviewed_by := old\.reviewed_by/)
    // professor-do-aluno / admin / service_role passam
    expect(sql).toMatch(/service_role[\s\S]*is_admin\(\)[\s\S]*s\.teacher_id = auth\.uid\(\)/)
  })

  it('revoga escrita de anon nas tabelas de saúde', () => {
    for (const t of ['assessments', 'body_photo_assessments', 'lab_exams', 'lab_exam_files', 'body_photo_assessment_photos']) {
      expect(sql).toMatch(new RegExp(`revoke insert, update, delete on public\\.${t} from anon`, 'i'))
    }
  })
})
