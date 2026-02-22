import { describe, it, expect } from 'vitest'

// Lógica pura extraída de useGuidedTour
function shouldShowTour(
  userId: string | null | undefined,
  dismissed: boolean,
  tourVersion: string,
  userSeenVersion: string | null
): boolean {
  if (!userId) return false
  if (dismissed) return false
  if (!userSeenVersion) return true
  return userSeenVersion !== tourVersion
}

function isTourEligible(userRole: string | null | undefined): boolean {
  if (!userRole) return false
  const r = userRole.toLowerCase().trim()
  return r === 'user' || r === 'student'
}

describe('useGuidedTour — lógica pura', () => {
  describe('shouldShowTour', () => {
    it('não mostra sem userId', () => {
      expect(shouldShowTour(null, false, 'v2', null)).toBe(false)
    })
    it('não mostra se já dispensado', () => {
      expect(shouldShowTour('u1', true, 'v2', null)).toBe(false)
    })
    it('mostra se nunca viu', () => {
      expect(shouldShowTour('u1', false, 'v2', null)).toBe(true)
    })
    it('não mostra se já viu a versão atual', () => {
      expect(shouldShowTour('u1', false, 'v2', 'v2')).toBe(false)
    })
    it('mostra se viu versão antiga', () => {
      expect(shouldShowTour('u1', false, 'v3', 'v2')).toBe(true)
    })
  })

  describe('isTourEligible', () => {
    it('usuário comum é elegível', () => {
      expect(isTourEligible('user')).toBe(true)
      expect(isTourEligible('student')).toBe(true)
    })
    it('admin e teacher não são elegíveis', () => {
      expect(isTourEligible('admin')).toBe(false)
      expect(isTourEligible('teacher')).toBe(false)
    })
    it('null/undefined não é elegível', () => {
      expect(isTourEligible(null)).toBe(false)
      expect(isTourEligible(undefined)).toBe(false)
    })
    it('case insensitive', () => {
      expect(isTourEligible('USER')).toBe(true)
    })
  })
})
