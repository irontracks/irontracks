import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Professor monta periodização PRO ALUNO. Guards: só admin/teacher; canCoachStudent (só
 * aluno DELE, anti-IDOR); cota na conta do professor; e o motor compartilhado grava com
 * dono = aluno (ownerUserId) e autor = professor (authorUserId). A rota VIP self-service
 * DEVE continuar usando o mesmo motor (a refatoração não pode ter duplicado/divergido).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('rota teacher/periodization/create', () => {
  const src = stripComments(readFileSync('src/app/api/teacher/periodization/create/route.ts', 'utf8'))

  it('exige role admin/teacher', () => {
    expect(src).toMatch(/requireRole\(\s*\[\s*['"]admin['"]\s*,\s*['"]teacher['"]\s*\]\s*\)/)
  })

  it('valida o vínculo com canCoachStudent (fail-closed)', () => {
    expect(src).toMatch(/canCoachStudent\(/)
    expect(src).toMatch(/forbidden/)
  })

  it('checa e mete a cota na conta do professor', () => {
    expect(src).toMatch(/checkVipFeatureAccess\([^)]*teacherId/)
    expect(src).toMatch(/incrementVipUsage\([^)]*teacherId/)
  })

  it('cria via motor compartilhado: dono = aluno, autor = professor', () => {
    expect(src).toMatch(/createPeriodizationProgram\(/)
    expect(src).toMatch(/ownerUserId:\s*studentId/)
    expect(src).toMatch(/authorUserId:\s*teacherId/)
  })
})

describe('motor compartilhado + reuso na rota VIP', () => {
  const engine = stripComments(readFileSync('src/lib/vip/periodizationCreate.ts', 'utf8'))
  const vip = stripComments(readFileSync('src/app/api/vip/periodization/create/route.ts', 'utf8'))

  it('o motor grava user_id = dono e p_created_by = autor', () => {
    expect(engine).toMatch(/user_id:\s*ownerUserId/)
    expect(engine).toMatch(/p_created_by:\s*authorUserId/)
  })

  it('registra o professor no config quando dono ≠ autor', () => {
    expect(engine).toMatch(/created_by_teacher/)
  })

  it('erro de DB NÃO vaza a mensagem crua do Postgres (loga + código genérico)', () => {
    // Regressão da revisão: throw new Error(pErr.message) vazaria nome de tabela/coluna/RLS.
    expect(engine).not.toMatch(/throw new Error\((?:pErr|sErr|linkErr)\.message/)
    expect(engine).toMatch(/logError\('periodization:/)
    expect(engine).toMatch(/throw new Error\('database_error'\)/)
  })

  it('a rota VIP self-service reusa o MESMO motor (dono = autor = próprio usuário)', () => {
    expect(vip).toMatch(/createPeriodizationProgram\(/)
    expect(vip).toMatch(/ownerUserId:\s*userId/)
    expect(vip).toMatch(/authorUserId:\s*userId/)
  })
})
