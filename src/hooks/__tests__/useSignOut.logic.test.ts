import { describe, it, expect } from 'vitest'

// Lógica pura extraída de useSignOut
function filterSupabaseCookieNames(cookieHeader: string): string[] {
  return cookieHeader
    .split(';')
    .map((p) => p.trim())
    .map((p) => p.split('=')[0])
    .filter(Boolean)
    .filter((n) => n.startsWith('sb-') || n.includes('supabase'))
}

function filterSupabaseLocalStorageKeys(keys: string[]): string[] {
  return keys.filter(
    (k) => k.startsWith('sb-') || k.includes('supabase') || k.includes('irontracks')
  )
}

describe('useSignOut — lógica pura', () => {
  describe('filterSupabaseCookieNames', () => {
    it('filtra cookies do Supabase (sb-)', () => {
      const cookies = 'sb-auth-token=abc; other=xyz; sb-refresh-token=def'
      const result = filterSupabaseCookieNames(cookies)
      expect(result).toContain('sb-auth-token')
      expect(result).toContain('sb-refresh-token')
      expect(result).not.toContain('other')
    })
    it('filtra cookies com "supabase" no nome', () => {
      const cookies = 'supabase-session=token; regular=value'
      const result = filterSupabaseCookieNames(cookies)
      expect(result).toContain('supabase-session')
      expect(result).not.toContain('regular')
    })
    it('retorna lista vazia se sem cookies Supabase', () => {
      const result = filterSupabaseCookieNames('session=abc; user=xyz')
      expect(result).toHaveLength(0)
    })
    it('retorna lista vazia para string vazia', () => {
      expect(filterSupabaseCookieNames('')).toHaveLength(0)
    })
  })

  describe('filterSupabaseLocalStorageKeys', () => {
    it('filtra chaves sb-', () => {
      const keys = ['sb-auth-token', 'app-data', 'irontracks.session']
      const result = filterSupabaseLocalStorageKeys(keys)
      expect(result).toContain('sb-auth-token')
      expect(result).toContain('irontracks.session')
      expect(result).not.toContain('app-data')
    })
    it('filtra chaves irontracks.*', () => {
      const keys = ['irontracks.activeSession.v2.userId', 'other-key']
      const result = filterSupabaseLocalStorageKeys(keys)
      expect(result).toContain('irontracks.activeSession.v2.userId')
      expect(result).not.toContain('other-key')
    })
    it('retorna vazio se nenhuma chave relevante', () => {
      const result = filterSupabaseLocalStorageKeys(['app-state', 'ui-theme', 'language'])
      expect(result).toHaveLength(0)
    })
  })
})
