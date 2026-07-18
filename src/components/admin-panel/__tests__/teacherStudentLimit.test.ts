import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regressão: o limite de alunos por plano do professor.
 *
 * O caminho "Professor → + Aluno" fazia INSERT direto em `students` via cliente,
 * sem checagem nenhuma — um professor free (max 2) empilhava alunos sem teto. A
 * defesa é o trigger enforce_teacher_student_limit no banco (não burlável pelo
 * cliente), que chama a RPC teacher_can_add_student. A UI traduz o erro do trigger
 * numa mensagem de upgrade.
 */
const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260717190000_enforce_teacher_student_limit.sql'),
  'utf8',
)
const handler = readFileSync(
  join(process.cwd(), 'src/components/admin-panel/hooks/useAdminActions.ts'),
  'utf8',
)

describe('trigger de limite de alunos no banco', () => {
  it('é um BEFORE trigger em students que dispara no vínculo com professor', () => {
    expect(migration).toContain('CREATE TRIGGER trg_enforce_teacher_student_limit')
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF teacher_id ON public\.students/)
  })

  it('usa a RPC de limite (fonte de verdade: plan_tier_key → teacher_tiers)', () => {
    expect(migration).toContain('public.teacher_can_add_student(NEW.teacher_id)')
  })

  it('barra com o código que a UI reconhece', () => {
    expect(migration).toContain("RAISE EXCEPTION 'teacher_student_limit_reached'")
  })

  it('vínculo SEM professor (aluno de approve_access_request) não é barrado', () => {
    expect(migration).toContain('IF NEW.teacher_id IS NULL THEN')
  })

  it('admin e service_role fazem override (decisão do dono)', () => {
    expect(migration).toContain("coalesce(auth.role(), '') = 'service_role'")
    expect(migration).toContain('public.is_admin()')
  })

  it('UPDATE que não troca o professor não reconta', () => {
    expect(migration).toContain('NEW.teacher_id IS NOT DISTINCT FROM OLD.teacher_id')
  })
})

describe('UI — cadastro de aluno via rota de convite', () => {
  // Mudança (Fase 7): o "+ Aluno" deixou de fazer INSERT direto em `students` e passou a
  // chamar /api/teacher/students/invite (que além de cadastrar, PRÉ-APROVA pro primeiro
  // acesso por email). Como o insert vira service-role (bypassa o trigger), o limite é
  // enforçado NA ROTA (teacher_can_add_student) e devolvido como upgrade_required — a UI
  // traduz isso no CTA de upgrade. O trigger no banco segue como defesa dos demais caminhos.
  const invite = readFileSync(
    join(process.cwd(), 'src/app/api/teacher/students/invite/route.ts'),
    'utf8',
  )

  it('o handleRegisterStudent chama a rota de convite', () => {
    expect(handler).toContain('/api/teacher/students/invite')
  })

  it('traduz upgrade_required no CTA de upgrade', () => {
    expect(handler).toContain('upgrade_required')
    expect(handler).toMatch(/upgrade/i)
  })

  it('a rota de convite enforça o limite (teacher_can_add_student) antes do insert service-role', () => {
    expect(invite).toContain('teacher_can_add_student')
    expect(invite).toContain('upgrade_required')
  })
})
