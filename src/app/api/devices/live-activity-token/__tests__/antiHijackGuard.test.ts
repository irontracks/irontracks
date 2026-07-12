import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guard #3 (auditoria push): a rota de token de Live Activity recusa (409) se o token já
 * pertence a OUTRO usuário — anti-hijack, espelhando push/register.
 */
describe('devices/live-activity-token — anti-hijack', () => {
  const src = readFileSync('src/app/api/devices/live-activity-token/route.ts', 'utf8')
  it('checa dono diferente antes do upsert e retorna 409', () => {
    expect(src).toMatch(/\.neq\('user_id', user\.id\)/)
    expect(src).toMatch(/token_owned_by_another_user/)
    // a checagem precisa vir ANTES do upsert
    const idxCheck = src.indexOf('token_owned_by_another_user')
    const idxUpsert = src.indexOf('.upsert(')
    expect(idxCheck).toBeGreaterThan(-1)
    expect(idxCheck).toBeLessThan(idxUpsert)
  })
})
