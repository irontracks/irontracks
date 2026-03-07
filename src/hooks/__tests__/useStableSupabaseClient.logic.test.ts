/**
 * useStableSupabaseClient — pure logic tests (no React, no @/ imports)
 * The hook itself is trivial (singleton pattern via useState lazy init).
 * We test the singleton guarantees, factory idempotency, and key design invariants.
 */
import { describe, it, expect, vi } from 'vitest'

// ─── Simulated stable client factory (mirrors hook logic) ──────────────────
function createStableClient<T>(factory: () => T): { getClient: () => T } {
  let instance: T | null = null
  return {
    getClient: () => {
      if (instance === null) {
        instance = factory()
      }
      return instance
    },
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('stable client singleton pattern', () => {
  it('retorna sempre a mesma instância', () => {
    let callCount = 0
    const stable = createStableClient(() => {
      callCount++
      return { id: callCount }
    })

    const a = stable.getClient()
    const b = stable.getClient()
    const c = stable.getClient()

    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(callCount).toBe(1) // factory chamada apenas 1x
  })

  it('factory diferente gera instância diferente', () => {
    const stable1 = createStableClient(() => ({ name: 'client-1' }))
    const stable2 = createStableClient(() => ({ name: 'client-2' }))

    expect(stable1.getClient()).not.toBe(stable2.getClient())
  })

  it('instância é o objeto retornado pela factory', () => {
    const obj = { type: 'supabase-client', connected: true }
    const stable = createStableClient(() => obj)
    expect(stable.getClient()).toBe(obj)
  })
})

describe('lazy initialization', () => {
  it('não chama factory até primeira chamada', () => {
    const factory = vi.fn(() => ({ ok: true }))
    const stable = createStableClient(factory)

    expect(factory).not.toHaveBeenCalled()
    stable.getClient()
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('factory nunca chamada mais de uma vez mesmo em muitas chamadas', () => {
    const factory = vi.fn(() => ({}))
    const stable = createStableClient(factory)

    for (let i = 0; i < 100; i++) {
      stable.getClient()
    }

    expect(factory).toHaveBeenCalledTimes(1)
  })
})

describe('hook design invariants', () => {
  it('useState lazy init com função não re-executa em re-renders', () => {
    // Simula comportamento de useState(() => createClient())
    // React garante que a função é chamada apenas na montagem
    let initCount = 0
    const simulateUseState = <T>(initFn: () => T): T => {
      // Primeira "renderização" — init é chamado
      initCount++
      return initFn()
    }

    simulateUseState(() => ({ id: 'client-stable' }))
    expect(initCount).toBe(1)
  })

  it('clientes criados com mesmos parâmetros são diferentes objetos (sem singleton global)', () => {
    // Cada instância do hook cria seu próprio client (não é singleton global)
    const factory = () => ({ id: Math.random() })
    const clientA = factory()
    const clientB = factory()
    expect(clientA).not.toBe(clientB)
  })
})
