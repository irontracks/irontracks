import { describe, it, expect } from 'vitest'
import { decodeAppleEmailFromToken } from '../appleToken'

// Monta um JWT fake (header.payload.signature) com payload base64url, igual ao
// identityToken da Apple. A assinatura é irrelevante — o decoder não verifica.
const b64url = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const makeToken = (payload: Record<string, unknown>) =>
  `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(payload)}.assinatura_fake`

describe('decodeAppleEmailFromToken', () => {
  it('extrai o email do claim do JWT', () => {
    const token = makeToken({ sub: '000123.abc', email: 'reviewer@example.com', email_verified: 'true' })
    expect(decodeAppleEmailFromToken(token)).toBe('reviewer@example.com')
  })

  it('extrai relay "Hide My Email" da Apple', () => {
    const token = makeToken({ email: 'gxqp24g38b5sj8vtabz@privaterelay.appleid.com' })
    expect(decodeAppleEmailFromToken(token)).toBe('gxqp24g38b5sj8vtabz@privaterelay.appleid.com')
  })

  it('normaliza para lowercase e remove espaços', () => {
    const token = makeToken({ email: '  Reviewer@Example.COM  ' })
    expect(decodeAppleEmailFromToken(token)).toBe('reviewer@example.com')
  })

  it('retorna vazio quando o payload não tem email (re-login sem o campo)', () => {
    const token = makeToken({ sub: '000123.abc' })
    expect(decodeAppleEmailFromToken(token)).toBe('')
  })

  it('é tolerante a tokens malformados', () => {
    expect(decodeAppleEmailFromToken('')).toBe('')
    expect(decodeAppleEmailFromToken('nao-e-um-jwt')).toBe('')
    expect(decodeAppleEmailFromToken('a.b')).toBe('') // payload "b" não é JSON
    // @ts-expect-error — garante robustez contra valores não-string em runtime
    expect(decodeAppleEmailFromToken(null)).toBe('')
    // @ts-expect-error
    expect(decodeAppleEmailFromToken(undefined)).toBe('')
  })
})
