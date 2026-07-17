import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guards do fluxo "aplicar treino a vários alunos". O handler tem que reusar a porta única
 * (saveTeacherWorkout) por aluno, notificar cada um, e tolerar falha parcial (uma gravação
 * que falha não pode abortar as outras nem impedir o resumo). O seletor só pode oferecer
 * alunos aptos (eligibleStudentsForApply).
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('handleApplyTemplateToStudents', () => {
  const code = stripComments(readFileSync('src/components/admin-panel/hooks/useAdminTemplateOps.ts', 'utf8'))

  it('grava via saveTeacherWorkout dentro de um loop (por aluno)', () => {
    expect(code).toMatch(/for\s*\(const\s+ownerUserId\s+of\s+ids\)/)
    expect(code).toMatch(/saveTeacherWorkout\(supabase,\s*\{/)
  })

  it('acumula falhas em vez de abortar no primeiro erro', () => {
    expect(code).toMatch(/failed\.push\(/)
    // não pode dar throw dentro do loop de aplicação em massa
    expect(code).toMatch(/if\s*\(res\.ok\)/)
  })

  it('notifica cada aluno que recebeu (dentro do ramo de sucesso)', () => {
    expect(code).toMatch(/notifyStudentWorkoutAssigned\(ownerUserId/)
  })

  it('dedup dos ids selecionados (Set) e guarda contra lista vazia', () => {
    expect(code).toMatch(/new Set\(/)
    expect(code).toMatch(/if\s*\(!ids\.length\)/)
  })
})

describe('seletor multi-aluno só oferece alunos aptos', () => {
  const tab = stripComments(readFileSync('src/components/admin-panel/StudentWorkoutsTab.tsx', 'utf8'))

  it('filtra os alunos com eligibleStudentsForApply antes de passar ao modal', () => {
    expect(tab).toMatch(/eligibleStudentsForApply\(usersList,\s*user\?\.id\)/)
  })

  it('abre o modal via applyManyTemplate', () => {
    expect(tab).toMatch(/setApplyManyTemplate\(t\)/)
    expect(tab).toMatch(/ApplyWorkoutToStudentsModal/)
  })
})

describe('biblioteca de treinos (TemplatesTab) aplica a vários sem entrar num aluno', () => {
  const tab = stripComments(readFileSync('src/components/admin-panel/TemplatesTab.tsx', 'utf8'))

  it('cada card abre o seletor de alunos (setApplyManyTemplate)', () => {
    expect(tab).toMatch(/setApplyManyTemplate\(/)
    expect(tab).toMatch(/Aplicar a alunos/)
  })

  it('monta o modal filtrando alunos aptos', () => {
    expect(tab).toMatch(/ApplyWorkoutToStudentsModal/)
    expect(tab).toMatch(/eligibleStudentsForApply\(usersList,\s*user\?\.id\)/)
  })
})
