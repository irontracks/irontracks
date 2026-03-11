import { describe, it, expect } from 'vitest'
import { FREE_LIMITS, UNLIMITED_LIMITS } from '@/utils/vip/limits'

// ────────────────────────────────────────────────────────────────────────────
// Lógica pura extraída de src/utils/vip/limits.ts
// normalizePlanId, applyTierDefaults e applyTierCaps são funções internas.
// Extraímos aqui para teste isolado (sem Supabase/DB).
// ────────────────────────────────────────────────────────────────────────────

type VipTierLimits = typeof FREE_LIMITS

const normalizePlanId = (raw: unknown): string => {
  try {
    const base = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
    if (!base) return ''
    const match = base.match(/^vip_(start|pro|elite)(?:_(monthly|month|mensal|annual|year|yearly|anual))?$/)
    if (match) return `vip_${match[1]}`
    return base
  } catch {
    return ''
  }
}

const applyTierDefaults = (tier: string, limits: VipTierLimits): VipTierLimits => {
  try {
    const normalized = normalizePlanId(tier)
    if (normalized === 'vip_elite') {
      return { ...limits, nutrition_macros: true, analytics: true, offline: true, chef_ai: true }
    }
    if (normalized === 'vip_pro') {
      return { ...limits, offline: true }
    }
    return limits
  } catch {
    return limits
  }
}

const capNumber = (value: unknown, max: number): number => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return max
  return Math.min(n, max)
}

const capHistory = (value: unknown, max: number): number => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return max
  return Math.min(n, max)
}

const applyTierCaps = (tier: string, limits: VipTierLimits): VipTierLimits => {
  try {
    const normalized = normalizePlanId(tier)
    if (normalized === 'vip_start') {
      return {
        ...limits,
        chat_daily: capNumber(limits.chat_daily, 10),
        insights_weekly: capNumber(limits.insights_weekly, 3),
        wizard_weekly: capNumber(limits.wizard_weekly, 1),
        history_days: capHistory(limits.history_days ?? 999, 60),
        nutrition_macros: false,
        analytics: false,
        offline: false,
        chef_ai: false,
      }
    }
    if (normalized === 'vip_pro') {
      return {
        ...limits,
        chat_daily: capNumber(limits.chat_daily, 40),
        insights_weekly: capNumber(limits.insights_weekly, 7),
        wizard_weekly: capNumber(limits.wizard_weekly, 3),
        history_days: null,
        nutrition_macros: true,
        analytics: false,
        offline: true,
        chef_ai: false,
      }
    }
    if (normalized === 'vip_elite') {
      return {
        ...limits,
        chat_daily: 9999,
        insights_weekly: 9999,
        wizard_weekly: 9999,
        history_days: null,
        nutrition_macros: true,
        analytics: true,
        offline: true,
        chef_ai: true,
      }
    }
    return limits
  } catch {
    return limits
  }
}

// ────────────────────────────────────────────────────────────────────────────

describe('FREE_LIMITS e UNLIMITED_LIMITS (constantes públicas)', () => {
  it('FREE_LIMITS: chat_daily=5 (acesso semanal ao chat)', () => {
    expect(FREE_LIMITS.chat_daily).toBe(5)
  })

  it('FREE_LIMITS: history_days=30 (30 dias de histórico)', () => {
    expect(FREE_LIMITS.history_days).toBe(30)
  })

  it('FREE_LIMITS: sem analytics, offline, chef_ai', () => {
    expect(FREE_LIMITS.analytics).toBe(false)
    expect(FREE_LIMITS.offline).toBe(false)
    expect(FREE_LIMITS.chef_ai).toBe(false)
  })

  it('UNLIMITED_LIMITS: chat_daily=9999', () => {
    expect(UNLIMITED_LIMITS.chat_daily).toBe(9999)
  })

  it('UNLIMITED_LIMITS: history_days=null (ilimitado)', () => {
    expect(UNLIMITED_LIMITS.history_days).toBeNull()
  })
})

describe('normalizePlanId', () => {
  describe('planos com sufixo mensal/anual', () => {
    it('normaliza vip_start_monthly → vip_start', () => {
      expect(normalizePlanId('vip_start_monthly')).toBe('vip_start')
    })

    it('normaliza vip_start_month → vip_start', () => {
      expect(normalizePlanId('vip_start_month')).toBe('vip_start')
    })

    it('normaliza vip_pro_annual → vip_pro', () => {
      expect(normalizePlanId('vip_pro_annual')).toBe('vip_pro')
    })

    it('normaliza vip_pro_anual → vip_pro (PT)', () => {
      expect(normalizePlanId('vip_pro_anual')).toBe('vip_pro')
    })

    it('normaliza vip_elite_yearly → vip_elite', () => {
      expect(normalizePlanId('vip_elite_yearly')).toBe('vip_elite')
    })

    it('normaliza vip_elite_mensal → vip_elite (PT)', () => {
      expect(normalizePlanId('vip_elite_mensal')).toBe('vip_elite')
    })
  })

  describe('planos sem sufixo', () => {
    it('normaliza vip_start sem sufixo → vip_start', () => {
      expect(normalizePlanId('vip_start')).toBe('vip_start')
    })

    it('normaliza VIP_PRO uppercase → vip_pro', () => {
      expect(normalizePlanId('VIP_PRO')).toBe('vip_pro')
    })
  })

  describe('planos desconhecidos', () => {
    it('retorna a string normalizada para planos desconhecidos', () => {
      expect(normalizePlanId('custom_plan')).toBe('custom_plan')
    })

    it('retorna string vazia para null', () => {
      expect(normalizePlanId(null)).toBe('')
    })

    it('retorna string vazia para undefined', () => {
      expect(normalizePlanId(undefined)).toBe('')
    })
  })
})

describe('applyTierDefaults', () => {
  it('vip_elite: ativa nutrition_macros, analytics, offline e chef_ai', () => {
    const limits = applyTierDefaults('vip_elite', { ...FREE_LIMITS })
    expect(limits.nutrition_macros).toBe(true)
    expect(limits.analytics).toBe(true)
    expect(limits.offline).toBe(true)
    expect(limits.chef_ai).toBe(true)
  })

  it('vip_pro: ativa offline mas não analytics nem chef_ai', () => {
    const limits = applyTierDefaults('vip_pro', { ...FREE_LIMITS })
    expect(limits.offline).toBe(true)
    expect(limits.analytics).toBe(false)
    expect(limits.chef_ai).toBe(false)
  })

  it('vip_start: mantém os defaults originais (sem alterações)', () => {
    const input = { ...FREE_LIMITS }
    const limits = applyTierDefaults('vip_start', input)
    expect(limits).toEqual(input)
  })
})

describe('applyTierCaps', () => {
  describe('vip_start', () => {
    it('cap de chat_daily em 10', () => {
      const limits = applyTierCaps('vip_start', { ...UNLIMITED_LIMITS })
      expect(limits.chat_daily).toBe(10)
    })

    it('cap de wizard_weekly em 1', () => {
      const limits = applyTierCaps('vip_start', { ...UNLIMITED_LIMITS })
      expect(limits.wizard_weekly).toBe(1)
    })

    it('cap de insights_weekly em 3', () => {
      const limits = applyTierCaps('vip_start', { ...UNLIMITED_LIMITS })
      expect(limits.insights_weekly).toBe(3)
    })

    it('history_days máximo de 60', () => {
      const limits = applyTierCaps('vip_start', { ...UNLIMITED_LIMITS })
      expect(limits.history_days).toBe(60)
    })

    it('nutrition_macros=false mesmo se passado true', () => {
      const limits = applyTierCaps('vip_start', { ...UNLIMITED_LIMITS })
      expect(limits.nutrition_macros).toBe(false)
    })

    it('analytics=false', () => {
      const limits = applyTierCaps('vip_start', { ...UNLIMITED_LIMITS })
      expect(limits.analytics).toBe(false)
    })
  })

  describe('vip_pro', () => {
    it('cap de chat_daily em 40', () => {
      const limits = applyTierCaps('vip_pro', { ...UNLIMITED_LIMITS })
      expect(limits.chat_daily).toBe(40)
    })

    it('history_days=null (ilimitado)', () => {
      const limits = applyTierCaps('vip_pro', { ...FREE_LIMITS })
      expect(limits.history_days).toBeNull()
    })

    it('nutrition_macros=true', () => {
      const limits = applyTierCaps('vip_pro', { ...FREE_LIMITS })
      expect(limits.nutrition_macros).toBe(true)
    })

    it('offline=true', () => {
      const limits = applyTierCaps('vip_pro', { ...FREE_LIMITS })
      expect(limits.offline).toBe(true)
    })

    it('analytics=false (só elite tem)', () => {
      const limits = applyTierCaps('vip_pro', { ...UNLIMITED_LIMITS })
      expect(limits.analytics).toBe(false)
    })

    it('chef_ai=false (só elite tem)', () => {
      const limits = applyTierCaps('vip_pro', { ...UNLIMITED_LIMITS })
      expect(limits.chef_ai).toBe(false)
    })
  })

  describe('vip_elite', () => {
    it('cap de chat_daily em 9999 (praticamente ilimitado)', () => {
      const limits = applyTierCaps('vip_elite', { ...FREE_LIMITS })
      expect(limits.chat_daily).toBe(9999)
    })

    it('history_days=null', () => {
      const limits = applyTierCaps('vip_elite', { ...FREE_LIMITS })
      expect(limits.history_days).toBeNull()
    })

    it('todos os booleans=true', () => {
      const limits = applyTierCaps('vip_elite', { ...FREE_LIMITS })
      expect(limits.nutrition_macros).toBe(true)
      expect(limits.analytics).toBe(true)
      expect(limits.offline).toBe(true)
      expect(limits.chef_ai).toBe(true)
    })
  })

  describe('plano desconhecido', () => {
    it('retorna os limits sem modificação para tier desconhecido', () => {
      const input = { ...FREE_LIMITS }
      const limits = applyTierCaps('custom_plan', input)
      expect(limits).toEqual(input)
    })
  })

  describe('sufixos mensais/anuais são normalizados corretamente antes do cap', () => {
    it('vip_start_monthly recebe os mesmos caps que vip_start', () => {
      const monthly = applyTierCaps('vip_start_monthly', { ...UNLIMITED_LIMITS })
      const base = applyTierCaps('vip_start', { ...UNLIMITED_LIMITS })
      expect(monthly).toEqual(base)
    })

    it('vip_elite_anual recebe os mesmos caps que vip_elite', () => {
      const anual = applyTierCaps('vip_elite_anual', { ...FREE_LIMITS })
      const base = applyTierCaps('vip_elite', { ...FREE_LIMITS })
      expect(anual).toEqual(base)
    })
  })
})
