import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regression guard — banner "aluno iniciou o treino" com o app fechado.
 *
 * Bug: o hook reagia SÓ ao INSERT ao vivo do realtime. Se o professor abrisse o app
 * DEPOIS do aluno iniciar (app fechado no INSERT), não havia evento pra capturar → o
 * banner não aparecia. Fix: fetch inicial no mount que semeia o banner pras sessões
 * ativas recentes e ainda não controladas dos alunos do professor.
 */
describe('useStudentWorkoutStartAlerts — semeia banner no mount (app aberto após início)', () => {
  const src = readFileSync('src/hooks/useStudentWorkoutStartAlerts.ts', 'utf8')

  it('faz um SELECT inicial de active_workout_sessions no mount', () => {
    expect(src).toContain("from('active_workout_sessions')")
    expect(src).toContain('started_at')
    // Janela recente (não semeia treino antigo).
    expect(src).toContain('INITIAL_LOOKBACK_MS')
    expect(src).toContain('gte(')
  })

  it('não semeia a própria sessão do professor nem sessões já controladas', () => {
    expect(src).toMatch(/uid === teacherUserId/)
    expect(src).toMatch(/control_status[\s\S]*!== 'active'/)
  })

  it('mantém o realtime ao vivo (INSERT/DELETE) além do fetch inicial', () => {
    expect(src).toContain("event: '*'")
    expect(src).toMatch(/ev === 'DELETE'/)
    expect(src).toMatch(/ev !== 'INSERT'/)
  })
})
