import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Fase 7 — "primeiro acesso" do aluno convidado. Guards de regressão (source-guards):
 *  - CONVITE (teacher/students/invite): só admin/teacher; consent-gate anti-sequestro (não
 *    reivindica conta `profiles` já existente); limite do plano; cria students + access_request
 *    PRÉ-APROVADO via service-role; não vaza erro cru.
 *  - LOGIN OTP (useLoginScreen): entra só com email (signInWithOtp shouldCreateUser) + verifica
 *    o código (verifyOtp type 'email') e vai pro /onboarding.
 *  - ONBOARDING (onboarding/complete): requireUser; edita só a PRÓPRIA conta (userId da sessão).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('rota teacher/students/invite (convite + pré-aprovação)', () => {
  const src = stripComments(readFileSync('src/app/api/teacher/students/invite/route.ts', 'utf8'))

  it('exige role admin/teacher', () => {
    expect(src).toMatch(/requireRole\(\s*\[\s*['"]admin['"]\s*,\s*['"]teacher['"]\s*\]\s*\)/)
  })

  it('consent-gate: recusa email que já tem conta (profiles) — anti-sequestro', () => {
    expect(src).toMatch(/from\(\s*['"]profiles['"]\s*\)/)
    expect(src).toMatch(/already_registered/)
  })

  it('recusa aluno que já é de OUTRO professor', () => {
    expect(src).toMatch(/belongs_to_other_teacher/)
  })

  it('respeita o limite de alunos do plano (teacher_can_add_student)', () => {
    expect(src).toMatch(/teacher_can_add_student/)
    expect(src).toMatch(/upgrade_required/)
  })

  it('ADMIN é isento do limite de plano (senão travaria no 3º cadastro — achado da revisão)', () => {
    // O limite só vale pro professor. A checagem tem que ser gateada por caller = teacher,
    // espelhando o override is_admin() do trigger. Sem isso, o admin (sem plano) cai no free
    // max=2 e não consegue cadastrar o 3º aluno.
    expect(src).toMatch(/auth\.role\s*===\s*['"]teacher['"]/)
    expect(src).toMatch(/isTeacherCaller\s*&&/)
  })

  it('cria a linha students com teacher_id = caller (via service-role)', () => {
    expect(src).toMatch(/createAdminClient\(\)/)
    expect(src).toMatch(/from\(\s*['"]students['"]\s*\)/)
    expect(src).toMatch(/teacher_id:\s*callerId/)
  })

  it('cria access_request PRÉ-APROVADO (status approved, role student) — é a aprovação', () => {
    expect(src).toMatch(/from\(\s*['"]access_requests['"]\s*\)/)
    expect(src).toMatch(/status:\s*['"]approved['"]/)
    expect(src).toMatch(/role_requested:\s*['"]student['"]/)
  })

  it('não vaza erro cru do Postgres (usa respondDbError / código genérico)', () => {
    expect(src).toMatch(/respondDbError\(|error:\s*['"]internal_error['"]/)
  })
})

describe('nome do aluno convidado (anti "nome feio" no OTP)', () => {
  const layout = stripComments(readFileSync('src/app/(app)/layout.tsx', 'utf8'))

  it('o (app)/layout grava display_name do convite ao auto-aprovar (OTP não traz nome)', () => {
    // Regressão da revisão: aluno por OTP fica com display_name = prefixo do email. O branch
    // de auto-aprovação (só roda no 1º login) precisa gravar o nome do access_request.
    expect(layout).toMatch(/approvalPayload\.display_name\s*=\s*fullName/)
  })
})

describe('rota onboarding/complete (conclui o primeiro acesso)', () => {
  const src = stripComments(readFileSync('src/app/api/onboarding/complete/route.ts', 'utf8'))

  it('exige usuário logado e edita só a PRÓPRIA conta (userId da sessão, não do body)', () => {
    expect(src).toMatch(/requireUser\(\)/)
    expect(src).toMatch(/const userId = String\(auth\.user\.id/)
    expect(src).toMatch(/\.eq\(\s*['"]id['"]\s*,\s*userId\s*\)/)
  })

  it('não confia em id vindo do body (não desestrutura userId/id do parsed)', () => {
    expect(src).not.toMatch(/userId\s*[:=].*parsed/)
  })

  it('não vaza erro cru do Postgres', () => {
    expect(src).toMatch(/database_error|internal_error/)
  })
})

describe('login primeiro acesso OTP (useLoginScreen)', () => {
  const src = stripComments(readFileSync('src/hooks/useLoginScreen.ts', 'utf8'))

  it('entra só com email: signInWithOtp com shouldCreateUser', () => {
    expect(src).toMatch(/signInWithOtp\(/)
    expect(src).toMatch(/shouldCreateUser:\s*true/)
  })

  it('verifica o código com verifyOtp type email', () => {
    expect(src).toMatch(/verifyOtp\(/)
    expect(src).toMatch(/type:\s*['"]email['"]/)
  })

  it('após verificar, vai pro /onboarding', () => {
    expect(src).toMatch(/replace\(\s*['"]\/onboarding['"]\s*\)/)
  })

  it('email não cadastrado dá mensagem clara (não vaza erro cru)', () => {
    expect(src).toMatch(/isWhitelistError/)
  })
})
