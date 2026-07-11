import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Regression do CRÍTICO de dados de saúde (auditoria 2026-07-11): vazamento cross-user via
 * trainer_id auto-declarável. Fix em 2 camadas:
 *  (a) RLS de trainer de assessments/body_photo_assessments/lab_exams exige vínculo real em
 *      students (bloqueia a forja {user_id: vítima, trainer_id: self});
 *  (b) rotas de IA gateiam por canCoachStudent, não por row.trainer_id.
 */
describe('migration health_data_trainer_rls_require_student_link', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('health_data_trainer_rls_require_student_link'))
  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''

  it('existe e cada trainer policy exige vínculo em students', () => {
    expect(file).toBeTruthy()
    for (const t of ['body_photo_assessments', 'lab_exams', 'assessments']) {
      expect(sql).toMatch(new RegExp(`exists \\(select 1 from public\\.students s where s\\.user_id = ${t}\\.user_id and s\\.teacher_id = auth\\.uid\\(\\)\\)`, 'i'))
    }
  })

  it('dropa as policies redundantes de trainer em assessments', () => {
    expect(sql).toMatch(/drop policy if exists "Authenticated insert as trainer" on public\.assessments/i)
    expect(sql).toMatch(/drop policy if exists "Authenticated manage own trainer assessments" on public\.assessments/i)
    expect(sql).toMatch(/drop policy if exists "Authenticated delete own trainer assessments" on public\.assessments/i)
  })
})

describe('rotas de IA de saúde gateiam por canCoachStudent (não por trainer_id)', () => {
  const routes = [
    'src/app/api/ai/body-composition-correlation/route.ts',
    'src/app/api/ai/lab-exam-protocol/route.ts',
    'src/app/api/ai/body-composition-photo/route.ts',
  ]
  for (const r of routes) {
    it(`${path.basename(path.dirname(r))} usa canCoachStudent e não confia em trainer_id no gate`, () => {
      const src = readFileSync(r, 'utf8')
      expect(src).toMatch(/import \{ canCoachStudent \} from '@\/utils\/auth\/studentAccess'/)
      expect(src).toMatch(/!\(await canCoachStudent\(\{ id: userId, email: auth\.user\.email \}/)
      // o gate não pode mais liberar só por igualdade a trainer_id
      expect(src).not.toMatch(/userId !== \w*\.?trainer_id\) \{/)
      expect(src).not.toMatch(/userId !== trainerId\) \{/)
    })
  }
})
