import { describe, it, expect } from 'vitest'
import { eligibleStudentsForApply } from '../eligibleStudents'

/**
 * Só podem RECEBER um treino em massa os alunos DO professor (teacher_id) que já têm conta
 * (user_id = auth uid). A RLS barra o resto; filtrar aqui evita oferecer no seletor quem
 * não pode receber. Estes testes travam esse filtro.
 */
describe('eligibleStudentsForApply', () => {
  const teacher = 'prof-1'
  const users = [
    { name: 'Com conta (meu)', teacher_id: 'prof-1', user_id: 'uid-a' },
    { name: 'Sem conta (meu)', teacher_id: 'prof-1', user_id: '' },
    { name: 'Sem user_id null (meu)', teacher_id: 'prof-1', user_id: null },
    { name: 'De outro professor', teacher_id: 'prof-2', user_id: 'uid-b' },
    { name: 'Órfão', teacher_id: null, user_id: 'uid-c' },
    { name: 'Outro meu com conta', teacher_id: 'prof-1', user_id: 'uid-d' },
  ]

  it('mantém só alunos do professor COM conta', () => {
    const out = eligibleStudentsForApply(users, teacher)
    expect(out.map((u) => u.name)).toEqual(['Com conta (meu)', 'Outro meu com conta'])
  })

  it('exclui alunos de outro professor', () => {
    const out = eligibleStudentsForApply(users, teacher)
    expect(out.some((u) => u.teacher_id === 'prof-2')).toBe(false)
  })

  it('exclui alunos sem user_id (sem conta no app)', () => {
    const out = eligibleStudentsForApply(users, teacher)
    expect(out.every((u) => String(u.user_id || '').trim() !== '')).toBe(true)
  })

  it('teacherId vazio → lista vazia (não vaza todos os alunos)', () => {
    expect(eligibleStudentsForApply(users, '')).toEqual([])
    expect(eligibleStudentsForApply(users, null)).toEqual([])
    expect(eligibleStudentsForApply(users, undefined)).toEqual([])
  })

  it('entrada não-array → []', () => {
    expect(eligibleStudentsForApply(null, teacher)).toEqual([])
    expect(eligibleStudentsForApply(undefined, teacher)).toEqual([])
  })
})
