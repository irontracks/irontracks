import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Source-guards da rota que avisa o aluno "treino novo do professor". É uma escrita
 * disparada pelo professor pra outro usuário (o aluno) — precisa ser fail-closed:
 *  - só admin/teacher (requireRole);
 *  - só o professor DESTE aluno (canCoachStudent, que valida students.teacher_id);
 *  - respeita a preferência do aluno (notifyWorkoutAssigned) e usa o preferenceKey no push;
 *  - carrega o deep-link ('/dashboard') pro tap abrir a lista de treinos.
 */
describe('workout-assigned — authz + payload', () => {
  const src = readFileSync('src/app/api/notifications/workout-assigned/route.ts', 'utf8')

  it('exige role admin/teacher', () => {
    expect(src).toMatch(/requireRole\(\s*\[\s*['"]admin['"]\s*,\s*['"]teacher['"]\s*\]\s*\)/)
  })

  it('valida o vínculo professor↔aluno com canCoachStudent (fail-closed)', () => {
    expect(src).toMatch(/canCoachStudent\(/)
    expect(src).toMatch(/forbidden/)
  })

  it('respeita a preferência do aluno (notifyWorkoutAssigned)', () => {
    expect(src).toMatch(/notifyWorkoutAssigned/)
  })

  it('dispara push com o type e o deep-link certos', () => {
    expect(src).toMatch(/workout_assigned/)
    expect(src).toMatch(/link:\s*['"]\/dashboard['"]/)
  })

  it('passa o preferenceKey pro sender (respeita quiet-hours + master switch)', () => {
    expect(src).toMatch(/preferenceKey:\s*['"]notifyWorkoutAssigned['"]/)
  })
})
