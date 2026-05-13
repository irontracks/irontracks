import { describe, it, expect } from 'vitest'
import { sanitizeNextParam } from '../safeRedirect'

const FALLBACK = '/dashboard'

describe('sanitizeNextParam', () => {
  describe('valores válidos', () => {
    it('aceita path simples', () => {
      expect(sanitizeNextParam('/dashboard')).toBe('/dashboard')
      expect(sanitizeNextParam('/profile')).toBe('/profile')
    })

    it('aceita path com query string', () => {
      expect(sanitizeNextParam('/dashboard?tab=settings')).toBe('/dashboard?tab=settings')
      expect(sanitizeNextParam('/r/code?key=value&other=1')).toBe('/r/code?key=value&other=1')
    })

    it('aceita slugs pt-BR encoded (%C3%A7 etc)', () => {
      // Caracteres não-ASCII literais caem no fallback; consumers devem encodar
      // antes de passar pelo helper (que é a forma correta de URL).
      expect(sanitizeNextParam('/a%C3%A7%C3%BAcar')).toBe('/a%C3%A7%C3%BAcar')
    })

    it('aceita path com chars URL-safe', () => {
      expect(sanitizeNextParam('/foo-bar_baz.json')).toBe('/foo-bar_baz.json')
      expect(sanitizeNextParam('/path%20encoded')).toBe('/path%20encoded')
    })
  })

  describe('rejeita open-redirect', () => {
    it('rejeita protocol-relative URL', () => {
      expect(sanitizeNextParam('//evil.com')).toBe(FALLBACK)
      expect(sanitizeNextParam('//attacker.example')).toBe(FALLBACK)
    })

    it('rejeita backslash-prefixed (Windows-style bypass)', () => {
      expect(sanitizeNextParam('/\\evil.com')).toBe(FALLBACK)
    })

    it('rejeita scheme via colon', () => {
      expect(sanitizeNextParam('javascript:alert(1)')).toBe(FALLBACK)
      expect(sanitizeNextParam('/data:text/html,xss')).toBe(FALLBACK)
      expect(sanitizeNextParam('http://evil')).toBe(FALLBACK)
    })

    it('rejeita string que não começa com /', () => {
      expect(sanitizeNextParam('evil.com')).toBe(FALLBACK)
      expect(sanitizeNextParam('relative/path')).toBe(FALLBACK)
    })
  })

  describe('rejeita XSS via atributo HTML (Finding #2)', () => {
    // Payloads que ANTES do fix de allowlist passavam pelo sanitizer e
    // quebravam o atributo `href="..."` no template do /auth/callback.

    it('rejeita aspas-duplas (quebra do atributo href)', () => {
      expect(sanitizeNextParam('/"><img src=x onerror=fetch(0)>')).toBe(FALLBACK)
      expect(sanitizeNextParam('/path"onclick=alert(1)')).toBe(FALLBACK)
    })

    it('rejeita aspas-simples', () => {
      expect(sanitizeNextParam("/path'onclick=alert(1)")).toBe(FALLBACK)
    })

    it('rejeita < e > (injeção de tag)', () => {
      expect(sanitizeNextParam('/<script>alert(1)</script>')).toBe(FALLBACK)
      expect(sanitizeNextParam('/path<svg onload=alert(1)>')).toBe(FALLBACK)
    })

    it('rejeita espaço cru e backtick', () => {
      expect(sanitizeNextParam('/path with space')).toBe(FALLBACK)
      expect(sanitizeNextParam('/path`onclick=`')).toBe(FALLBACK)
    })

    it('rejeita newline / tab / null byte', () => {
      expect(sanitizeNextParam('/path\nattr=val')).toBe(FALLBACK)
      expect(sanitizeNextParam('/path\tattr')).toBe(FALLBACK)
      expect(sanitizeNextParam('/path\0null')).toBe(FALLBACK)
    })
  })

  describe('edge cases', () => {
    it('rejeita não-strings', () => {
      expect(sanitizeNextParam(null)).toBe(FALLBACK)
      expect(sanitizeNextParam(undefined)).toBe(FALLBACK)
      expect(sanitizeNextParam(123)).toBe(FALLBACK)
      expect(sanitizeNextParam({})).toBe(FALLBACK)
    })

    it('rejeita string vazia', () => {
      expect(sanitizeNextParam('')).toBe(FALLBACK)
    })

    it('rejeita strings excessivamente longas (>512 chars)', () => {
      const huge = '/' + 'a'.repeat(600)
      expect(sanitizeNextParam(huge)).toBe(FALLBACK)
    })

    it('usa fallback custom quando passado', () => {
      expect(sanitizeNextParam(null, '/login')).toBe('/login')
      expect(sanitizeNextParam('javascript:', '/home')).toBe('/home')
    })
  })
})
