import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * O Wizard "criar treino automático" do professor gerava pela rota workout-wizard, que
 * personaliza pelos dados de QUEM clica (o professor) e gasta a cota dele — o treino
 * "do aluno" saía sem relação com o aluno. A correção liga o Wizard à rota student-workout
 * (recebe studentId, lê perfil/avaliação do aluno, valida canCoachStudent). Estes guards
 * travam a ligação e a cota.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('Wizard do professor usa a rota que olha o ALUNO', () => {
  const code = stripComments(readFileSync('src/components/admin-panel/hooks/useStudentWorkoutCreate.ts', 'utf8'))

  it('onWizardGenerate chama apiAi.studentWorkout (não workoutWizard)', () => {
    expect(code).toMatch(/apiAi\.studentWorkout\(/)
    expect(code).not.toMatch(/apiAi\.workoutWizard\(/)
  })

  it('passa o studentId do aluno selecionado', () => {
    expect(code).toMatch(/wizardAnswersToStudentPayload\(/)
    expect(code).toMatch(/selectedStudent\?\.user_id/)
  })
})

describe('rota student-workout: gate + metering de cota', () => {
  const src = stripComments(readFileSync('src/app/api/ai/student-workout/route.ts', 'utf8'))

  it('mantém o gate de autorização canCoachStudent (anti-IDOR)', () => {
    expect(src).toMatch(/canCoachStudent\(/)
  })

  it('checa a cota VIP antes de gerar', () => {
    expect(src).toMatch(/checkVipFeatureAccess\([^)]*wizard_weekly/)
  })

  it('contabiliza o uso após sucesso', () => {
    expect(src).toMatch(/incrementVipUsage\([^)]*['"]wizard['"]\s*\)/)
  })
})
