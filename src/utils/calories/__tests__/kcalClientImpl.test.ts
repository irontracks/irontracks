/**
 * O cliente de kcal — o último arquivo de cálculo em 0% de cobertura.
 *
 * Ele existe para uma coisa: **o usuário sempre vê um número de calorias**,
 * mesmo com a rota fora do ar. Toda a lógica é sobre o que fazer quando a
 * estimativa remota falha, e nada disso estava sob teste.
 *
 * As três decisões que este arquivo trava:
 *  - resposta ruim (HTTP != 2xx, kcal 0, JSON quebrado, rede caída) NUNCA
 *    aparece como zero na tela — cai no fallback local, que é o mesmo modelo MET;
 *  - o peso do check-in pré-treino é usado em vez do peso antigo da avaliação
 *    (é o dado mais fresco que existe naquele momento);
 *  - cardio outdoor com kcal do GPS tem prioridade — é medição, não estimativa.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeFallbackKcal, getKcalEstimate } from '../kcalClientImpl'

const SESSAO = {
    totalTime: 3600,
    exercises: [{ name: 'Leg press 45°' }, { name: 'Supino reto' }],
    logs: {
        '0-0': { weight: '200', reps: '10', done: true },
        '0-1': { weight: '200', reps: '10', done: true },
        '1-0': { weight: '80', reps: '10', done: true },
    },
}

const mockFetch = (impl: () => unknown) => {
    vi.stubGlobal('fetch', vi.fn(impl as never))
}

afterEach(() => vi.unstubAllGlobals())

describe('computeFallbackKcal', () => {
    it('estima pelo modelo MET quando há sessão', () => {
        const kcal = computeFallbackKcal({ session: SESSAO, weightKg: 80 })
        expect(kcal).toBeGreaterThan(100)
        expect(kcal).toBeLessThan(2000)
    })

    it('kcal do GPS (bike outdoor) vence a estimativa — é medição', () => {
        const comBike = { ...SESSAO, outdoorBike: { caloriesKcal: 640 } }
        expect(computeFallbackKcal({ session: comBike, weightKg: 80 })).toBe(640)
    })

    it('sem logs mas com duração, ainda devolve algo (não zera o card)', () => {
        const kcal = computeFallbackKcal({ session: { totalTime: 3600, logs: {} }, weightKg: 80 })
        expect(kcal).toBeGreaterThan(0)
    })

    it('sessão vazia ou lixo devolve 0 sem estourar', () => {
        expect(computeFallbackKcal({ session: null })).toBe(0)
        expect(computeFallbackKcal({ session: {} })).toBe(0)
        expect(computeFallbackKcal({ session: 'nao e sessao' })).toBe(0)
    })

    it('mais peso corporal, mais gasto', () => {
        const leve = computeFallbackKcal({ session: SESSAO, weightKg: 60 })
        const pesado = computeFallbackKcal({ session: SESSAO, weightKg: 110 })
        expect(pesado).toBeGreaterThan(leve)
    })
})

describe('getKcalEstimate — a rota nunca deixa a tela sem número', () => {
    it('usa a resposta da rota quando ela vem boa', async () => {
        mockFetch(() => ({ ok: true, json: async () => ({ kcal: 777 }) }))
        await expect(getKcalEstimate({ session: SESSAO })).resolves.toBe(777)
    })

    it('HTTP de erro → fallback local, não zero', async () => {
        mockFetch(() => ({ ok: false, json: async () => ({ kcal: 999 }) }))
        const r = await getKcalEstimate({ session: SESSAO })
        expect(r).toBeGreaterThan(0)
        expect(r, 'não pode usar o kcal de uma resposta com erro').not.toBe(999)
    })

    it('kcal ausente, zero ou não numérico → fallback', async () => {
        for (const payload of [{ kcal: 0 }, { kcal: -5 }, { kcal: 'muito' }, {}]) {
            mockFetch(() => ({ ok: true, json: async () => payload }))
            expect(await getKcalEstimate({ session: SESSAO }), JSON.stringify(payload)).toBeGreaterThan(0)
        }
    })

    it('JSON quebrado → fallback', async () => {
        mockFetch(() => ({ ok: true, json: async () => { throw new Error('unexpected token') } }))
        expect(await getKcalEstimate({ session: SESSAO })).toBeGreaterThan(0)
    })

    it('rede caída → fallback', async () => {
        mockFetch(() => { throw new Error('offline') })
        expect(await getKcalEstimate({ session: SESSAO })).toBeGreaterThan(0)
    })

    it('manda o peso do CHECK-IN para a rota — é o dado mais fresco', async () => {
        const spy = vi.fn(() => ({ ok: true, json: async () => ({ kcal: 500 }) }))
        vi.stubGlobal('fetch', spy as never)
        await getKcalEstimate({ session: { ...SESSAO, preCheckin: { weight: 94.6 } } })
        const body = JSON.parse((spy.mock.calls[0][1] as { body: string }).body)
        expect(body.preCheckinWeightKg).toBe(94.6)
    })

    it('peso de check-in absurdo é ignorado', async () => {
        const spy = vi.fn(() => ({ ok: true, json: async () => ({ kcal: 500 }) }))
        vi.stubGlobal('fetch', spy as never)
        await getKcalEstimate({ session: { ...SESSAO, preCheckin: { weight: 5 } } })
        const body = JSON.parse((spy.mock.calls[0][1] as { body: string }).body)
        expect(body.preCheckinWeightKg).toBeNull()
    })

    it('RPE só vai quando é número', async () => {
        const spy = vi.fn(() => ({ ok: true, json: async () => ({ kcal: 500 }) }))
        vi.stubGlobal('fetch', spy as never)
        await getKcalEstimate({ session: SESSAO, rpe: 8 })
        expect(JSON.parse((spy.mock.calls[0][1] as { body: string }).body).rpe).toBe(8)

        spy.mockClear()
        await getKcalEstimate({ session: SESSAO, rpe: null })
        expect(JSON.parse((spy.mock.calls[0][1] as { body: string }).body).rpe).toBeNull()
    })

    it('o fallback do erro de rede também aproveita o peso do check-in', async () => {
        mockFetch(() => { throw new Error('offline') })
        const leve = await getKcalEstimate({ session: { ...SESSAO, preCheckin: { weight: 60 } } })
        const pesado = await getKcalEstimate({ session: { ...SESSAO, preCheckin: { weight: 110 } } })
        expect(pesado).toBeGreaterThan(leve)
    })
})
