import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSetMediaForWorkout, SET_MEDIA_REPOLL_MS } from '@/hooks/useSetMediaForWorkout'

/**
 * O relatório abre segundos após a finalização e a IA responde depois: a tela
 * precisa reconsultar enquanto houver mídia `pending`/`analyzing` e PARAR
 * quando tudo estiver respondido (ou não houver mídia).
 */
const item = (aiStatus: string) => ({ id: 'm1', exerciseIndex: 0, setIndex: 0, kind: 'photo', aiStatus })
const resposta = (items: unknown[]) => ({ ok: true, json: async () => ({ ok: true, items }) })
const WID = '11111111-1111-1111-1111-111111111111'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('useSetMediaForWorkout — reconsulta enquanto a IA analisa', () => {
  it('pending → repoll → analyzed, e para de consultar', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(resposta([item('pending')]))
      .mockResolvedValueOnce(resposta([{ ...item('analyzed'), aiAnswer: 'ok' }]))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    const { result } = renderHook(() => useSetMediaForWorkout(WID))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.items[0]?.aiStatus).toBe('pending')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(SET_MEDIA_REPOLL_MS + 5) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.items[0]?.aiStatus).toBe('analyzed')
    await act(async () => { await vi.advanceTimersByTimeAsync(SET_MEDIA_REPOLL_MS * 3) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('sem mídia pendente não reconsulta', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta([item('analyzed')]))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    const { result } = renderHook(() => useSetMediaForWorkout(WID))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.items).toHaveLength(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(SET_MEDIA_REPOLL_MS * 3) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
