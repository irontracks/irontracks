import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMedications } from '../useMedications'
import { instalarFetch, listaDe, remedio, tomada } from '@/components/medications/__tests__/fixtures'

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logWarnRemote: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
})

const carregado = async () => {
  const hook = renderHook(() => useMedications())
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

describe('useMedications', () => {
  it('carrega a lista, as tomadas de hoje e o vínculo com professor', async () => {
    instalarFetch({
      'GET /api/medications': listaDe({ hasCoach: true, intakes: [tomada()] }),
    })
    const { result } = await carregado()
    expect(result.current.medications).toHaveLength(1)
    expect(result.current.hasCoach).toBe(true)
    expect(result.current.today).toBe('2026-10-03')
    expect(result.current.doses).toHaveLength(1)
    expect(result.current.doses[0]).toMatchObject({ time: '08:00', tomada: true })
  })

  it('resposta 500 no carregamento vira erro — fetch resolvido não é sucesso', async () => {
    instalarFetch({ 'GET /api/medications': { status: 500, body: { ok: false, error: 'x' } } })
    const { result } = await carregado()
    expect(result.current.error).toBeTruthy()
    expect(result.current.medications).toEqual([])
  })

  it('200 com ok:false também é falha', async () => {
    instalarFetch({ 'GET /api/medications': { status: 200, body: { ok: false } } })
    const { result } = await carregado()
    expect(result.current.error).toBeTruthy()
  })

  it('"Tomei" é otimista: a tela marca antes da resposta e fica marcada no sucesso', async () => {
    let liberar: (v: { status: number; body: unknown }) => void = () => {}
    const pendente = new Promise<{ status: number; body: unknown }>((r) => { liberar = r })
    instalarFetch({
      'GET /api/medications': listaDe(),
      'POST /api/medications/intakes': () => pendente,
    })
    const { result } = await carregado()

    let promessa: Promise<boolean> = Promise.resolve(false)
    act(() => { promessa = result.current.markTaken('m1', '08:00') })
    expect(result.current.doses[0].tomada).toBe(true) // antes da resposta

    await act(async () => {
      liberar({ status: 200, body: { ok: true, intake: tomada() } })
      await promessa
    })
    expect(await promessa).toBe(true)
    expect(result.current.doses[0]).toMatchObject({ tomada: true, takenAt: '2026-10-03T11:03:00Z' })
  })

  it('"Tomei" REVERTE quando a gravação falha (500, não só rede caída)', async () => {
    const f = instalarFetch({
      'GET /api/medications': listaDe(),
      'POST /api/medications/intakes': { status: 500, body: { ok: false, error: 'db' } },
    })
    const { result } = await carregado()
    let ok = true
    await act(async () => { ok = await result.current.markTaken('m1', '08:00') })
    expect(ok).toBe(false)
    expect(result.current.doses[0].tomada).toBe(false)
    expect(result.current.intakes).toEqual([])
    expect(result.current.error).toBeTruthy()
    const corpo = JSON.parse((f.mock.calls.find((c) => c[1]?.method === 'POST') as unknown as [string, { body: string }])[1].body)
    expect(corpo).toEqual({ medicationId: 'm1', time: '08:00', dateKey: '2026-10-03' })
  })

  it('"Tomei" REVERTE quando a rede cai (fetch rejeita)', async () => {
    instalarFetch({
      'GET /api/medications': listaDe(),
      'POST /api/medications/intakes': () => Promise.reject(new Error('offline')),
    })
    const { result } = await carregado()
    await act(async () => { await result.current.markTaken('m1', '08:00') })
    expect(result.current.doses[0].tomada).toBe(false)
  })

  it('409 dia_virou: reverte e recarrega a lista', async () => {
    let carregamentos = 0
    const f = instalarFetch({
      'GET /api/medications': () => {
        carregamentos++
        return listaDe({ today: carregamentos > 1 ? '2026-10-04' : '2026-10-03' })
      },
      'POST /api/medications/intakes': { status: 409, body: { ok: false, error: 'dia_virou' } },
    })
    const { result } = await carregado()
    await act(async () => { await result.current.markTaken('m1', '08:00') })
    expect(f.mock.calls.filter((c) => c[1]?.method === undefined || c[1]?.method === 'GET')).toHaveLength(2)
    expect(result.current.today).toBe('2026-10-04')
    expect(result.current.doses[0].tomada).toBe(false)
  })

  it('"Desfazer" some na hora e VOLTA se a requisição falhar', async () => {
    instalarFetch({
      'GET /api/medications': listaDe({ intakes: [tomada()] }),
      'DELETE /api/medications/intakes': { status: 500, body: { ok: false } },
    })
    const { result } = await carregado()
    expect(result.current.doses[0].tomada).toBe(true)
    let ok = true
    await act(async () => { ok = await result.current.undoTaken('m1', '08:00') })
    expect(ok).toBe(false)
    expect(result.current.doses[0].tomada).toBe(true)
  })

  it('"Desfazer" com sucesso remove a tomada', async () => {
    instalarFetch({
      'GET /api/medications': listaDe({ intakes: [tomada()] }),
      'DELETE /api/medications/intakes': { status: 200, body: { ok: true } },
    })
    const { result } = await carregado()
    await act(async () => { await result.current.undoTaken('m1', '08:00') })
    expect(result.current.doses[0].tomada).toBe(false)
  })

  it('create/update/remove devolvem boolean e só mexem na lista quando gravaram', async () => {
    instalarFetch({
      'GET /api/medications': listaDe({ intakes: [tomada()] }),
      'POST /api/medications': { status: 409, body: { ok: false, error: 'limite_atingido' } },
      'PATCH /api/medications': { status: 200, body: { ok: true, medication: remedio({ name: 'Novo nome' }) } },
      'DELETE /api/medications': { status: 200, body: { ok: true } },
    })
    const { result } = await carregado()
    const entrada = { name: 'X', dose: null, times: ['09:00'], weekdays: [1], startDate: '2026-10-03', endDate: null, notes: null, active: true }

    let r = true
    await act(async () => { r = await result.current.create(entrada) })
    expect(r).toBe(false)
    expect(result.current.error).toMatch(/limite de 30/)
    expect(result.current.medications).toHaveLength(1)

    await act(async () => { r = await result.current.update('m1', { name: 'Novo nome' }) })
    expect(r).toBe(true)
    expect(result.current.medications[0].name).toBe('Novo nome')

    await act(async () => { r = await result.current.remove('m1') })
    expect(r).toBe(true)
    expect(result.current.medications).toEqual([])
    expect(result.current.intakes).toEqual([]) // tomadas caem junto, como no banco
  })
})
