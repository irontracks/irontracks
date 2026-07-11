import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveDateKey, recalcDayTotals, recalcAndPersistDayTotals, setWaterCore, editEntryCore, deleteEntryCore } from '../mutations'

const todayKey = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

describe('resolveDateKey', () => {
  it('passa adiante uma data passada já no formato YYYY-MM-DD', () => {
    expect(resolveDateKey('2026-06-15')).toBe('2026-06-15')
    expect(resolveDateKey('  2026-01-02  ')).toBe('2026-01-02')
  })

  it('cai pra hoje (formato válido) quando vazio ou inválido', () => {
    const re = /^\d{4}-\d{2}-\d{2}$/
    expect(resolveDateKey(undefined)).toMatch(re)
    expect(resolveDateKey('')).toMatch(re)
    expect(resolveDateKey('15/06/2026')).toMatch(re)
  })

  it('NÃO aceita data FUTURA — cai pra hoje (trava anti-poluição do backdate)', () => {
    const today = todayKey()
    // Data absurda no futuro não pode ser gravada nem disparar push de meta.
    expect(resolveDateKey('9999-12-31')).toBe(today)
    expect(resolveDateKey('9999-12-31')).not.toBe('9999-12-31')
    // Hoje continua aceito.
    expect(resolveDateKey(today)).toBe(today)
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
        // usado pelo recalcAndPersistDayTotals (persiste o agregado do dia)
        upsert: () => Promise.resolve({ error: null }),
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
        upsert: () => Promise.resolve({ error: null }),
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
        upsert: () => Promise.resolve({ error: null }),
      }),
    } as unknown as SupabaseClient

    await editEntryCore(supa, 'u', 'e1', { food_name: 'X', calories: 123, protein: 10, carbs: 20, fat: 5 })
    expect(updatePayload.calories).toBe(123)
    expect('items' in updatePayload).toBe(false)
  })
})

/**
 * Regression BUG 1 (auditoria nutrição): delete/edit PRECISAM reescrever o agregado
 * `daily_nutrition_logs`. Sem isto, a linha do dia fica com o total antigo (inflado)
 * até o próximo add, e é lida como autoritativa no ring do Overlay, PDF, correlação
 * e contexto da IA. Estes testes travam que o upsert do agregado acontece com os
 * totais RECALCULADOS.
 */
describe('recalcAndPersistDayTotals — persiste o agregado do dia', () => {
  it('faz upsert em daily_nutrition_logs com os totais recalculados (arredondados)', async () => {
    const upserts: Array<{ table: string; payload: Record<string, unknown> }> = []
    const supa = {
      from: (table: string) => ({
        select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [{ calories: 1200.4, protein: 90.6, carbs: 100, fat: 33 }] }) }) }),
        upsert: (payload: Record<string, unknown>) => { upserts.push({ table, payload }); return Promise.resolve({ error: null }) },
      }),
    } as unknown as SupabaseClient

    const totals = await recalcAndPersistDayTotals(supa, 'u', '2026-06-15')
    expect(totals).toEqual({ calories: 1200.4, protein: 90.6, carbs: 100, fat: 33 })
    expect(upserts).toHaveLength(1)
    expect(upserts[0].table).toBe('daily_nutrition_logs')
    // Arredonda ao persistir (coluna inteira), sem incluir water_ml (preserva no ON CONFLICT).
    expect(upserts[0].payload).toMatchObject({ user_id: 'u', date: '2026-06-15', calories: 1200, protein: 91, carbs: 100, fat: 33 })
    expect('water_ml' in upserts[0].payload).toBe(false)
  })

  it('erro do upsert é NÃO-fatal (a entry já foi mutada; devolve os totais)', async () => {
    const supa = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }),
        upsert: () => Promise.resolve({ error: new Error('boom') }),
      }),
    } as unknown as SupabaseClient
    await expect(recalcAndPersistDayTotals(supa, 'u', '2026-06-15')).resolves.toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })
})

describe('deleteEntryCore — persiste o agregado após excluir', () => {
  it('recalcula e faz upsert em daily_nutrition_logs após o delete', async () => {
    const upserts: Array<{ table: string; payload: Record<string, unknown> }> = []
    let deleted = false
    let selectCall = 0
    const supa = {
      from: (table: string) => ({
        // select #1 = lê a data da entry (.maybeSingle); #2 = recalcDayTotals (await direto)
        select: () => {
          selectCall++
          const isEntryLookup = selectCall === 1
          return {
            eq: () => ({
              eq: () =>
                isEntryLookup
                  ? { maybeSingle: () => Promise.resolve({ data: { date: '2026-06-15' } }) }
                  : Promise.resolve({ data: [{ calories: 400, protein: 20, carbs: 30, fat: 10 }] }),
            }),
          }
        },
        delete: () => ({ eq: () => ({ eq: () => { deleted = true; return Promise.resolve({ error: null }) } }) }),
        upsert: (payload: Record<string, unknown>) => { upserts.push({ table, payload }); return Promise.resolve({ error: null }) },
      }),
    } as unknown as SupabaseClient

    const { totals } = await deleteEntryCore(supa, 'u', 'e1')
    expect(deleted).toBe(true)
    expect(totals).toEqual({ calories: 400, protein: 20, carbs: 30, fat: 10 })
    expect(upserts).toHaveLength(1)
    expect(upserts[0].table).toBe('daily_nutrition_logs')
    expect(upserts[0].payload).toMatchObject({ user_id: 'u', date: '2026-06-15', calories: 400 })
  })
})
