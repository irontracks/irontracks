import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regressão que quebrou a criação de treino do PROFESSOR pro aluno: os caminhos do painel
 * gravavam `supabase.from('exercises').insert({ sets, reps, rpe, ... })`, mas a tabela
 * `exercises` NÃO tem essas colunas (normalizadas em `sets`) — o PostgREST rejeitava o
 * insert inteiro e o exercício sumia. A correção roteia TODOS os caminhos pela RPC
 * `save_workout_atomic` via `saveTeacherWorkout`. Estes guards travam a correção: se um
 * refactor reintroduzir o insert/update direto em `exercises`/`sets`, o CI falha.
 */

/** Remove comentários pra o guard não casar com os termos citados na documentação. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const PATHS = [
  'src/components/admin-panel/StudentDetailPanel.tsx',
  'src/components/admin-panel/hooks/useStudentWorkoutCreate.ts',
  'src/components/admin-panel/hooks/useAdminTemplateOps.ts',
]

describe('escrita de treino do professor passa pela RPC (save_workout_atomic)', () => {
  for (const path of PATHS) {
    const code = stripComments(readFileSync(path, 'utf8'))

    it(`${path}: usa saveTeacherWorkout`, () => {
      expect(code).toMatch(/saveTeacherWorkout\s*\(/)
    })

    it(`${path}: NÃO faz insert/update direto em exercises`, () => {
      expect(code).not.toMatch(/from\(\s*['"]exercises['"]\s*\)\s*\.\s*(insert|update)/)
    })

    it(`${path}: NÃO faz insert direto em sets`, () => {
      expect(code).not.toMatch(/from\(\s*['"]sets['"]\s*\)\s*\.\s*insert/)
    })
  }
})

describe('o wrapper chama a RPC certa com o professor como created_by', () => {
  const code = stripComments(readFileSync('src/lib/workout/teacherWorkoutPayload.ts', 'utf8'))

  it('invoca save_workout_atomic', () => {
    expect(code).toMatch(/rpc\(\s*['"]save_workout_atomic['"]/)
  })

  it('grava is_template = true (RLS silo do professor exige)', () => {
    expect(code).toMatch(/p_is_template:\s*true/)
  })

  it('separa dono (p_user_id) de autor (p_created_by)', () => {
    expect(code).toMatch(/p_user_id:\s*params\.ownerUserId/)
    expect(code).toMatch(/p_created_by:\s*params\.authorUserId/)
  })
})
