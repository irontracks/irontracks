/**
 * useOfflineSync — pure logic tests (no React, no @/ imports)
 * Tests sync state management, feature flag checks, flush guards, and state transitions.
 */
import { describe, it, expect } from 'vitest'

// ─── Types ─────────────────────────────────────────────────────────────────
interface SyncState {
  online: boolean
  syncing: boolean
  pending: number
  failed: number
  due: number
}

// ─── Constants ─────────────────────────────────────────────────────────────
const DEFAULT_SYNC_STATE: SyncState = {
  online: true,
  syncing: false,
  pending: 0,
  failed: 0,
  due: 0,
}

// ─── Pure helpers ──────────────────────────────────────────────────────────
function isOfflineSyncV2Enabled(settings: Record<string, unknown> | null | undefined): boolean {
  if (!settings) return false
  if (settings.featuresKillSwitch === true) return false
  return settings.featureOfflineSyncV2 === true
}

function applyQueueSummary(
  prev: SyncState,
  summary: { ok?: boolean; online?: boolean; pending?: number; failed?: number; due?: number },
): SyncState {
  if (!summary?.ok) return prev
  return {
    ...prev,
    online: summary.online !== false,
    pending: Number(summary.pending || 0),
    failed: Number(summary.failed || 0),
    due: Number(summary.due || 0),
  }
}

function applyLegacyPending(prev: SyncState, online: boolean, pending: number): SyncState {
  return { ...prev, online, pending, failed: 0, due: 0 }
}

function shouldAutoFlush(opts: {
  userId: string | null | undefined
  online: boolean
  pending: number
}): boolean {
  if (!opts.userId) return false
  if (!opts.online) return false
  if (opts.pending <= 0) return false
  return true
}

function startSyncingState(prev: SyncState): SyncState {
  return { ...prev, syncing: true, online: true }
}

function finishSyncingState(prev: SyncState): SyncState {
  return { ...prev, syncing: false }
}

function setOfflineState(prev: SyncState): SyncState {
  return { ...prev, online: false }
}

function calculateFlushInterval(): number {
  return 15_000 // 15 seconds
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('DEFAULT_SYNC_STATE', () => {
  it('inicia online', () => {
    expect(DEFAULT_SYNC_STATE.online).toBe(true)
  })

  it('inicia sem itens pendentes', () => {
    expect(DEFAULT_SYNC_STATE.pending).toBe(0)
    expect(DEFAULT_SYNC_STATE.failed).toBe(0)
    expect(DEFAULT_SYNC_STATE.due).toBe(0)
  })

  it('inicia sem sincronizar', () => {
    expect(DEFAULT_SYNC_STATE.syncing).toBe(false)
  })
})

describe('isOfflineSyncV2Enabled', () => {
  it('retorna false quando settings é null', () => {
    expect(isOfflineSyncV2Enabled(null)).toBe(false)
  })

  it('retorna false quando killSwitch ativado', () => {
    expect(isOfflineSyncV2Enabled({ featuresKillSwitch: true, featureOfflineSyncV2: true })).toBe(false)
  })

  it('retorna false quando featureOfflineSyncV2 não definida', () => {
    expect(isOfflineSyncV2Enabled({ featuresKillSwitch: false })).toBe(false)
  })

  it('retorna true quando habilitada e sem killSwitch', () => {
    expect(isOfflineSyncV2Enabled({ featuresKillSwitch: false, featureOfflineSyncV2: true })).toBe(true)
  })

  it('retorna true quando killSwitch ausente', () => {
    expect(isOfflineSyncV2Enabled({ featureOfflineSyncV2: true })).toBe(true)
  })
})

describe('applyQueueSummary', () => {
  it('não altera estado quando summary.ok é false', () => {
    const prev = { ...DEFAULT_SYNC_STATE, pending: 5 }
    const result = applyQueueSummary(prev, { ok: false, pending: 100 })
    expect(result.pending).toBe(5) // não alterado
  })

  it('aplica valores do summary quando ok', () => {
    const prev = { ...DEFAULT_SYNC_STATE }
    const result = applyQueueSummary(prev, { ok: true, pending: 3, failed: 1, due: 2, online: true })
    expect(result.pending).toBe(3)
    expect(result.failed).toBe(1)
    expect(result.due).toBe(2)
  })

  it('online: false no summary é respeitado', () => {
    const prev = { ...DEFAULT_SYNC_STATE, online: true }
    const result = applyQueueSummary(prev, { ok: true, online: false })
    expect(result.online).toBe(false)
  })

  it('online undefined no summary → true (default)', () => {
    const prev = { ...DEFAULT_SYNC_STATE, online: true }
    const result = applyQueueSummary(prev, { ok: true })
    expect(result.online).toBe(true) // online !== false
  })
})

describe('applyLegacyPending', () => {
  it('aplica pending e zerifica failed/due', () => {
    const prev: SyncState = { online: true, syncing: false, pending: 0, failed: 5, due: 3 }
    const result = applyLegacyPending(prev, true, 7)
    expect(result.pending).toBe(7)
    expect(result.failed).toBe(0)
    expect(result.due).toBe(0)
  })

  it('define online corretamente', () => {
    const result = applyLegacyPending(DEFAULT_SYNC_STATE, false, 0)
    expect(result.online).toBe(false)
  })
})

describe('shouldAutoFlush', () => {
  it('retorna false sem userId', () => {
    expect(shouldAutoFlush({ userId: null, online: true, pending: 5 })).toBe(false)
  })

  it('retorna false quando offline', () => {
    expect(shouldAutoFlush({ userId: 'u1', online: false, pending: 5 })).toBe(false)
  })

  it('retorna false quando pending === 0', () => {
    expect(shouldAutoFlush({ userId: 'u1', online: true, pending: 0 })).toBe(false)
  })

  it('retorna true quando tudo ok', () => {
    expect(shouldAutoFlush({ userId: 'u1', online: true, pending: 3 })).toBe(true)
  })
})

describe('state transitions', () => {
  it('startSyncingState ativa syncing e garante online', () => {
    const prev = { ...DEFAULT_SYNC_STATE, online: false }
    const result = startSyncingState(prev)
    expect(result.syncing).toBe(true)
    expect(result.online).toBe(true)
  })

  it('finishSyncingState desativa syncing', () => {
    const prev = { ...DEFAULT_SYNC_STATE, syncing: true }
    const result = finishSyncingState(prev)
    expect(result.syncing).toBe(false)
  })

  it('setOfflineState marca como offline', () => {
    const result = setOfflineState(DEFAULT_SYNC_STATE)
    expect(result.online).toBe(false)
  })

  it('transitions não alteram outros campos', () => {
    const prev: SyncState = { online: true, syncing: false, pending: 7, failed: 2, due: 1 }
    const result = startSyncingState(prev)
    expect(result.pending).toBe(7)
    expect(result.failed).toBe(2)
    expect(result.due).toBe(1)
  })
})

describe('calculateFlushInterval', () => {
  it('retorna 15 segundos em ms', () => {
    expect(calculateFlushInterval()).toBe(15_000)
  })
})
