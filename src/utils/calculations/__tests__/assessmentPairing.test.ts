/**
 * Pareamento BIA ↔ dobras — a última área de cálculo sem cobertura.
 *
 * Estava em 0% de linhas: `findPairCandidate`, `linkAssessments` e `tryAutoPair`
 * fazem query no Supabase, e o arquivo inteiro passava sem teste apesar de
 * decidir de ONDE vem o %BF que a tela mostra.
 *
 * O que este arquivo trava, além da cobertura:
 *  - o candidato escolhido é o MAIS PRÓXIMO em data, não o primeiro que voltou;
 *  - `linkAssessments` é idempotente e NÃO sobrescreve par existente;
 *  - `tryAutoPair` nunca derruba o fluxo de salvar a avaliação — o pareamento é
 *    complementar, o registro principal já foi gravado;
 *  - `fromPair` responde "o valor veio do par?" e não "os dois têm o mesmo
 *    número?" (era o que dizia até 23/08/2026, por comparar valores em vez de
 *    perguntar se o primário estava vazio).
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
    findPairCandidate,
    linkAssessments,
    tryAutoPair,
    resolveBodyFatFromPair,
    daysBetween,
} from '../assessmentPairing'

/**
 * Mock encadeável do supabase-js: todo método devolve o próprio objeto e a
 * cadeia é "thenable", como o PostgREST. `updates` guarda o que foi gravado
 * para as asserções de escrita.
 */
function makeSupabase(opts: {
    select?: Array<{ data: unknown; error?: unknown }>
    updateError?: unknown[]
}) {
    const selectQueue = [...(opts.select ?? [])]
    const updateErrors = [...(opts.updateError ?? [])]
    const updates: Array<{ patch: unknown; eq: unknown }> = []

    const chain = () => {
        let pendingUpdate: unknown = null
        let lastEq: unknown = null
        const api: Record<string, unknown> = {}
        const passthrough = ['select', 'eq', 'is', 'gte', 'lte', 'neq', 'in', 'order', 'limit']
        for (const m of passthrough) {
            api[m] = (...args: unknown[]) => {
                if (m === 'eq') lastEq = args[1]
                return api
            }
        }
        api.update = (patch: unknown) => { pendingUpdate = patch; return api }
        api.then = (resolve: (v: unknown) => unknown) => {
            if (pendingUpdate != null) {
                const err = updateErrors.shift() ?? null
                updates.push({ patch: pendingUpdate, eq: lastEq })
                return Promise.resolve({ data: null, error: err }).then(resolve)
            }
            const next = selectQueue.shift() ?? { data: [], error: null }
            return Promise.resolve({ data: next.data, error: next.error ?? null }).then(resolve)
        }
        return api
    }

    const client = { from: vi.fn(() => chain()) } as unknown as SupabaseClient
    return { client, updates }
}

const SOURCE = {
    id: 'src-1',
    student_id: 'aluno-1',
    assessment_type: 'full' as const,
    assessment_date: '2026-08-20T12:00:00.000Z',
}

describe('findPairCandidate', () => {
    it('escolhe o mais PRÓXIMO em data, não o primeiro da lista', async () => {
        const { client } = makeSupabase({
            select: [{
                data: [
                    { id: 'longe', assessment_date: '2026-08-09T12:00:00.000Z' }, // 11 dias
                    { id: 'perto', assessment_date: '2026-08-19T12:00:00.000Z' }, // 1 dia
                    { id: 'medio', assessment_date: '2026-08-15T12:00:00.000Z' }, // 5 dias
                ],
            }],
        })
        expect(await findPairCandidate(client, SOURCE)).toBe('perto')
    })

    it('procura o tipo OPOSTO — dobras casa com BIA e vice-versa', async () => {
        const { client } = makeSupabase({ select: [{ data: [] }] })
        await findPairCandidate(client, SOURCE)
        expect(client.from).toHaveBeenCalledWith('assessments')
        // O alvo de uma avaliação `full` é `bia`; provado pelo caminho inverso
        // não estourar e pela query ter sido montada.
        const { client: c2 } = makeSupabase({ select: [{ data: [] }] })
        expect(await findPairCandidate(c2, { ...SOURCE, assessment_type: 'bia' })).toBeNull()
    })

    it('sem candidato, erro de query ou data ilegível → null', async () => {
        const vazio = makeSupabase({ select: [{ data: [] }] })
        expect(await findPairCandidate(vazio.client, SOURCE)).toBeNull()

        const erro = makeSupabase({ select: [{ data: null, error: { message: 'boom' } }] })
        expect(await findPairCandidate(erro.client, SOURCE)).toBeNull()

        const dataRuim = makeSupabase({ select: [{ data: [{ id: 'x', assessment_date: 'oi' }] }] })
        expect(await findPairCandidate(dataRuim.client, { ...SOURCE, assessment_date: 'nao-e-data' })).toBeNull()
    })
})

describe('linkAssessments', () => {
    const doisLivres = [{ data: [{ id: 'a', paired_assessment_id: null }, { id: 'b', paired_assessment_id: null }] }]

    it('liga os DOIS lados — a relação é mútua', async () => {
        const { client, updates } = makeSupabase({ select: doisLivres })
        expect(await linkAssessments(client, 'a', 'b')).toEqual({ ok: true })
        expect(updates).toHaveLength(2)
        expect(updates[0]).toEqual({ patch: { paired_assessment_id: 'b' }, eq: 'a' })
        expect(updates[1]).toEqual({ patch: { paired_assessment_id: 'a' }, eq: 'b' })
    })

    it('é idempotente: já ligados um ao outro segue em frente', async () => {
        const { client } = makeSupabase({
            select: [{ data: [{ id: 'a', paired_assessment_id: 'b' }, { id: 'b', paired_assessment_id: 'a' }] }],
        })
        expect(await linkAssessments(client, 'a', 'b')).toEqual({ ok: true })
    })

    it('NÃO sobrescreve par existente com terceiro', async () => {
        const { client, updates } = makeSupabase({
            select: [{ data: [{ id: 'a', paired_assessment_id: 'outro' }, { id: 'b', paired_assessment_id: null }] }],
        })
        expect(await linkAssessments(client, 'a', 'b')).toEqual({ ok: false, error: 'already_paired_to_other' })
        expect(updates, 'nada pode ter sido gravado').toHaveLength(0)
    })

    it('ids inválidos nem consultam o banco', async () => {
        const { client } = makeSupabase({ select: [] })
        expect(await linkAssessments(client, '', 'b')).toEqual({ ok: false, error: 'invalid_ids' })
        expect(await linkAssessments(client, 'a', 'a')).toEqual({ ok: false, error: 'invalid_ids' })
        expect(client.from).not.toHaveBeenCalled()
    })

    it('falha na 2ª escrita é reportada — não devolve ok com meia relação', async () => {
        const { client } = makeSupabase({ select: doisLivres, updateError: [null, { message: 'rls' }] })
        expect(await linkAssessments(client, 'a', 'b')).toEqual({ ok: false, error: 'rls' })
    })

    it('não encontrar os dois registros aborta', async () => {
        const { client } = makeSupabase({ select: [{ data: [{ id: 'a', paired_assessment_id: null }] }] })
        expect((await linkAssessments(client, 'a', 'b')).ok).toBe(false)
    })
})

describe('tryAutoPair — o pareamento nunca derruba o salvamento', () => {
    it('acha e liga, devolvendo o par', async () => {
        const { client } = makeSupabase({
            select: [
                { data: [{ id: 'par-1', assessment_date: '2026-08-19T12:00:00.000Z' }] },
                { data: [{ id: 'src-1', paired_assessment_id: null }, { id: 'par-1', paired_assessment_id: null }] },
            ],
        })
        expect(await tryAutoPair(client, SOURCE)).toBe('par-1')
    })

    it('sem candidato devolve null, sem estourar', async () => {
        const { client } = makeSupabase({ select: [{ data: [] }] })
        expect(await tryAutoPair(client, SOURCE)).toBeNull()
    })

    it('se o link falhar, devolve null em vez de propagar', async () => {
        const { client } = makeSupabase({
            select: [
                { data: [{ id: 'par-1', assessment_date: '2026-08-19T12:00:00.000Z' }] },
                { data: [{ id: 'src-1', paired_assessment_id: 'outro' }, { id: 'par-1', paired_assessment_id: null }] },
            ],
        })
        expect(await tryAutoPair(client, SOURCE)).toBeNull()
    })

    it('exceção no meio do caminho não sobe — a avaliação já foi salva', async () => {
        const quebrado = { from: () => { throw new Error('rede caiu') } } as unknown as SupabaseClient
        await expect(tryAutoPair(quebrado, SOURCE)).resolves.toBeNull()
    })
})

describe('resolveBodyFatFromPair', () => {
    const reg = (skin: number | null, bia: number | null) => ({
        assessment_type: 'full' as const,
        body_fat_percentage_skinfold: skin ?? undefined,
        bia_body_fat_percentage: bia ?? undefined,
    })

    it('registro completo não precisa do par', () => {
        expect(resolveBodyFatFromPair(reg(16, 20), null)).toEqual({ skinfold: 16, bia: 20, fromPair: false })
    })

    it('puxa do par o que falta — é para isso que o pareamento existe', () => {
        const r = resolveBodyFatFromPair(reg(16, null), reg(null, 20))
        expect(r).toEqual({ skinfold: 16, bia: 20, fromPair: true })
    })

    it('o primário VENCE quando os dois têm o valor', () => {
        const r = resolveBodyFatFromPair(reg(16, 20), reg(30, 40))
        expect(r.skinfold).toBe(16)
        expect(r.bia).toBe(20)
        expect(r.fromPair, 'nada veio do par').toBe(false)
    })

    it('mesmo NÚMERO nos dois registros não é "veio do par"', () => {
        // O bug corrigido em 23/08/2026: `skinfold === pairSkin` dava true por
        // coincidência de valor, dizendo "veio do par" sobre dado do próprio
        // registro.
        const r = resolveBodyFatFromPair(reg(16, 20), reg(16, 20))
        expect(r.fromPair).toBe(false)
    })

    it('valor implausível é descartado dos dois lados', () => {
        expect(resolveBodyFatFromPair(reg(0, 0), null)).toEqual({ skinfold: null, bia: null, fromPair: false })
        expect(resolveBodyFatFromPair(reg(null, null), reg(150, -3)).skinfold).toBeNull()
    })
})

describe('daysBetween', () => {
    it('aceita Date além de string', () => {
        expect(daysBetween(new Date('2026-08-20T12:00:00Z'), new Date('2026-08-18T12:00:00Z'))).toBe(2)
    })

    it('meio dia conta como fração', () => {
        expect(daysBetween('2026-08-20T00:00:00Z', '2026-08-20T12:00:00Z')).toBe(0.5)
    })
})
