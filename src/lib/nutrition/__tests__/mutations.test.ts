import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveDateKey, recalcDayTotals, setWaterCore, editEntryCore } from '../mutations'

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

describe('editEntryCore (edição por itens)', () => {
  it('grava os macros como SOMA dos itens + a coluna items, e recalcula o dia', async () => {
    let updatePayload: Record<string, unknown> = {}
    const supa = {
      from: () => ({
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload
          return { eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { date: '2026-06-16' } }) }) }) }) }
        },
        // usado pelo recalcDayTotals
        select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [{ calories: 500, protein: 64, carbs: 44, fat: 6 }] }) }) }),
      }),
    } as unknown as SupabaseClient

    const { totals } = await editEntryCore(supa, 'u', 'e1', {
      food_name: 'Almoço',
      items: [
        { label: '200g arroz', grams: 200, calories: 200, protein: 4, carbs: 44, fat: 0 },
        { label: '200g frango', grams: 200, calories: 300, protein: 60, carbs: 0, fat: 6 },
      ],
    })

    expect(updatePayload.food_name).toBe('Almoço')
    expect(updatePayload.calories).toBe(500)
    expect(updatePayload.protein).toBe(64)
    expect(updatePayload.carbs).toBe(44)
    expect(updatePayload.fat).toBe(6)
    expect(Array.isArray(updatePayload.items)).toBe(true)
    expect((updatePayload.items as unknown[]).length).toBe(2)
    expect(totals).toEqual({ calories: 500, protein: 64, carbs: 44, fat: 6 })
  })

  it('lista vazia → items null e macros zerados', async () => {
    let updatePayload: Record<string, unknown> = {}
    const supa = {
      from: () => ({
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload
          return { eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { date: '2026-06-16' } }) }) }) }) }
        },
        select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }),
      }),
    } as unknown as SupabaseClient

    await editEntryCore(supa, 'u', 'e1', { food_name: 'X', items: [] })
    expect(updatePayload.items).toBeNull()
    expect(updatePayload.calories).toBe(0)
  })

  it('sem items (edição legada) → usa os macros do draft', async () => {
    let updatePayload: Record<string, unknown> = {}
    const supa = {
      from: () => ({
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload
          return { eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { date: '2026-06-16' } }) }) }) }) }
        },
        select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }),
      }),
    } as unknown as SupabaseClient

    await editEntryCore(supa, 'u', 'e1', { food_name: 'X', calories: 123, protein: 10, carbs: 20, fat: 5 })
    expect(updatePayload.calories).toBe(123)
    expect('items' in updatePayload).toBe(false)
  })
})
