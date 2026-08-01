/**
 * Testes do histórico da Avaliação por Foto.
 *
 * Contexto: até jul/2026 o laudo era gravado no banco e as fotos no bucket
 * privado, mas NÃO havia tela pra consultar depois — o backend inteiro
 * (listar/abrir/apagar) existia sem um único consumidor. Estes testes travam o
 * comportamento da camada de dados dessa tela.
 *
 * Invariantes que importam:
 *  1. a lista carrega sozinha ao montar (a tela abre já buscando);
 *  2. erro de IA NUNCA chega cru na UI — vira mensagem em pt-BR (foi assim que
 *     o usuário viu literalmente "ai_error" quando a cota do Gemini estourou);
 *  3. apagar remove da lista sem precisar de refetch, e fecha o detalhe aberto;
 *  4. falha ao apagar NÃO some com o item da lista.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mocks = {
    list: vi.fn(),
    detail: vi.fn(),
    correlation: vi.fn(),
    remove: vi.fn(),
}

vi.mock('@/lib/api/bodyPhoto', () => ({
    fetchBodyPhotoList: (...a: unknown[]) => mocks.list(...a),
    fetchBodyPhotoDetail: (...a: unknown[]) => mocks.detail(...a),
    fetchBodyPhotoCorrelation: (...a: unknown[]) => mocks.correlation(...a),
}))
vi.mock('@/actions/bodyPhotoAssessment-actions', () => ({
    deleteBodyPhotoAssessment: (...a: unknown[]) => mocks.remove(...a),
}))

import { useBodyPhotoHistory } from '../useBodyPhotoHistory'

const CORRELATION = {
    headline: 'salva', narrative: 'n', whatIsWorking: [], whatIsMissing: [],
    links: [], nextFocus: [], confidence: 'high' as const,
}
const WINDOW = {
    fromIso: '2026-05-01T00:00:00Z', toIso: '2026-07-31T23:59:59Z',
    hasPreviousAssessment: false, sessions: 34, totalVolumeKg: 184320, totalSets: 612,
    topExercises: [{ name: 'Supino', volumeKg: 100, sets: 3 }],
}

const item = (id: string, status = 'done', correlation: unknown = null) => ({
    id, user_id: 'u1', trainer_id: null, created_by: 'u1',
    assessment_date: '2026-07-31', status,
    composition_score: 78, symmetry_score: 85, posture_score: 80, proportion_score: 82,
    body_fat_estimate_low: 14, body_fat_estimate_high: 17,
    analysis: null, correlation, ai_model: null, ai_analyzed_at: null, notes: null,
    created_at: '2026-07-31T00:00:00Z', updated_at: '2026-07-31T00:00:00Z',
    thumbnailUrl: null,
})

describe('useBodyPhotoHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.list.mockResolvedValue({ ok: true, assessments: [item('a1'), item('a2', 'failed')] })
        mocks.detail.mockResolvedValue({ ok: true, detail: { assessment: item('a1'), photos: [] } })
        mocks.remove.mockResolvedValue({ ok: true })
    })

    it('carrega a lista sozinho ao montar', async () => {
        const { result } = renderHook(() => useBodyPhotoHistory())
        expect(result.current.listLoading).toBe(true)
        await waitFor(() => expect(result.current.listLoading).toBe(false))
        expect(result.current.items.map((i) => i.id)).toEqual(['a1', 'a2'])
        expect(mocks.list).toHaveBeenCalledTimes(1)
    })

    it('abre o detalhe e limpa a correlação da avaliação anterior', async () => {
        mocks.correlation.mockResolvedValue({
            ok: true,
            correlation: { headline: 'h', narrative: 'n', whatIsWorking: [], whatIsMissing: [], links: [], nextFocus: [], confidence: 'high' },
            window: { fromIso: '', toIso: '', hasPreviousAssessment: false, sessions: 3, totalVolumeKg: 100, totalSets: 9, topExercises: [] },
        })
        const { result } = renderHook(() => useBodyPhotoHistory())
        await waitFor(() => expect(result.current.listLoading).toBe(false))

        await act(async () => { await result.current.openDetail('a1') })
        expect(result.current.detail?.assessment.id).toBe('a1')

        await act(async () => { await result.current.correlate() })
        expect(result.current.correlation?.data.headline).toBe('h')

        await act(async () => { await result.current.openDetail('a2') })
        expect(result.current.correlation).toBeNull()
    })

    it('traduz o código de erro de IA em vez de repassá-lo cru', async () => {
        mocks.correlation.mockResolvedValue({ ok: false, error: 'ai_error' })
        const { result } = renderHook(() => useBodyPhotoHistory())
        await waitFor(() => expect(result.current.listLoading).toBe(false))
        await act(async () => { await result.current.openDetail('a1') })
        await act(async () => { await result.current.correlate() })

        expect(result.current.correlationError).not.toBe('ai_error')
        expect(result.current.correlationError.toLowerCase()).toContain('ia')
    })

    it('usa a mensagem da rota quando ela existe (422 com texto nosso)', async () => {
        mocks.correlation.mockResolvedValue({ ok: false, error: 'correlation_failed', message: 'Não consegui gerar a correlação. Tente novamente.' })
        const { result } = renderHook(() => useBodyPhotoHistory())
        await waitFor(() => expect(result.current.listLoading).toBe(false))
        await act(async () => { await result.current.openDetail('a1') })
        await act(async () => { await result.current.correlate() })

        expect(result.current.correlationError).toBe('Não consegui gerar a correlação. Tente novamente.')
    })

    it('apagar tira da lista e fecha o detalhe aberto — sem refetch', async () => {
        const { result } = renderHook(() => useBodyPhotoHistory())
        await waitFor(() => expect(result.current.listLoading).toBe(false))
        await act(async () => { await result.current.openDetail('a1') })

        await act(async () => { await result.current.removeAssessment('a1') })

        expect(result.current.items.map((i) => i.id)).toEqual(['a2'])
        expect(result.current.detail).toBeNull()
        expect(mocks.list).toHaveBeenCalledTimes(1)
    })

    it('abre a correlação JÁ SALVA sem gastar chamada de IA', async () => {
        // O ponto da persistência: reabrir um laudo não pode custar IA nem espera.
        const stored = { correlation: CORRELATION, window: WINDOW, generatedAt: '2026-07-31T22:55:00Z' }
        mocks.detail.mockResolvedValue({ ok: true, detail: { assessment: item('a1', 'done', stored), photos: [] } })

        const { result } = renderHook(() => useBodyPhotoHistory())
        await waitFor(() => expect(result.current.listLoading).toBe(false))
        await act(async () => { await result.current.openDetail('a1') })

        expect(result.current.correlation?.data.headline).toBe('salva')
        expect(result.current.correlation?.window.sessions).toBe(34)
        expect(result.current.correlation?.generatedAt).toBe('2026-07-31T22:55:00Z')
        expect(mocks.correlation).not.toHaveBeenCalled()
    })

    it('correlação salva em formato inesperado não quebra a tela — cai pro estado "gerar"', async () => {
        mocks.detail.mockResolvedValue({
            ok: true,
            detail: { assessment: item('a1', 'done', { correlation: { confidence: 'sim' }, window: 'nada' }), photos: [] },
        })
        const { result } = renderHook(() => useBodyPhotoHistory())
        await waitFor(() => expect(result.current.listLoading).toBe(false))
        await act(async () => { await result.current.openDetail('a1') })

        expect(result.current.correlation).toBeNull()
        expect(result.current.detail?.assessment.id).toBe('a1')
    })

    it('atualizar sobrescreve a salva e carrega o generatedAt novo', async () => {
        const stored = { correlation: CORRELATION, window: WINDOW, generatedAt: '2026-07-01T10:00:00Z' }
        mocks.detail.mockResolvedValue({ ok: true, detail: { assessment: item('a1', 'done', stored), photos: [] } })
        mocks.correlation.mockResolvedValue({
            ok: true,
            correlation: { ...CORRELATION, headline: 'recalculada' },
            window: { ...WINDOW, sessions: 40 },
            generatedAt: '2026-07-31T23:00:00Z',
        })

        const { result } = renderHook(() => useBodyPhotoHistory())
        await waitFor(() => expect(result.current.listLoading).toBe(false))
        await act(async () => { await result.current.openDetail('a1') })
        expect(result.current.correlation?.data.headline).toBe('salva')

        await act(async () => { await result.current.correlate() })
        expect(result.current.correlation?.data.headline).toBe('recalculada')
        expect(result.current.correlation?.window.sessions).toBe(40)
        expect(result.current.correlation?.generatedAt).toBe('2026-07-31T23:00:00Z')
    })

    it('falha ao atualizar PRESERVA a correlação salva na tela', async () => {
        const stored = { correlation: CORRELATION, window: WINDOW, generatedAt: '2026-07-01T10:00:00Z' }
        mocks.detail.mockResolvedValue({ ok: true, detail: { assessment: item('a1', 'done', stored), photos: [] } })
        mocks.correlation.mockResolvedValue({ ok: false, error: 'ai_rate_limited' })

        const { result } = renderHook(() => useBodyPhotoHistory())
        await waitFor(() => expect(result.current.listLoading).toBe(false))
        await act(async () => { await result.current.openDetail('a1') })
        await act(async () => { await result.current.correlate() })

        expect(result.current.correlation?.data.headline).toBe('salva')
        expect(result.current.correlationError).not.toBe('')
    })

    it('falha ao apagar mantém o item na lista e mostra o erro', async () => {
        mocks.remove.mockResolvedValue({ ok: false, error: 'permission denied' })
        const { result } = renderHook(() => useBodyPhotoHistory())
        await waitFor(() => expect(result.current.listLoading).toBe(false))

        await act(async () => { await result.current.removeAssessment('a1') })

        expect(result.current.items.map((i) => i.id)).toEqual(['a1', 'a2'])
        expect(result.current.listError).toBe('permission denied')
        expect(result.current.deletingId).toBeNull()
    })
})
