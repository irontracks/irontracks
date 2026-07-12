import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guards da feature "aluno iniciou treino -> professor assume":
 *  - a rota workout-start notifica o(s) professor(es) do aluno via push (preference-gated);
 *  - o push carrega type=student_workout_start e a categoria nativa TEACHER_ASSUME_CONTROL;
 *  - o handler de push trata a ação ASSUME_CONTROL disparando o request de controle;
 *  - existe a preferência notifyStudentWorkoutStart.
 */
const read = (p: string) => readFileSync(p, 'utf8')

describe('feature: aluno iniciou treino -> professor assume', () => {
  it('rota workout-start notifica o professor (push preference-gated)', () => {
    const src = read('src/app/api/social/workout-start/route.ts')
    expect(src).toMatch(/from\('students'\)\s*\.select\('teacher_id'\)/)
    expect(src).toMatch(/type: 'student_workout_start'/)
    expect(src).toMatch(/preferenceKey: 'notifyStudentWorkoutStart'/)
  })

  it('preferência existe no schema (default ligado)', () => {
    expect(read('src/schemas/settings.ts')).toMatch(/notifyStudentWorkoutStart: z\.boolean\(\)\.default\(true\)/)
  })

  it('payload APNs usa a categoria nativa do botão', () => {
    expect(read('src/lib/push/helpers/apnsPayload.ts')).toMatch(/student_workout_start.*TEACHER_ASSUME_CONTROL/s)
  })

  it('handler de push trata a ação ASSUME_CONTROL -> request de controle', () => {
    const src = read('src/hooks/usePushNotifications.ts')
    expect(src).toMatch(/tappedAction === 'ASSUME_CONTROL'/)
    expect(src).toMatch(/\/api\/teacher\/control\/\$\{studentId\}/)
  })

  it('Swift registra a categoria/ação (nativo)', () => {
    const swift = read('ios/App/App/IronTracksNativePlugin.swift')
    expect(swift).toMatch(/identifier: "TEACHER_ASSUME_CONTROL"/)
    expect(swift).toMatch(/identifier: "ASSUME_CONTROL"/)
  })
})
