/**
 * useUserSettings — pure logic tests (no React, no @/ imports)
 * Tests for settings merge, cache key construction, error classification, and save payload.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { parseJsonWithSchema } from '@/utils/zod'

// ─── Constants (mirrored from hook) ────────────────────────────────────────
const STORAGE_KEY = 'irontracks.userSettings.v1'
const TABLE_MISSING_KEY = 'irontracks.userSettings.user_settings_table_missing.v1'

// ─── Pure helpers (inline — no @/ imports) ─────────────────────────────────
function buildStorageKey(userId: string): string {
  const safeId = userId ? String(userId) : ''
  return `${STORAGE_KEY}.${safeId}`
}

function safeJsonParse(raw: string): unknown {
  const parsed = parseJsonWithSchema(raw, z.unknown())
  return parsed ?? null
}

function mergeSettings<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  return { ...base, ...patch }
}

function classifySupabaseError(error: { status?: unknown; code?: unknown; message?: unknown }): {
  isMissing: boolean
  isAuthError: boolean
} {
  const status = Number(error?.status)
  const code = error?.code ? String(error.code) : ''
  const msg = error?.message ? String(error.message) : ''
  const isMissing =
    status === 404 ||
    code === '42P01' ||
    /does not exist/i.test(msg) ||
    /not found/i.test(msg)
  const isAuthError = status === 401 || status === 403 || code === 'PGRST301'
  return { isMissing, isAuthError }
}

function buildSavePayload(
  userId: string,
  settings: Record<string, unknown>,
): { user_id: string; preferences: Record<string, unknown>; updated_at: string } {
  return {
    user_id: userId,
    preferences: settings,
    updated_at: new Date().toISOString(),
  }
}

function validateSaveGuards(opts: {
  userId: string
  saving: boolean
  hasSupabase: boolean
}): { ok: boolean; error?: string } {
  if (!opts.userId) return { ok: false, error: 'missing_user' }
  if (opts.saving) return { ok: false, error: 'saving' }
  if (!opts.hasSupabase) return { ok: false, error: 'missing_supabase' }
  return { ok: true }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('buildStorageKey', () => {
  it('gera chave com userId', () => {
    expect(buildStorageKey('user-123')).toBe(`${STORAGE_KEY}.user-123`)
  })

  it('userId vazio gera chave com sufixo vazio', () => {
    expect(buildStorageKey('')).toBe(`${STORAGE_KEY}.`)
  })

  it('TABLE_MISSING_KEY tem valor esperado', () => {
    expect(TABLE_MISSING_KEY).toBe('irontracks.userSettings.user_settings_table_missing.v1')
  })
})

describe('safeJsonParse', () => {
  it('parseia JSON válido', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 })
  })

  it('retorna null para JSON inválido', () => {
    expect(safeJsonParse('invalid json {')).toBeNull()
  })

  it('retorna null para string vazia', () => {
    expect(safeJsonParse('')).toBeNull()
  })

  it('parseia array JSON', () => {
    expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3])
  })
})

describe('mergeSettings', () => {
  it('sobrescreve campo existente', () => {
    const base = { theme: 'light', lang: 'pt' }
    const result = mergeSettings(base, { theme: 'dark' })
    expect(result.theme).toBe('dark')
    expect(result.lang).toBe('pt')
  })

  it('adiciona campo novo sem perder existentes', () => {
    const base = { a: 1 } as Record<string, unknown>
    const result = mergeSettings(base, { b: 2 })
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('patch vazio não altera base', () => {
    const base = { x: 10 } as Record<string, unknown>
    const result = mergeSettings(base, {})
    expect(result).toEqual(base)
  })
})

describe('classifySupabaseError', () => {
  it('detecta tabela inexistente por código 42P01', () => {
    const { isMissing } = classifySupabaseError({ code: '42P01' })
    expect(isMissing).toBe(true)
  })

  it('detecta tabela inexistente por status 404', () => {
    const { isMissing } = classifySupabaseError({ status: 404 })
    expect(isMissing).toBe(true)
  })

  it('detecta tabela inexistente por mensagem', () => {
    const { isMissing } = classifySupabaseError({ message: 'relation does not exist' })
    expect(isMissing).toBe(true)
  })

  it('detecta not found na mensagem', () => {
    const { isMissing } = classifySupabaseError({ message: 'Table not found' })
    expect(isMissing).toBe(true)
  })

  it('detecta erro de auth por status 401', () => {
    const { isAuthError } = classifySupabaseError({ status: 401 })
    expect(isAuthError).toBe(true)
  })

  it('erro genérico não é missing nem auth', () => {
    const result = classifySupabaseError({ status: 500, message: 'Internal Server Error' })
    expect(result.isMissing).toBe(false)
    expect(result.isAuthError).toBe(false)
  })
})

describe('buildSavePayload', () => {
  it('inclui user_id, preferences e updated_at', () => {
    const payload = buildSavePayload('user-abc', { theme: 'dark' })
    expect(payload.user_id).toBe('user-abc')
    expect(payload.preferences).toEqual({ theme: 'dark' })
    expect(typeof payload.updated_at).toBe('string')
  })

  it('updated_at é ISO 8601 válido', () => {
    const payload = buildSavePayload('u', {})
    const d = new Date(payload.updated_at)
    expect(isNaN(d.getTime())).toBe(false)
  })
})

describe('validateSaveGuards', () => {
  it('erro missing_user quando userId vazio', () => {
    const r = validateSaveGuards({ userId: '', saving: false, hasSupabase: true })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('missing_user')
  })

  it('erro saving quando já salvando', () => {
    const r = validateSaveGuards({ userId: 'u1', saving: true, hasSupabase: true })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('saving')
  })

  it('erro missing_supabase quando sem client', () => {
    const r = validateSaveGuards({ userId: 'u1', saving: false, hasSupabase: false })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('missing_supabase')
  })

  it('ok true quando tudo válido', () => {
    const r = validateSaveGuards({ userId: 'u1', saving: false, hasSupabase: true })
    expect(r.ok).toBe(true)
    expect(r.error).toBeUndefined()
  })
})
