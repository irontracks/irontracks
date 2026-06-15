import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveDateKey, recalcDayTotals, setWaterCore } from '../mutations'

describe('resolveDateKey', () => {
  it('passa adiante uma data já no formato YYYY-MM-DD', () => {
    expect(resolveDateKey('2026-06-15')).toBe('2026-06-15')
    expect(resolveDateKey('  2026-01-02  ')).toBe('2026-01-02')
  })

  it('cai pra hoje (formato válido) quando vazio ou inválido', () => {
    const re = /^\d{4}-\d{2}-\d{2}$/
    expect(resolveDateKey(undefined)).toMatch(re)
    expect(resolveDateKey('')).toMatch(re)
    expect(resolveDateKey('15/06/2026')).toMatch(re)
  })
})

describe('recalcDayTotals', () => {
  it('soma os macros de todas as entries do dia', async () => {
    const supa = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({
              data: [
                { calories: 200, protein: 30, carbs: 0, fat: 5 },
                { calories: 100, protein: 5, carbs: 20, fat: 2 },
              ],
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient

    const t = await recalcDayTotals(supa, 'u', '2026-06-15')
    expect(t).toEqual({ calories: 300, protein: 35, carbs: 20, fat: 7 })
  })

  it('devolve zeros quando não há entries', async () => {
    const supa = {
      from: () => ({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null }) }) }) }),
    } as unknown as SupabaseClient
    expect(await recalcDayTotals(supa, 'u', '2026-06-15')).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })
})

describe('setWaterCore', () => {
  it('faz clamp 0..10000 e arredonda o ml antes do upsert', async () => {
    const captured: Array<Record<string, unknown>> = []
    const supa = {
      from: () => ({
        upsert: (payload: Record<string, unknown>) => { captured.push(payload); return Promise.resolve({ error: null }) },
      }),
    } as unknown as SupabaseClient

    expect((await setWaterCore(supa, 'u', -50, '2026-06-15')).water_ml).toBe(0)
    expect((await setWaterCore(supa, 'u', 99999, '2026-06-15')).water_ml).toBe(10000)
    expect((await setWaterCore(supa, 'u', 750.6, '2026-06-15')).water_ml).toBe(751)
    expect(captured[0]?.water_ml).toBe(0)
    expect(captured[2]?.water_ml).toBe(751)
  })

  it('propaga erro do upsert', async () => {
    const supa = {
      from: () => ({ upsert: () => Promise.resolve({ error: new Error('boom') }) }),
    } as unknown as SupabaseClient
    await expect(setWaterCore(supa, 'u', 100, '2026-06-15')).rejects.toThrow('boom')
  })
})
