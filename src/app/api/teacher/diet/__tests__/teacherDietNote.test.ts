/**
 * A orientação do professor por refeição — e as duas fronteiras que a protegem.
 *
 * O aluno LÊ esse campo no `PrescribedDietPlan` e não edita; o professor
 * escreve por aqui. As duas rotas são espelhos: a do aluno
 * (`/api/nutrition/diet-plan/note`) exige plano PRÓPRIO, esta exige que o plano
 * seja do PROFESSOR — senão um coach escreveria dentro da dieta que o próprio
 * aluno montou.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const podeOrientar = vi.fn(async () => true)

vi.mock('@/utils/auth/route', () => ({
    requireRole: vi.fn(async () => ({ ok: true, user: { id: 'prof-1', email: 'prof@x.com' }, supabase: {} })),
}))
vi.mock('@/utils/auth/studentAccess', () => ({ canCoachStudent: (...a: unknown[]) => podeOrientar(...(a as [])) }))
vi.mock('@/utils/rateLimit', () => ({ checkRateLimitAsync: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn() }))

let planoNoBanco: Record<string, unknown> | null = null
let gravado: Record<string, unknown> | null = null

vi.mock('@/utils/supabase/admin', () => ({
    createAdminClient: () => ({
        from: () => {
            const chain: Record<string, unknown> = {}
            const self = () => chain
            for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = self
            chain.maybeSingle = async () => ({ data: planoNoBanco, error: null })
            chain.update = (payload: Record<string, unknown>) => { gravado = payload; return chain }
            ;(chain as { then?: unknown }).then = (r: (v: unknown) => void) => r({ data: null, error: null })
            return chain
        },
    }),
}))

import { POST } from '../note/route'

const req = (body: unknown) =>
    new Request('http://x/api/teacher/diet/note', { method: 'POST', body: JSON.stringify(body) })

const refeicoes = (note?: string) => [
    { name: 'Café', items: [{ food: 'Ovo', grams: 150 }], ...(note ? { note } : {}) },
    { name: 'Jantar', items: [{ food: 'Patinho', grams: 200 }] },
]

describe('POST /api/teacher/diet/note', () => {
    beforeEach(() => {
        podeOrientar.mockResolvedValue(true)
        gravado = null
        planoNoBanco = { id: 'p1', created_by: 'prof-1', meals: refeicoes() }
    })

    it('grava a orientação na refeição escolhida, sem tocar nas outras', async () => {
        const res = await POST(req({ studentId: 'aluno-1', mealIndex: 0, note: 'mastigar devagar' }))
        expect(res.status).toBe(200)
        const meals = (gravado?.meals ?? []) as Array<Record<string, unknown>>
        expect(meals[0].note).toBe('mastigar devagar')
        expect(meals[1].note).toBeUndefined()
        expect(meals[0].items, 'a comida não pode ser perdida na escrita').toBeTruthy()
    })

    it('⚠️ RECUSA escrever no plano que o próprio ALUNO montou', async () => {
        // Espelho da regra que impede o aluno de editar a prescrição. Sem isto,
        // o coach escreveria dentro da dieta particular dele.
        planoNoBanco = { id: 'p2', created_by: 'aluno-1', meals: refeicoes() }
        const res = await POST(req({ studentId: 'aluno-1', mealIndex: 0, note: 'oi' }))
        expect(res.status).toBe(409)
        expect(gravado, 'nada pode ter sido gravado').toBeNull()
    })

    it('⚠️ RECUSA professor que não é o coach daquele aluno (anti-IDOR)', async () => {
        podeOrientar.mockResolvedValue(false)
        const res = await POST(req({ studentId: 'aluno-de-outro', mealIndex: 0, note: 'oi' }))
        expect(res.status).toBe(403)
        expect(gravado).toBeNull()
    })

    it('texto vazio REMOVE a chave em vez de gravar string vazia', async () => {
        planoNoBanco = { id: 'p1', created_by: 'prof-1', meals: refeicoes('apagar isto') }
        await POST(req({ studentId: 'aluno-1', mealIndex: 0, note: '' }))
        const meals = (gravado?.meals ?? []) as Array<Record<string, unknown>>
        expect('note' in meals[0]).toBe(false)
    })

    it('refeição inexistente devolve 404, não grava fora do índice', async () => {
        const res = await POST(req({ studentId: 'aluno-1', mealIndex: 9, note: 'oi' }))
        expect(res.status).toBe(404)
        expect(gravado).toBeNull()
    })

    it('preserva campos que a rota não conhece — a escrita é cirúrgica', async () => {
        // O gerador pode ter gravado campos que esta rota não declara. Passar por
        // um parser que reconstrói campo a campo os apagaria (armadilha real do
        // `planDays`, documentada no CLAUDE.md).
        planoNoBanco = { id: 'p1', created_by: 'prof-1', meals: [{ name: 'Café', items: [], time: '07:00', totals: { calories: 215 }, campoNovo: 'x' }] }
        await POST(req({ studentId: 'aluno-1', mealIndex: 0, note: 'oi' }))
        const meals = (gravado?.meals ?? []) as Array<Record<string, unknown>>
        expect(meals[0].time).toBe('07:00')
        expect(meals[0].totals).toEqual({ calories: 215 })
        expect(meals[0].campoNovo).toBe('x')
    })
})
