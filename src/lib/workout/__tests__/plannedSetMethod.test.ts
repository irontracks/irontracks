import { describe, it, expect } from 'vitest'
import { applyPlannedSetMethod, setDetailsOf } from '../plannedSetMethod'

/**
 * Gravar o método de uma série NO PLANO.
 *
 * O que estes casos protegem: a escrita atinge a série pedida e só ela, e nada
 * é gravado quando não há o que gravar — a RPC de save APAGA e recria as séries
 * do treino, então uma escrita à toa não é inofensiva aqui.
 */

const treino = () => ([
    { name: 'Supino reto', sets: 3, setDetails: [{ set_number: 1 }, { set_number: 2 }, { set_number: 3 }] },
    { name: 'Rosca direta', sets: 2 },
])

const metodoDe = (exs: unknown[] | null, exIdx: number, setIdx: number) => {
    const sd = setDetailsOf((exs ?? [])[exIdx])
    const s = sd[setIdx] as Record<string, unknown> | undefined
    return s?.per_set_method ?? null
}

describe('applyPlannedSetMethod', () => {
    it('grava o método na série pedida', () => {
        const out = applyPlannedSetMethod(treino(), 0, 2, 'Drop-Set')
        expect(metodoDe(out, 0, 2)).toBe('Drop-Set')
    })

    it('NÃO toca nas outras séries nem nos outros exercícios', () => {
        const out = applyPlannedSetMethod(treino(), 0, 2, 'Drop-Set')
        expect(metodoDe(out, 0, 0)).toBeNull()
        expect(metodoDe(out, 0, 1)).toBeNull()
        expect(metodoDe(out, 1, 0)).toBeNull()
    })

    it('não muta o array de entrada — o estado da sessão é substituído, não editado no lugar', () => {
        const original = treino()
        applyPlannedSetMethod(original, 0, 0, 'Cluster')
        expect(metodoDe(original, 0, 0)).toBeNull()
    })

    it('plano sem setDetails ganha os detalhes mínimos, sem buraco', () => {
        const out = applyPlannedSetMethod(treino(), 1, 1, 'Rest-Pause')
        const sd = setDetailsOf((out ?? [])[1])
        expect(sd).toHaveLength(2)
        expect(sd[0]).toEqual({ set_number: 1 })
        expect(metodoDe(out, 1, 1)).toBe('Rest-Pause')
    })

    it('escreve nas DUAS grafias — quem lê o plano aceita as duas e divergir apaga a escolha', () => {
        const out = applyPlannedSetMethod(treino(), 0, 0, 'Cluster') as Record<string, unknown>[]
        expect((out[0].setDetails as unknown[])[0]).toEqual((out[0].set_details as unknown[])[0])
    })

    it('série FORA do plano não é criada — gravar método inventaria a série junto', () => {
        expect(applyPlannedSetMethod(treino(), 0, 5, 'Drop-Set')).toBeNull()
        expect(applyPlannedSetMethod(treino(), 1, 2, 'Drop-Set')).toBeNull()
    })

    it('devolve null quando não há o que gravar (a escrita no plano APAGA e recria séries)', () => {
        expect(applyPlannedSetMethod(treino(), 0, 0, '   ')).toBeNull()
        expect(applyPlannedSetMethod(treino(), 9, 0, 'Cluster')).toBeNull()
        expect(applyPlannedSetMethod(treino(), -1, 0, 'Cluster')).toBeNull()
        expect(applyPlannedSetMethod(null, 0, 0, 'Cluster')).toBeNull()
    })
})
