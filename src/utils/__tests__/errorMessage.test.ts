import { describe, it, expect } from 'vitest'
import { getErrorMessage, getFriendlyApiError } from '@/utils/errorMessage'

// ────────────────────────────────────────────────────────────────────────────
// getErrorMessage
// ────────────────────────────────────────────────────────────────────────────
describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('returns string as-is', () => {
    expect(getErrorMessage('plain text')).toBe('plain text')
  })

  it('extracts message from object with message property', () => {
    expect(getErrorMessage({ message: 'obj error' })).toBe('obj error')
  })

  it('stringifies objects without message property', () => {
    expect(getErrorMessage({ code: 42 })).toBe('[object Object]')
  })

  it('handles null', () => {
    expect(getErrorMessage(null)).toBe('null')
  })

  it('handles undefined', () => {
    expect(getErrorMessage(undefined)).toBe('undefined')
  })

  it('handles number', () => {
    expect(getErrorMessage(500)).toBe('500')
  })

  it('handles boolean', () => {
    expect(getErrorMessage(false)).toBe('false')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// getFriendlyApiError
// ────────────────────────────────────────────────────────────────────────────
describe('getFriendlyApiError', () => {
  describe('rate limiting', () => {
    it('maps "rate_limited"', () => {
      expect(getFriendlyApiError('rate_limited')).toContain('Muitas requisições')
    })
    it('maps "Too Many Requests"', () => {
      expect(getFriendlyApiError('Too Many Requests')).toContain('Muitas requisições')
    })
    it('maps error containing "429"', () => {
      expect(getFriendlyApiError('Error 429')).toContain('Muitas requisições')
    })
  })

  describe('auth / session', () => {
    it('maps "unauthorized"', () => {
      expect(getFriendlyApiError('unauthorized')).toContain('Sessão expirada')
    })
    it('maps "jwt expired"', () => {
      expect(getFriendlyApiError('jwt expired')).toContain('Sessão expirada')
    })
    it('maps "session expired"', () => {
      expect(getFriendlyApiError('session expired')).toContain('Sessão expirada')
    })
  })

  describe('forbidden / VIP', () => {
    it('maps "forbidden"', () => {
      expect(getFriendlyApiError('forbidden')).toContain('Acesso restrito')
    })
    it('maps "vip_required"', () => {
      expect(getFriendlyApiError('vip_required')).toContain('VIP')
    })
    it('maps "permission denied"', () => {
      expect(getFriendlyApiError('permission denied')).toContain('Acesso restrito')
    })
  })

  describe('network / offline', () => {
    it('maps "Failed to fetch"', () => {
      expect(getFriendlyApiError('Failed to fetch')).toContain('Sem conexão')
    })
    it('maps "offline"', () => {
      expect(getFriendlyApiError('offline')).toContain('Sem conexão')
    })
  })

  describe('timeout', () => {
    it('maps "timeout"', () => {
      expect(getFriendlyApiError('timeout')).toContain('demorou muito')
    })
    it('maps "aborted"', () => {
      expect(getFriendlyApiError('aborted')).toContain('demorou muito')
    })
  })

  describe('server error', () => {
    it('maps "internal server error"', () => {
      expect(getFriendlyApiError('internal server error')).toContain('Erro no servidor')
    })
    it('maps "500"', () => {
      expect(getFriendlyApiError('500')).toContain('Erro no servidor')
    })
  })

  describe('unknown errors', () => {
    it('returns raw message when no match', () => {
      expect(getFriendlyApiError('something weird')).toBe('something weird')
    })
    it('uses fallback when provided', () => {
      expect(getFriendlyApiError('xyz', 'Falha.')).toBe('Falha.')
    })
    it('accepts Error objects', () => {
      expect(getFriendlyApiError(new Error('unauthorized'))).toContain('Sessão expirada')
    })
  })
})
