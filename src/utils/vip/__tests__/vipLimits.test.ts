import { describe, it, expect } from 'vitest'
import {
  FREE_LIMITS,
  UNLIMITED_LIMITS,
  normalizePlanId,
  applyTierDefaults,
  applyTierCaps,
} from '@/utils/vip/limits'

// ────────────────────────────────────────────────────────────────────────────
// Estas funções são importadas DIRETO do source (não mais re-implementadas no
// teste). Antes o arquivo mantinha cópias locais de normalizePlanId/
// applyTierDefaults/applyTierCaps que dessincronizaram do código real (faltava
// lab_exams) — os testes passavam sobre código morto (falsa confiança). Agora
// exercitam o código de verdade; se o source mudar, o teste acompanha.
// ────────────────────────────────────────────────────────────────────────────

describe('FREE_LIMITS e UNLIMITED_LIMITS (constantes públicas)', () => {
  it('FREE_LIMITS: chat_daily=5 (acesso semanal ao chat)', () => {
    expect(FREE_LIMITS.chat_daily).toBe(5)
  })

  it('FREE_LIMITS: history_days=30', () => {
    expect(FREE_LIMITS.history_days).toBe(30)
  })

  it('FREE_LIMITS: sem analytics, offline, lab_exams', () => {
    expect(FREE_LIMITS.analytics).toBe(false)
    expect(FREE_LIMITS.offline).toBe(false)
    expect(FREE_LIMITS.lab_exams).toBe(false)
  })

  it('UNLIMITED_LIMITS: chat_daily=9999 e todos os booleans (incl. lab_exams) true', () => {
    expect(UNLIMITED_LIMITS.chat_daily).toBe(9999)
    expect(UNLIMITED_LIMITS.history_days).toBeNull()
    expect(UNLIMITED_LIMITS.lab_exams).toBe(true)
  })

  it('ambas as constantes têm a chave lab_exams (guard anti-drift do shape)', () => {
    expect(FREE_LIMITS).toHaveProperty('lab_exams')
    expect(UNLIMITED_LIMITS).toHaveProperty('lab_exams')
  })
})

describe('normalizePlanId', () => {
  it('normaliza sufixos mensais/anuais (PT e EN) para o tier base', () => {
    expect(normalizePlanId('vip_start_monthly')).toBe('vip_start')
    expect(normalizePlanId('vip_start_month')).toBe('vip_start')
    expect(normalizePlanId('vip_pro_annual')).toBe('vip_pro')
    expect(normalizePlanId('vip_pro_anual')).toBe('vip_pro')
    expect(normalizePlanId('vip_elite_yearly')).toBe('vip_elite')
    expect(normalizePlanId('vip_elite_mensal')).toBe('vip_elite')
  })

  it('mantém planos sem sufixo e normaliza caixa', () => {
    expect(normalizePlanId('vip_start')).toBe('vip_start')
    expect(normalizePlanId('VIP_PRO')).toBe('vip_pro')
  })

  it('planos desconhecidos voltam normalizados; nulos viram string vazia', () => {
    expect(normalizePlanId('custom_plan')).toBe('custom_plan')
    expect(normalizePlanId(null)).toBe('')
    expect(normalizePlanId(undefined)).toBe('')
  })
})

describe('applyTierDefaults', () => {
  it('vip_elite: ativa nutrition_macros, analytics, offline e lab_exams', () => {
    const limits = applyTierDefaults('vip_elite', { ...FREE_LIMITS })
    expect(limits.nutrition_macros).toBe(true)
    expect(limits.analytics).toBe(true)
    expect(limits.offline).toBe(true)
    expect(limits.lab_exams).toBe(true)
  })

  it('vip_pro: ativa offline e lab_exams, mas não analytics', () => {
    const limits = applyTierDefaults('vip_pro', { ...FREE_LIMITS })
    expect(limits.offline).toBe(true)
    expect(limits.lab_exams).toBe(true)
    expect(limits.analytics).toBe(false)
  })

  it('vip_start: ativa lab_exams (feature básica de todo VIP)', () => {
    const limits = applyTierDefaults('vip_start', { ...FREE_LIMITS })
    expect(limits.lab_exams).toBe(true)
    expect(limits.nutrition_macros).toBe(false)
  })

  it('qualquer plano vip_* desconhecido ainda recebe lab_exams (não fica sem por omissão)', () => {
    const limits = applyTierDefaults('vip_novo_tier', { ...FREE_LIMITS })
    expect(limits.lab_exams).toBe(true)
  })
})

describe('applyTierCaps', () => {
  describe('vip_start', () => {
    it('caps: chat 10, wizard 1, insights 3, history 60; sem macros/analytics; lab_exams true', () => {
      const l = applyTierCaps('vip_start', { ...UNLIMITED_LIMITS })
      expect(l.chat_daily).toBe(10)
      // 4, não 1: até 02/08/2026 o Start pago tinha MENOS wizard que o free (3).
      expect(l.wizard_weekly).toBe(4)
      expect(l.insights_weekly).toBe(3)
      expect(l.history_days).toBe(60)
      expect(l.nutrition_macros).toBe(false)
      expect(l.analytics).toBe(false)
      expect(l.lab_exams).toBe(true)
    })
  })

  describe('vip_pro', () => {
    it('caps: chat 40, history ilimitado, macros/offline/lab_exams on, analytics off', () => {
      const l = applyTierCaps('vip_pro', { ...UNLIMITED_LIMITS })
      expect(l.chat_daily).toBe(40)
      expect(l.history_days).toBeNull()
      expect(l.nutrition_macros).toBe(true)
      expect(l.offline).toBe(true)
      expect(l.lab_exams).toBe(true)
      expect(l.analytics).toBe(false)
    })
  })

  describe('vip_elite', () => {
    it('tudo liberado (chat 9999, history null, todos os booleans true)', () => {
      const l = applyTierCaps('vip_elite', { ...FREE_LIMITS })
      expect(l.chat_daily).toBe(9999)
      expect(l.history_days).toBeNull()
      expect(l.nutrition_macros).toBe(true)
      expect(l.analytics).toBe(true)
      expect(l.offline).toBe(true)
      expect(l.lab_exams).toBe(true)
    })
  })

  it('plano desconhecido (não-vip): retorna os limits sem modificação', () => {
    const input = { ...FREE_LIMITS }
    expect(applyTierCaps('custom_plan', input)).toEqual(input)
  })

  describe('sufixos são normalizados antes do cap', () => {
    it('vip_start_monthly === vip_start', () => {
      expect(applyTierCaps('vip_start_monthly', { ...UNLIMITED_LIMITS }))
        .toEqual(applyTierCaps('vip_start', { ...UNLIMITED_LIMITS }))
    })
    it('vip_elite_anual === vip_elite', () => {
      expect(applyTierCaps('vip_elite_anual', { ...FREE_LIMITS }))
        .toEqual(applyTierCaps('vip_elite', { ...FREE_LIMITS }))
    })
  })
})


/**
 * Invariante de preço (bug real de 02/08/2026): o VIP Start dava 1 Wizard/semana
 * enquanto o FREE dava 3 — quem pagava recebia MENOS da feature VIP mais usada.
 * Este guard trava a CLASSE: nenhum limite de plano pago pode ficar abaixo do
 * free, em nenhum tier, para nenhuma cota numérica.
 */
describe('plano pago nunca é pior que o gratuito', () => {
  const NUMERICOS = ['chat_daily', 'wizard_weekly', 'insights_weekly'] as const
  it.each(['vip_start', 'vip_pro', 'vip_elite'])('%s ≥ free em toda cota', (tier) => {
    const pago = applyTierCaps(tier, applyTierDefaults(tier, { ...FREE_LIMITS }))
    for (const k of NUMERICOS) {
      expect(pago[k], `${tier}.${k}`).toBeGreaterThanOrEqual(FREE_LIMITS[k])
    }
    // histórico: null = ilimitado; se numérico, tem de ser ≥ free
    if (pago.history_days !== null) {
      expect(pago.history_days, `${tier}.history_days`).toBeGreaterThanOrEqual(FREE_LIMITS.history_days as number)
    }
  })
})
