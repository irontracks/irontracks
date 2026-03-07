/**
 * usePresencePing — pure logic tests (no React, no @/ imports)
 * Tests session key construction, guard conditions, and ping endpoint logic.
 */
import { describe, it, expect } from 'vitest'

// ─── Pure helpers (mirrored from hook) ─────────────────────────────────────
const SESSION_KEY_PREFIX = 'irontracks.socialPresencePing.v1'

function buildPresenceSessionKey(userId: string): string {
  return `${SESSION_KEY_PREFIX}.${userId}`
}

function shouldFirePing(
  userId: string | null | undefined,
  alreadyPinged: boolean,
): boolean {
  const uid = userId ? String(userId) : ''
  if (!uid) return false
  if (alreadyPinged) return false
  return true
}

function extractUserId(userId: string | null | undefined): string {
  return userId ? String(userId) : ''
}

function getPingEndpoints(): string[] {
  return ['/api/social/presence/ping', '/api/profiles/ping']
}

function buildPingOptions(): { method: string } {
  return { method: 'POST' }
}

function hasSeenPingInSession(
  storage: Map<string, string>,
  key: string,
): boolean {
  return storage.get(key) === '1'
}

function markPingInSession(
  storage: Map<string, string>,
  key: string,
): void {
  storage.set(key, '1')
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('buildPresenceSessionKey', () => {
  it('gera chave com prefixo correto', () => {
    const key = buildPresenceSessionKey('user-abc')
    expect(key).toBe('irontracks.socialPresencePing.v1.user-abc')
  })

  it('chaves diferentes para usuários diferentes', () => {
    expect(buildPresenceSessionKey('u1')).not.toBe(buildPresenceSessionKey('u2'))
  })

  it('contém o userId na chave', () => {
    const uid = 'unique-user-id'
    expect(buildPresenceSessionKey(uid)).toContain(uid)
  })
})

describe('shouldFirePing', () => {
  it('retorna false para userId null', () => {
    expect(shouldFirePing(null, false)).toBe(false)
  })

  it('retorna false para userId vazio', () => {
    expect(shouldFirePing('', false)).toBe(false)
  })

  it('retorna false se já pingado (alreadyPinged)', () => {
    expect(shouldFirePing('user-1', true)).toBe(false)
  })

  it('retorna true quando userId válido e não pingado', () => {
    expect(shouldFirePing('user-1', false)).toBe(true)
  })
})

describe('extractUserId', () => {
  it('retorna string para userId válido', () => {
    expect(extractUserId('user-123')).toBe('user-123')
  })

  it('retorna string vazia para null', () => {
    expect(extractUserId(null)).toBe('')
  })

  it('retorna string vazia para undefined', () => {
    expect(extractUserId(undefined)).toBe('')
  })

  it('converte número para string', () => {
    expect(extractUserId(42 as unknown as string)).toBe('42')
  })
})

describe('getPingEndpoints', () => {
  it('retorna dois endpoints', () => {
    expect(getPingEndpoints()).toHaveLength(2)
  })

  it('inclui endpoint de presence', () => {
    expect(getPingEndpoints()).toContain('/api/social/presence/ping')
  })

  it('inclui endpoint de profiles', () => {
    expect(getPingEndpoints()).toContain('/api/profiles/ping')
  })
})

describe('buildPingOptions', () => {
  it('usa método POST', () => {
    expect(buildPingOptions().method).toBe('POST')
  })
})

describe('session storage guard', () => {
  it('hasSeenPingInSession retorna false para chave ausente', () => {
    const storage = new Map<string, string>()
    expect(hasSeenPingInSession(storage, 'some-key')).toBe(false)
  })

  it('hasSeenPingInSession retorna true após markPingInSession', () => {
    const storage = new Map<string, string>()
    const key = buildPresenceSessionKey('test-user')
    markPingInSession(storage, key)
    expect(hasSeenPingInSession(storage, key)).toBe(true)
  })

  it('marking um usuário não afeta outro', () => {
    const storage = new Map<string, string>()
    const key1 = buildPresenceSessionKey('user-1')
    const key2 = buildPresenceSessionKey('user-2')
    markPingInSession(storage, key1)
    expect(hasSeenPingInSession(storage, key2)).toBe(false)
  })

  it('mark é idempotente (múltiplos marks = 1 ping)', () => {
    const storage = new Map<string, string>()
    const key = buildPresenceSessionKey('user-x')
    markPingInSession(storage, key)
    markPingInSession(storage, key)
    markPingInSession(storage, key)
    // Ainda é '1' (idempotente)
    expect(storage.get(key)).toBe('1')
  })
})

describe('ping flow integration', () => {
  it('fluxo completo: verificar → marcar → não repete', () => {
    const storage = new Map<string, string>()
    const userId = 'user-flow'
    const key = buildPresenceSessionKey(userId)

    // Primeiro: não pingado ainda
    const alreadyPinged = hasSeenPingInSession(storage, key)
    expect(shouldFirePing(userId, alreadyPinged)).toBe(true)

    // Marca como pingado
    markPingInSession(storage, key)

    // Segundo: já pingado
    const alreadyPinged2 = hasSeenPingInSession(storage, key)
    expect(shouldFirePing(userId, alreadyPinged2)).toBe(false)
  })
})
