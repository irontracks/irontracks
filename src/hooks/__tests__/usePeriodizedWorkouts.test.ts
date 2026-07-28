/**
 * Guard da aba PERIODIZADOS do dashboard.
 *
 * Sintoma real (jul/2026): a aba ficava presa em "Carregando treinos
 * periodizados..." para sempre. Causa: o efeito de fetch listava
 * `periodizedLoading` nas próprias deps — o `setPeriodizedLoading(true)` do
 * corpo do efeito disparava um re-run, e o cleanup do run anterior marcava
 * `cancelled = true` na requisição já em voo. Resultado: nenhum estado era
 * escrito no fim (nem os treinos, nem o `loading=false`) e a tela travava.
 *
 * Invariante travado aqui: iniciar o carregamento NÃO pode cancelar o próprio
 * fetch — a aba sempre chega a um estado terminal (dados ou erro).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const supabaseResult = { data: [] as unknown[], error: null as unknown }

const makeQuery = () => {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.in = () => q
  q.eq = () => q
  q.limit = () => Promise.resolve(supabaseResult)
  q.maybeSingle = () => Promise.resolve(supabaseResult)
  return q
}

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ from: () => makeQuery() }),
}))

import { usePeriodizedWorkouts } from '../usePeriodizedWorkouts'

describe('usePeriodizedWorkouts', () => {
  beforeEach(() => {
    supabaseResult.data = []
    supabaseResult.error = null
  })

  it('sai do estado de carregamento e entrega os treinos da periodização', async () => {
    supabaseResult.data = [
      { id: '11111111-1111-4111-8111-111111111111', user_id: '22222222-2222-4222-8222-222222222222', name: 'VIP • Upper A', notes: null, archived_at: null, sort_order: 0, created_at: null },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({ ok: true, workouts: [{ workout_id: '11111111-1111-4111-8111-111111111111', exercise_count: 5 }] }),
      })),
    )

    const { result } = renderHook(() => usePeriodizedWorkouts({ view: 'dashboard', workoutsTab: 'periodized' }))

    await waitFor(() => expect(result.current.periodizedLoaded).toBe(true))
    expect(result.current.periodizedLoading).toBe(false)
    expect(result.current.periodizedError).toBe('')
    expect(result.current.periodizedWorkouts.map((w) => w.id)).toEqual(['11111111-1111-4111-8111-111111111111'])
  })

  it('falha da API também chega a estado terminal (erro visível, sem loading eterno)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ ok: false, error: 'sem programa ativo' }) })),
    )

    const { result } = renderHook(() => usePeriodizedWorkouts({ view: 'dashboard', workoutsTab: 'periodized' }))

    await waitFor(() => expect(result.current.periodizedLoaded).toBe(true))
    expect(result.current.periodizedLoading).toBe(false)
    expect(result.current.periodizedError).toBe('sem programa ativo')
  })
})
