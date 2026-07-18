import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Fase 8 — crons de PIX-auto do aluno (lembrete + suspensão). Guards:
 *  - ambos exigem isCronAuthorized (403 sem o segredo);
 *  - due: só assinaturas recorrentes por PIX que vencem HOJE (casamento exato = idempotente);
 *  - suspend: só transiciona active→past_due após a carência (idempotente, sem re-notificar);
 *  - ambos registrados no vercel.json.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('cron student-charges-due (lembrete PIX)', () => {
  const src = stripComments(readFileSync('src/app/api/cron/student-charges-due/route.ts', 'utf8'))

  it('exige autorização de cron', () => {
    expect(src).toMatch(/isCronAuthorized\(req\)/)
    expect(src).toMatch(/forbidden/)
  })

  it('filtra recorrente + PIX + ativo + vence hoje (idempotente por data exata)', () => {
    expect(src).toMatch(/\.eq\(\s*['"]recurring['"]\s*,\s*true\s*\)/)
    expect(src).toMatch(/\.eq\(\s*['"]billing_method['"]\s*,\s*['"]pix['"]\s*\)/)
    expect(src).toMatch(/\.eq\(\s*['"]next_due_date['"]\s*,\s*today\s*\)/)
  })
})

describe('cron student-charges-suspend (carência)', () => {
  const src = stripComments(readFileSync('src/app/api/cron/student-charges-suspend/route.ts', 'utf8'))

  it('exige autorização de cron', () => {
    expect(src).toMatch(/isCronAuthorized\(req\)/)
  })

  it('só pega active vencidas além da carência e transiciona pra past_due (idempotente)', () => {
    expect(src).toMatch(/\.eq\(\s*['"]status['"]\s*,\s*['"]active['"]\s*\)/)
    expect(src).toMatch(/\.lt\(\s*['"]expires_at['"]/)
    expect(src).toMatch(/status:\s*['"]past_due['"]/)
  })

  it('notifica aluno E professor', () => {
    expect(src).toMatch(/student_subscription_suspended/)
    expect(src).toMatch(/student_subscription_suspended_teacher/)
  })
})

describe('vercel.json registra os crons novos', () => {
  const vj = readFileSync('vercel.json', 'utf8')
  it('agenda student-charges-due e student-charges-suspend', () => {
    expect(vj).toMatch(/\/api\/cron\/student-charges-due/)
    expect(vj).toMatch(/\/api\/cron\/student-charges-suspend/)
  })
})
