import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveBarcode } from '../barcode-resolver'
import * as offSource from '../sources/off-source'
import type { SupabaseClient } from '@supabase/supabase-js'

const mockSupabase = {} as unknown as SupabaseClient

afterEach(() => vi.restoreAllMocks())

describe('resolveBarcode', () => {
  it('returns null for invalid EAN (empty string)', async () => {
    const result = await resolveBarcode(mockSupabase, '')
    expect(result).toBeNull()
  })

  it('returns null when OFF does not find the product', async () => {
    vi.spyOn(offSource, 'lookupOffByBarcode').mockResolvedValue(null)
    const result = await resolveBarcode(mockSupabase, '1234567890123')
    expect(result).toBeNull()
  })

  it('returns FoodItem when OFF finds the product', async () => {
    vi.spyOn(offSource, 'lookupOffByBarcode').mockResolvedValue({
      item: { kcal: 120, p: 25, c: 2, f: 3 },
      name: 'Peito de frango cozido',
      foodKey: 'peito-de-frango-cozido-sadia',
    })

    const result = await resolveBarcode(mockSupabase, '7891000100103')
    expect(result).not.toBeNull()
    expect(result!.item.kcal).toBe(120)
    expect(result!.name).toBe('Peito de frango cozido')
  })

  it('does NOT call Gemini even when OFF returns null', async () => {
    const geminiFallback = vi.fn()
    vi.spyOn(offSource, 'lookupOffByBarcode').mockResolvedValue(null)

    await resolveBarcode(mockSupabase, '9999999999999')
    expect(geminiFallback).not.toHaveBeenCalled()
  })
})
