import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guard do consent-gate do assign-teacher (auditoria do professor). Antes, um professor
 * "reivindicava" uma conta REAL já cadastrada (profiles existente, sem teacher_id) passando
 * o email da vítima — o resolveStudentRow auto-criava a linha `students` a partir do profiles
 * e o professor ganhava acesso de coach aos dados (treino/saúde) sem consentimento.
 * Fix: para role 'teacher', resolver com autoCreate:false; só permite convidar email
 * NÃO-cadastrado (sem profiles) ou operar sobre aluno já vinculado; vincular conta existente
 * exige consentimento/admin. Admin mantém autoCreate.
 */
describe('assign-teacher — consent-gate', () => {
  const src = readFileSync('src/app/api/admin/students/assign-teacher/route.ts', 'utf8')

  it('role teacher resolve sem auto-criar (autoCreate:false)', () => {
    expect(src).toMatch(/auth\.role === 'teacher'/)
    expect(src).toMatch(/resolveStudentRow\(admin,\s*\{\s*id:\s*lookupId,\s*email,\s*autoCreate:\s*false\s*\}\)/)
  })

  it('bloqueia reivindicar conta cadastrada (existing.user_id ou profiles existente)', () => {
    // guard sobre linha existente com user_id real
    expect(src).toMatch(/currentTeacher !== auth\.user\.id && existing\.user_id/)
    // guard quando não há linha mas existe profiles (conta real)
    expect(src).toMatch(/from\('profiles'\)[\s\S]*prof\?\.id/)
    // mensagem de consentimento
    expect(src).toMatch(/exige consentimento do aluno ou ação do admin/)
  })

  it('admin mantém o comportamento antigo (auto-create)', () => {
    expect(src).toMatch(/\}\s*else\s*\{[\s\S]*resolveStudentRow\(admin,\s*\{\s*id:\s*lookupId,\s*email\s*\}\)/)
  })
})
