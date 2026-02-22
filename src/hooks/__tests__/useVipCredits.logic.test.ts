/**
 * useVipCredits — pure logic tests (no React, no @/ imports)
 * Tests credit parsing, usage calculation, limit enforcement, and plan detection.
 */
import { describe, it, expect } from 'vitest'

// ─── Types (mirrored from hook) ────────────────────────────────────────────
interface CreditSlot {
  used: number
  limit: number
}

interface VipCredits {
  chat?: CreditSlot
  wizard?: CreditSlot
  insights?: CreditSlot
  plan?: string
  [key: string]: unknown
}

// ─── Pure helpers ──────────────────────────────────────────────────────────
function parseCreditsResponse(data: unknown): VipCredits | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (!d.ok) return null
  const credits = d.credits
  if (!credits || typeof credits !== 'object') return null
  return credits as VipCredits
}

function getRemainingCredits(slot: CreditSlot | undefined): number {
  if (!slot) return 0
  const remaining = slot.limit - slot.used
  return remaining < 0 ? 0 : remaining
}

function isSlotExhausted(slot: CreditSlot | undefined): boolean {
  if (!slot) return true
  return slot.used >= slot.limit
}

function getUsagePercent(slot: CreditSlot | undefined): number {
  if (!slot || slot.limit <= 0) return 100
  return Math.min(100, Math.round((slot.used / slot.limit) * 100))
}

function isPlanPro(plan: string | undefined): boolean {
  if (!plan) return false
  return ['pro', 'premium', 'enterprise', 'vip'].includes(plan.toLowerCase())
}

function formatCreditDisplay(slot: CreditSlot | undefined): string {
  if (!slot) return '0/0'
  return `${slot.used}/${slot.limit}`
}

function hasCriticalCreditsLeft(slot: CreditSlot | undefined, threshold = 0.1): boolean {
  if (!slot || slot.limit <= 0) return false
  const remaining = slot.limit - slot.used
  return remaining > 0 && remaining / slot.limit <= threshold
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('parseCreditsResponse', () => {
  it('retorna null para resposta não-ok', () => {
    expect(parseCreditsResponse({ ok: false, credits: {} })).toBeNull()
  })

  it('retorna null para dados nulos', () => {
    expect(parseCreditsResponse(null)).toBeNull()
  })

  it('retorna credits quando ok: true', () => {
    const result = parseCreditsResponse({
      ok: true,
      credits: { chat: { used: 5, limit: 10 }, plan: 'pro' },
    })
    expect(result?.chat?.used).toBe(5)
    expect(result?.plan).toBe('pro')
  })

  it('retorna null quando credits ausente', () => {
    expect(parseCreditsResponse({ ok: true })).toBeNull()
  })
})

describe('getRemainingCredits', () => {
  it('calcula créditos restantes', () => {
    expect(getRemainingCredits({ used: 3, limit: 10 })).toBe(7)
  })

  it('retorna 0 para slot undefined', () => {
    expect(getRemainingCredits(undefined)).toBe(0)
  })

  it('nunca retorna negativo (já excedido)', () => {
    expect(getRemainingCredits({ used: 15, limit: 10 })).toBe(0)
  })

  it('retorna 0 quando exatamente esgotado', () => {
    expect(getRemainingCredits({ used: 10, limit: 10 })).toBe(0)
  })
})

describe('isSlotExhausted', () => {
  it('slot undefined é considerado esgotado', () => {
    expect(isSlotExhausted(undefined)).toBe(true)
  })

  it('used === limit é esgotado', () => {
    expect(isSlotExhausted({ used: 10, limit: 10 })).toBe(true)
  })

  it('used > limit é esgotado', () => {
    expect(isSlotExhausted({ used: 11, limit: 10 })).toBe(true)
  })

  it('used < limit não é esgotado', () => {
    expect(isSlotExhausted({ used: 9, limit: 10 })).toBe(false)
  })
})

describe('getUsagePercent', () => {
  it('calcula percentual correto', () => {
    expect(getUsagePercent({ used: 5, limit: 10 })).toBe(50)
  })

  it('retorna 100 para limit zero', () => {
    expect(getUsagePercent({ used: 0, limit: 0 })).toBe(100)
  })

  it('nunca ultrapassa 100', () => {
    expect(getUsagePercent({ used: 15, limit: 10 })).toBe(100)
  })

  it('retorna 0 quando used é 0', () => {
    expect(getUsagePercent({ used: 0, limit: 10 })).toBe(0)
  })
})

describe('isPlanPro', () => {
  it('detecta plano pro', () => {
    expect(isPlanPro('pro')).toBe(true)
  })

  it('detecta plano premium', () => {
    expect(isPlanPro('premium')).toBe(true)
  })

  it('detecta plano vip', () => {
    expect(isPlanPro('vip')).toBe(true)
  })

  it('plan undefined retorna false', () => {
    expect(isPlanPro(undefined)).toBe(false)
  })

  it('plano free retorna false', () => {
    expect(isPlanPro('free')).toBe(false)
  })

  it('case insensitive', () => {
    expect(isPlanPro('PRO')).toBe(true)
  })
})

describe('formatCreditDisplay', () => {
  it('formata como "used/limit"', () => {
    expect(formatCreditDisplay({ used: 3, limit: 10 })).toBe('3/10')
  })

  it('slot undefined retorna "0/0"', () => {
    expect(formatCreditDisplay(undefined)).toBe('0/0')
  })
})

describe('hasCriticalCreditsLeft', () => {
  it('detecta créditos críticos (10% padrão)', () => {
    // 1 de 10 = 10% → exatamente no threshold
    expect(hasCriticalCreditsLeft({ used: 9, limit: 10 })).toBe(true)
  })

  it('zero remaining não é crítico (é esgotado)', () => {
    expect(hasCriticalCreditsLeft({ used: 10, limit: 10 })).toBe(false)
  })

  it('50% não é crítico', () => {
    expect(hasCriticalCreditsLeft({ used: 5, limit: 10 })).toBe(false)
  })

  it('threshold customizado de 20%', () => {
    // 2 de 10 = 20% → dentro do threshold 20%
    expect(hasCriticalCreditsLeft({ used: 8, limit: 10 }, 0.2)).toBe(true)
  })
})
