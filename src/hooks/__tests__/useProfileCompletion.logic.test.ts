import { describe, it, expect } from 'vitest'

// Lógica pura extraída de useProfileCompletion
function isProfileIncomplete(
  displayName: string | null | undefined,
  profileData: Record<string, unknown> | null
): boolean {
  if (!displayName || String(displayName).trim() === '') return true
  const name = profileData?.name ?? profileData?.display_name ?? profileData?.displayName
  if (!name || String(name).trim() === '') return true
  return false
}

function buildProfileDraftName(
  displayName: string | null | undefined,
  profileData: Record<string, unknown> | null
): string {
  const fromProfile = String(profileData?.name ?? profileData?.display_name ?? profileData?.displayName ?? '').trim()
  if (fromProfile) return fromProfile
  return String(displayName ?? '').trim()
}

describe('useProfileCompletion — lógica pura', () => {
  describe('isProfileIncomplete', () => {
    it('incompleto quando displayName nulo', () => {
      expect(isProfileIncomplete(null, { name: 'João' })).toBe(true)
    })
    it('incompleto quando displayName vazio', () => {
      expect(isProfileIncomplete('', { name: 'João' })).toBe(true)
    })
    it('incompleto quando profile sem name', () => {
      expect(isProfileIncomplete('João', {})).toBe(true)
    })
    it('completo quando tem displayName e name no profile', () => {
      expect(isProfileIncomplete('João', { name: 'João Silva' })).toBe(false)
    })
    it('incompleto quando profile é null', () => {
      expect(isProfileIncomplete('João', null)).toBe(true)
    })
    it('aceita display_name snake_case', () => {
      expect(isProfileIncomplete('João', { display_name: 'João S.' })).toBe(false)
    })
  })

  describe('buildProfileDraftName', () => {
    it('usa name do profile quando disponível', () => {
      expect(buildProfileDraftName('User', { name: 'João Silva' })).toBe('João Silva')
    })
    it('usa displayName como fallback', () => {
      expect(buildProfileDraftName('João', null)).toBe('João')
    })
    it('prefere display_name do profile', () => {
      expect(buildProfileDraftName('User', { display_name: 'Maria' })).toBe('Maria')
    })
    it('retorna string vazia quando tudo nulo', () => {
      expect(buildProfileDraftName(null, null)).toBe('')
    })
    it('trim em espaços extras', () => {
      expect(buildProfileDraftName('  João  ', null)).toBe('João')
    })
  })
})
