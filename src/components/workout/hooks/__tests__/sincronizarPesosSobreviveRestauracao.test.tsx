/**
 * Sincronizar pesos (🔗) sobrevive a fechar e reabrir o app, e morre com o treino.
 *
 * Vivia só em memória: restaurar a sessão desligava a sincronização em silêncio.
 * Decisão do dono (24/09/2026): fica ligada até FINALIZAR — e treino novo é
 * sessão nova, com chave nova, então nasce desligada.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkoutModals } from '../useWorkoutModals'

const chavesDaSessao = (id: string) => [`irontracks.collapsed.v1.${id}`, `irontracks.deferred.v1.${id}`] as const

beforeEach(() => { window.localStorage.clear() })

describe('🔗 persistido por sessão', () => {
  it('ligado, o app fecha e o treino é restaurado: continua ligado', () => {
    const [c, d] = chavesDaSessao('sessao-1')
    const antes = renderHook(() => useWorkoutModals(c, d))
    act(() => { antes.result.current.setLinkedWeightExercises(new Set([0, 2])) })
    antes.unmount() // o app fechou

    const depois = renderHook(() => useWorkoutModals(c, d))
    expect([...depois.result.current.linkedWeightExercises].sort()).toEqual([0, 2])
  })

  it('desligar também é lembrado', () => {
    const [c, d] = chavesDaSessao('sessao-1')
    const a = renderHook(() => useWorkoutModals(c, d))
    act(() => { a.result.current.setLinkedWeightExercises(new Set([1])) })
    act(() => { a.result.current.setLinkedWeightExercises(new Set()) })
    a.unmount()
    expect(renderHook(() => useWorkoutModals(c, d)).result.current.linkedWeightExercises.size).toBe(0)
  })

  it('treino finalizado → o próximo treino é outra sessão e nasce DESLIGADO', () => {
    const [c1, d1] = chavesDaSessao('sessao-1')
    const a = renderHook(() => useWorkoutModals(c1, d1))
    act(() => { a.result.current.setLinkedWeightExercises(new Set([0])) })
    a.unmount()

    const [c2, d2] = chavesDaSessao('sessao-2')
    expect(renderHook(() => useWorkoutModals(c2, d2)).result.current.linkedWeightExercises.size).toBe(0)
  })

  it('sem sessão identificada: desligado e sem quebrar', () => {
    const { result } = renderHook(() => useWorkoutModals(null, null))
    expect(result.current.linkedWeightExercises.size).toBe(0)
    act(() => { result.current.setLinkedWeightExercises(new Set([0])) })
    expect(result.current.linkedWeightExercises.has(0)).toBe(true)
  })
})
