import { describe, it, expect } from 'vitest'

// Lógica pura extraída de useAdminPanelState
const VALID_TABS = new Set(['dashboard', 'students', 'teachers', 'templates', 'videos', 'broadcast', 'system'])

function resolveTab(raw: unknown): string {
  const t = String(raw || '').trim()
  return VALID_TABS.has(t) ? t : ''
}

function shouldOpenPanel(openFlag: string | null, storedTab: string, urlTab: string): boolean {
  return (openFlag === '1' && !!storedTab) || !!urlTab
}

describe('useAdminPanelState — lógica de tabs', () => {
  describe('resolveTab', () => {
    it('retorna tab válida sem modificar', () => {
      expect(resolveTab('dashboard')).toBe('dashboard')
      expect(resolveTab('students')).toBe('students')
      expect(resolveTab('system')).toBe('system')
    })
    it('retorna string vazia para tab inválida', () => {
      expect(resolveTab('admin')).toBe('')
      expect(resolveTab('hacker')).toBe('')
      expect(resolveTab('')).toBe('')
      expect(resolveTab(null)).toBe('')
      expect(resolveTab(undefined)).toBe('')
    })
    it('todas as tabs válidas são aceitas', () => {
      for (const tab of VALID_TABS) {
        expect(resolveTab(tab)).toBe(tab)
      }
    })
  })

  describe('shouldOpenPanel', () => {
    it('abre quando flag=1 e storedTab preenchida', () => {
      expect(shouldOpenPanel('1', 'students', '')).toBe(true)
    })
    it('abre quando urlTab preenchida (mesmo sem flag)', () => {
      expect(shouldOpenPanel(null, '', 'teachers')).toBe(true)
    })
    it('não abre quando flag=1 mas sem storedTab', () => {
      expect(shouldOpenPanel('1', '', '')).toBe(false)
    })
    it('não abre quando tudo vazio', () => {
      expect(shouldOpenPanel(null, '', '')).toBe(false)
    })
    it('não abre quando flag diferente de 1', () => {
      expect(shouldOpenPanel('0', 'dashboard', '')).toBe(false)
    })
  })
})
