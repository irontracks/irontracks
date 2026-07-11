import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regression (auditoria auth): a rota apple/preflight insere na whitelist `students`
 * usando o admin client (service role, ignora RLS). Um usuário autenticado via Bearer
 * só pode pré-whitelistar o PRÓPRIO email — senão qualquer usuário logado cadastra
 * emails arbitrários (bypass do invite-gating do Apple Sign-In). O caminho
 * internal-secret (server confiável) permanece livre.
 */
describe('apple/preflight — amarra o email ao usuário autenticado', () => {
  const src = readFileSync('src/app/api/auth/apple/preflight/route.ts', 'utf8')

  it('distingue auth via secret (livre) de auth via Bearer (restrito)', () => {
    expect(src).toMatch(/viaSecret/)
    expect(src).toMatch(/bearerEmail/)
  })

  it('captura o email do bearer validado', () => {
    expect(src).toMatch(/bearerEmail\s*=\s*String\(\s*data\.user\.email/)
  })

  it('rejeita (403) quando o Bearer tenta email diferente do próprio', () => {
    expect(src).toMatch(/if\s*\(\s*!viaSecret\s*&&\s*\(\s*!bearerEmail\s*\|\|\s*email\s*!==\s*bearerEmail\s*\)\s*\)/)
    expect(src).toMatch(/status:\s*403/)
  })
})
