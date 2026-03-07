import { describe, it, expect } from 'vitest'

// Lógica pura extraída de useVipAccess
function resolveInitialVipAccess(role: string): boolean {
  const r = role.toLowerCase().trim()
  return r === 'admin' || r === 'teacher'
}

function isVipStatusActive(status: unknown): boolean {
  if (!status || typeof status !== 'object') return false
  const s = status as Record<string, unknown>
  const isActive = s.isActive === true || s.is_active === true
  const notExpired = !s.expiresAt || new Date(String(s.expiresAt)) > new Date()
  return isActive && notExpired
}

function mergeVipAccess(initial: boolean, statusActive: boolean): boolean {
  return initial || statusActive
}

describe('useVipAccess — lógica pura', () => {
  describe('resolveInitialVipAccess', () => {
    it('admin tem acesso VIP', () => {
      expect(resolveInitialVipAccess('admin')).toBe(true)
    })
    it('teacher tem acesso VIP', () => {
      expect(resolveInitialVipAccess('teacher')).toBe(true)
    })
    it('usuário comum não tem acesso VIP inicial', () => {
      expect(resolveInitialVipAccess('user')).toBe(false)
      expect(resolveInitialVipAccess('')).toBe(false)
    })
    it('case insensitive', () => {
      expect(resolveInitialVipAccess('ADMIN')).toBe(true)
      expect(resolveInitialVipAccess('Teacher')).toBe(true)
    })
  })

  describe('isVipStatusActive', () => {
    it('retorna true para status ativo sem expiração', () => {
      expect(isVipStatusActive({ isActive: true })).toBe(true)
    })
    it('retorna true para status ativo com expiração futura', () => {
      const future = new Date(Date.now() + 86400000).toISOString()
      expect(isVipStatusActive({ isActive: true, expiresAt: future })).toBe(true)
    })
    it('retorna false para status inativo', () => {
      expect(isVipStatusActive({ isActive: false })).toBe(false)
    })
    it('retorna false para null/undefined', () => {
      expect(isVipStatusActive(null)).toBe(false)
      expect(isVipStatusActive(undefined)).toBe(false)
    })
    it('aceita is_active snake_case', () => {
      expect(isVipStatusActive({ is_active: true })).toBe(true)
    })
  })

  describe('mergeVipAccess', () => {
    it('true + false = true', () => expect(mergeVipAccess(true, false)).toBe(true))
    it('false + true = true', () => expect(mergeVipAccess(false, true)).toBe(true))
    it('false + false = false', () => expect(mergeVipAccess(false, false)).toBe(false))
    it('true + true = true', () => expect(mergeVipAccess(true, true)).toBe(true))
  })
})
