import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guards da auditoria de push (segurança):
 *  - appointment-created: usa o helper fail-closed e NÃO tem mais o curto-circuito
 *    `student.teacher_id && ...` que liberava aluno órfão.
 *  - todo cron: autoriza por `isCronAuthorized` (fail-closed) e nunca compara o
 *    segredo à mão.
 *
 * ⚠️ A segunda metade era um guard da INSTÂNCIA: ela mirava só em
 * `nutrition/reminders/trigger`, a rota que motivou a auditoria. Quando aquela
 * rota saiu (05/09/2026 — lia uma tabela que nunca foi criada), o caso ficaria
 * sem alvo e o invariante, sem dono. Hoje ele varre a pasta inteira: cron novo
 * entra coberto sozinho.
 */
const CRONS_DIR = 'src/app/api/cron'
describe('appointment-created — authz fail-closed', () => {
  const src = readFileSync('src/app/api/notifications/appointment-created/route.ts', 'utf8')
  it('usa canNotifyStudentAppointment', () => {
    expect(src).toMatch(/canNotifyStudentAppointment\(/)
  })
  it('não tem mais o curto-circuito com teacher_id truthy', () => {
    expect(src).not.toMatch(/student\.teacher_id && student\.teacher_id !== user\.id/)
  })
})

describe('crons — authz fail-closed (classe inteira)', () => {
  const rotas = readdirSync(CRONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== '__tests__')
    .map((e) => join(CRONS_DIR, e.name, 'route.ts'))
    .filter((p) => {
      try { readFileSync(p, 'utf8'); return true } catch { return false }
    })

  it('a varredura encontra os crons (senão o guard fica cego)', () => {
    expect(rotas.length).toBeGreaterThan(5)
  })

  it.each(rotas)('%s autoriza por isCronAuthorized', (rota) => {
    expect(readFileSync(rota, 'utf8')).toMatch(/isCronAuthorized\(req\)/)
  })

  it.each(rotas)('%s não compara o segredo à mão', (rota) => {
    // A comparação manual é fail-open (segredo ausente = todo mundo passa) e não
    // é de tempo constante — as duas coisas que o helper resolve.
    expect(readFileSync(rota, 'utf8')).not.toMatch(/Bearer \$\{\s*cronSecret\s*\}/)
  })
})
