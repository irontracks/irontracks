import { describe, it, expect } from 'vitest'
import { isExpectedAuthError } from '../expectedAuthError'

describe('isExpectedAuthError', () => {
  it('reconhece o AuthError do Supabase por code (o caso do Sentry: otp_expired)', () => {
    expect(isExpectedAuthError({ __isAuthError: true, code: 'otp_expired', status: 403 })).toBe(true)
    expect(isExpectedAuthError({ code: 'invalid_credentials' })).toBe(true)
    expect(isExpectedAuthError({ code: 'over_email_send_rate_limit' })).toBe(true)
  })

  it('reconhece por mensagem quando não há code', () => {
    expect(isExpectedAuthError(new Error('Token has expired or is invalid'))).toBe(true)
    expect(isExpectedAuthError(new Error('Invalid login credentials'))).toBe(true)
    expect(isExpectedAuthError(new Error('Email rate limit exceeded'))).toBe(true)
    expect(isExpectedAuthError('otp expired')).toBe(true)
  })

  it('NÃO classifica falhas reais/desconhecidas como esperadas (essas vão pro Sentry)', () => {
    expect(isExpectedAuthError(new Error('Database error saving new user'))).toBe(false)
    expect(isExpectedAuthError(new Error('Unexpected server error 500'))).toBe(false)
    expect(isExpectedAuthError({ code: 'internal_error' })).toBe(false)
    expect(isExpectedAuthError(null)).toBe(false)
    expect(isExpectedAuthError(undefined)).toBe(false)
    expect(isExpectedAuthError({})).toBe(false)
  })

  it('code tem prioridade e é case-insensitive', () => {
    expect(isExpectedAuthError({ code: 'OTP_EXPIRED' })).toBe(true)
  })
})
