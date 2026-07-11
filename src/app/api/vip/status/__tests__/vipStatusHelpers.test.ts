import { describe, it, expect } from 'vitest'
import { FREE_LIMITS, UNLIMITED_LIMITS, normalizePlanId } from '@/utils/vip/limits'

// ─────────────────────────────────────────────────────────────────────────────
// Guard de sanidade das constantes/normalização que a rota /api/vip/status usa
// (via getVipPlanLimits). Antes este arquivo re-implementava FREE_LIMITS e
// normalizePlanId LOCALMENTE, e as cópias tinham dessincronizado do source
// (FREE_LIMITS.chat_daily=0 vs 5 real; um normalizePlanId de semântica diferente,
// que "removia caracteres especiais"). Os testes passavam sobre ficção. Agora
// importam o código real — se o source mudar, o teste acompanha.
// ─────────────────────────────────────────────────────────────────────────────

describe('constantes de limite VIP (reais, usadas pela /api/vip/status)', () => {
  it('FREE_LIMITS: chat_daily=5, history 30 dias, features de IA/pagas desligadas', () => {
    expect(FREE_LIMITS.chat_daily).toBe(5)
    expect(FREE_LIMITS.history_days).toBe(30)
    expect(FREE_LIMITS.nutrition_macros).toBe(false)
    expect(FREE_LIMITS.analytics).toBe(false)
    expect(FREE_LIMITS.offline).toBe(false)
    expect(FREE_LIMITS.chef_ai).toBe(false)
    expect(FREE_LIMITS.lab_exams).toBe(false)
  })

  it('UNLIMITED_LIMITS: cotas altas, history ilimitado e todos os booleans (incl. lab_exams) true', () => {
    expect(UNLIMITED_LIMITS.chat_daily).toBeGreaterThan(100)
    expect(UNLIMITED_LIMITS.wizard_weekly).toBeGreaterThan(100)
    expect(UNLIMITED_LIMITS.insights_weekly).toBeGreaterThan(100)
    expect(UNLIMITED_LIMITS.history_days).toBeNull()
    expect(UNLIMITED_LIMITS.nutrition_macros).toBe(true)
    expect(UNLIMITED_LIMITS.analytics).toBe(true)
    expect(UNLIMITED_LIMITS.offline).toBe(true)
    expect(UNLIMITED_LIMITS.chef_ai).toBe(true)
    expect(UNLIMITED_LIMITS.lab_exams).toBe(true)
  })

  it('FREE e UNLIMITED têm exatamente o mesmo conjunto de chaves (shape coerente)', () => {
    expect(Object.keys(FREE_LIMITS).sort()).toEqual(Object.keys(UNLIMITED_LIMITS).sort())
  })
})

describe('normalizePlanId (real) — colapsa sufixos mensais/anuais no tier base', () => {
  it('normaliza tiers VIP com sufixo de período', () => {
    expect(normalizePlanId('vip_pro_monthly')).toBe('vip_pro')
    expect(normalizePlanId('VIP_ELITE_YEARLY')).toBe('vip_elite')
    expect(normalizePlanId('vip_start_anual')).toBe('vip_start')
  })

  it('normaliza caixa e espaços', () => {
    expect(normalizePlanId('  Vip Pro  ')).toBe('vip_pro')
  })

  it('plano não-VIP volta normalizado (não é forçado a null)', () => {
    expect(normalizePlanId('premium_plan')).toBe('premium_plan')
  })

  it('vazio/null/undefined viram string vazia', () => {
    expect(normalizePlanId('')).toBe('')
    expect(normalizePlanId(null)).toBe('')
    expect(normalizePlanId(undefined)).toBe('')
  })
})
