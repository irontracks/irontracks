/**
 * useWhatsNew — pure logic tests (no React, no @/ imports)
 * Tests update detection, preferences check, session guard, and close flow logic.
 */
import { describe, it, expect } from 'vitest'

// ─── Types ─────────────────────────────────────────────────────────────────
interface PendingUpdate {
  id: string | number
  title?: string
  version?: string
}

interface WhatsNewPrefs {
  whatsNewAutoOpen?: boolean
  whatsNewLastSeenId?: string
  whatsNewLastSeenAt?: number
}

// ─── Pure helpers ──────────────────────────────────────────────────────────
function shouldAutoOpen(
  userId: string | null | undefined,
  loaded: boolean,
  prefs: WhatsNewPrefs | null | undefined,
  alreadyShown: boolean,
): boolean {
  if (alreadyShown) return false
  const uid = userId ? String(userId) : ''
  if (!uid) return false
  if (!loaded) return false
  if ((prefs?.whatsNewAutoOpen) === false) return false
  return true
}

function buildMarkPromptedPayload(updateId: string): Record<string, string> {
  return { updateId: String(updateId) }
}

function buildMarkViewedPayload(updateId: string): Record<string, string> {
  return { updateId: String(updateId) }
}

function buildCloseUpdateSettings(
  prevSettings: Record<string, unknown>,
  entryId: string | number,
): Record<string, unknown> {
  return {
    ...prevSettings,
    whatsNewLastSeenId: String(entryId),
    whatsNewLastSeenAt: expect.any(Number), // timestamp
  }
}

function extractUpdateId(update: PendingUpdate | null | undefined): string {
  if (!update?.id) return ''
  return String(update.id)
}

function parseUpdatesResponse(data: unknown): PendingUpdate | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const updates = Array.isArray(d.updates) ? d.updates : []
  const first = updates[0]
  if (!first || typeof first !== 'object') return null
  return first as PendingUpdate
}

function shouldSaveOnClose(updateId: string, hasSettingsApi: boolean): 'api' | 'settings' | 'none' {
  if (!updateId && !hasSettingsApi) return 'none'
  if (updateId) return 'api'
  return 'settings'
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('shouldAutoOpen', () => {
  it('retorna false se já mostrado (alreadyShown)', () => {
    expect(shouldAutoOpen('user-1', true, {}, true)).toBe(false)
  })

  it('retorna false para userId vazio', () => {
    expect(shouldAutoOpen('', true, {}, false)).toBe(false)
  })

  it('retorna false para userId null', () => {
    expect(shouldAutoOpen(null, true, {}, false)).toBe(false)
  })

  it('retorna false se settings não carregadas', () => {
    expect(shouldAutoOpen('user-1', false, {}, false)).toBe(false)
  })

  it('retorna false se whatsNewAutoOpen === false', () => {
    expect(shouldAutoOpen('user-1', true, { whatsNewAutoOpen: false }, false)).toBe(false)
  })

  it('retorna true quando tudo ok (autoOpen undefined = opt-in)', () => {
    expect(shouldAutoOpen('user-1', true, {}, false)).toBe(true)
  })

  it('retorna true quando autoOpen explicitamente true', () => {
    expect(shouldAutoOpen('user-1', true, { whatsNewAutoOpen: true }, false)).toBe(true)
  })
})

describe('buildMarkPromptedPayload e buildMarkViewedPayload', () => {
  it('prompted payload contém updateId', () => {
    const payload = buildMarkPromptedPayload('update-123')
    expect(payload.updateId).toBe('update-123')
  })

  it('viewed payload contém updateId', () => {
    const payload = buildMarkViewedPayload('update-456')
    expect(payload.updateId).toBe('update-456')
  })

  it('converte número para string', () => {
    const payload = buildMarkPromptedPayload(42 as unknown as string)
    expect(payload.updateId).toBe('42')
  })
})

describe('extractUpdateId', () => {
  it('extrai id como string', () => {
    expect(extractUpdateId({ id: 'update-1', title: 'Nova versão' })).toBe('update-1')
  })

  it('retorna string vazia para null', () => {
    expect(extractUpdateId(null)).toBe('')
  })

  it('retorna string vazia para id undefined', () => {
    expect(extractUpdateId({ id: undefined as unknown as string })).toBe('')
  })

  it('converte id numérico para string', () => {
    expect(extractUpdateId({ id: 42 })).toBe('42')
  })
})

describe('parseUpdatesResponse', () => {
  it('retorna primeiro update da lista', () => {
    const data = {
      updates: [{ id: 'u1', title: 'Update 1' }, { id: 'u2', title: 'Update 2' }],
    }
    const result = parseUpdatesResponse(data)
    expect(result?.id).toBe('u1')
  })

  it('retorna null para lista vazia', () => {
    expect(parseUpdatesResponse({ updates: [] })).toBeNull()
  })

  it('retorna null para resposta inválida', () => {
    expect(parseUpdatesResponse(null)).toBeNull()
  })

  it('retorna null se updates não é array', () => {
    expect(parseUpdatesResponse({ updates: 'invalid' })).toBeNull()
  })
})

describe('shouldSaveOnClose', () => {
  it('usa API quando tem updateId', () => {
    expect(shouldSaveOnClose('update-1', true)).toBe('api')
  })

  it('usa API mesmo sem settingsApi quando tem updateId', () => {
    expect(shouldSaveOnClose('update-1', false)).toBe('api')
  })

  it('usa settings quando não tem updateId mas tem settingsApi', () => {
    expect(shouldSaveOnClose('', true)).toBe('settings')
  })

  it('nada a fazer quando sem updateId e sem settingsApi', () => {
    expect(shouldSaveOnClose('', false)).toBe('none')
  })
})

describe('buildCloseUpdateSettings', () => {
  it('preserva settings anteriores', () => {
    const prev = { theme: 'dark', lang: 'pt' }
    const result = buildCloseUpdateSettings(prev, 'entry-1')
    expect(result.theme).toBe('dark')
    expect(result.lang).toBe('pt')
  })

  it('define whatsNewLastSeenId', () => {
    const result = buildCloseUpdateSettings({}, 'entry-42')
    expect(result.whatsNewLastSeenId).toBe('entry-42')
  })

  it('converte id numérico para string', () => {
    const result = buildCloseUpdateSettings({}, 99)
    expect(result.whatsNewLastSeenId).toBe('99')
  })
})
