import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Source-guards da auditoria de push (segurança):
 *  - appointment-created: usa o helper fail-closed e NÃO tem mais o curto-circuito
 *    `student.teacher_id && ...` que liberava aluno órfão.
 *  - nutrition/reminders/trigger: usa isCronAuthorized (fail-closed) e NÃO tem mais o
 *    check fail-open dentro de `if (cronSecret)`.
 */
describe('appointment-created — authz fail-closed', () => {
  const src = readFileSync('src/app/api/notifications/appointment-created/route.ts', 'utf8')
  it('usa canNotifyStudentAppointment', () => {
    expect(src).toMatch(/canNotifyStudentAppointment\(/)
  })
  it('não tem mais o curto-circuito com teacher_id truthy', () => {
    expect(src).not.toMatch(/student\.teacher_id && student\.teacher_id !== user\.id/)
  })
})

describe('nutrition/reminders/trigger — cron fail-closed', () => {
  const src = readFileSync('src/app/api/nutrition/reminders/trigger/route.ts', 'utf8')
  it('usa isCronAuthorized', () => {
    expect(src).toMatch(/isCronAuthorized\(req\)/)
  })
  it('não tem mais a comparação fail-open/não-constante `!== Bearer ${cronSecret}`', () => {
    expect(src).not.toMatch(/!== `Bearer \$\{cronSecret\}`/)
  })
})
