'use client'

/**
 * Dados do histórico da Avaliação por Foto — lista, detalhe, correlação e exclusão.
 *
 * Separado da UI pelo padrão do repo (lógica em hooks, componentes só renderizam)
 * e porque a carga inicial no mount pertence a um hook, não ao corpo de um
 * componente. Modelo: `useLabExams`.
 *
 * A correlação com treino NÃO é persistida: cada chamada recomputa com os
 * treinos mais recentes da janela, então o resultado muda conforme a pessoa
 * treina — é isso que a torna útil, e por isso não vale cachear.
 */

import { useCallback, useEffect, useState } from 'react'
import { deleteBodyPhotoAssessment } from '@/actions/bodyPhotoAssessment-actions'
import {
    fetchBodyPhotoCorrelation,
    fetchBodyPhotoDetail,
    fetchBodyPhotoList,
    type BodyPhotoDetail,
    type BodyPhotoListItem,
} from '@/lib/api/bodyPhoto'
import { translateAiError } from '@/utils/ai/clientErrors'
import { parseStoredCorrelation, type BodyPhotoCorrelation, type TrainingWindowSummary } from '@/types/bodyPhotoAssessment'

export interface CorrelationResult {
    data: BodyPhotoCorrelation
    window: TrainingWindowSummary
    /** ISO de quando a correlação foi gerada — a leitura envelhece conforme a pessoa treina. */
    generatedAt: string | null
}

export interface UseBodyPhotoHistoryResult {
    items: BodyPhotoListItem[]
    listLoading: boolean
    listError: string
    reloadList: () => void

    detail: BodyPhotoDetail | null
    detailLoading: boolean
    detailError: string
    openDetail: (id: string) => Promise<void>
    backToList: () => void

    correlation: CorrelationResult | null
    correlationLoading: boolean
    correlationError: string
    correlate: () => Promise<void>

    deletingId: string | null
    removeAssessment: (id: string) => Promise<void>
}

export function useBodyPhotoHistory(): UseBodyPhotoHistoryResult {
    const [items, setItems] = useState<BodyPhotoListItem[]>([])
    const [listLoading, setListLoading] = useState(true)
    const [listError, setListError] = useState('')

    const [detail, setDetail] = useState<BodyPhotoDetail | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [detailError, setDetailError] = useState('')

    const [correlation, setCorrelation] = useState<CorrelationResult | null>(null)
    const [correlationLoading, setCorrelationLoading] = useState(false)
    const [correlationError, setCorrelationError] = useState('')

    const [deletingId, setDeletingId] = useState<string | null>(null)

    const loadList = useCallback(async () => {
        setListLoading(true); setListError('')
        try {
            const res = await fetchBodyPhotoList()
            if (!res.ok || !res.assessments) throw new Error(res.error || 'Não consegui carregar seus laudos.')
            setItems(res.assessments)
        } catch (e) {
            setListError(e instanceof Error ? e.message : 'Não consegui carregar seus laudos.')
        } finally {
            setListLoading(false)
        }
    }, [])

    useEffect(() => { void loadList() }, [loadList])

    const reloadList = useCallback(() => { void loadList() }, [loadList])

    const backToList = useCallback(() => {
        setDetail(null); setDetailError('')
        setCorrelation(null); setCorrelationError('')
    }, [])

    const openDetail = useCallback(async (id: string) => {
        setDetailLoading(true); setDetailError('')
        setCorrelation(null); setCorrelationError('')
        const res = await fetchBodyPhotoDetail(id)
        if (!res.ok || !res.detail) {
            setDetailError(res.error || 'Não consegui abrir este laudo.')
        } else {
            setDetail(res.detail)
            // Hidrata a correlação JÁ SALVA (coluna `correlation`): reabrir um laudo
            // não deve custar chamada de IA nem espera. `parseStoredCorrelation` é
            // tolerante — formato inesperado vira null e a UI oferece gerar de novo.
            const stored = parseStoredCorrelation(res.detail.assessment.correlation)
            if (stored) setCorrelation({ data: stored.correlation, window: stored.window, generatedAt: stored.generatedAt })
        }
        setDetailLoading(false)
    }, [])

    const correlate = useCallback(async () => {
        const id = detail?.assessment.id
        if (!id) return
        setCorrelationLoading(true); setCorrelationError('')
        const res = await fetchBodyPhotoCorrelation(id)
        // `message` = texto nosso (ex.: 422 do laudo); senão traduz o código canônico
        // de IA — sem isso o usuário via "ai_error" cru na tela.
        if (!res.ok || !res.correlation || !res.window) setCorrelationError(res.message?.trim() || translateAiError(res.error))
        else setCorrelation({ data: res.correlation, window: res.window, generatedAt: res.generatedAt ?? null })
        setCorrelationLoading(false)
    }, [detail])

    const removeAssessment = useCallback(async (id: string) => {
        setDeletingId(id)
        const res = await deleteBodyPhotoAssessment(id)
        setDeletingId(null)
        if (!res.ok) { setListError(res.error || 'Não consegui apagar esta avaliação.'); return }
        setItems((prev) => prev.filter((a) => a.id !== id))
        setDetail((prev) => (prev?.assessment.id === id ? null : prev))
    }, [])

    return {
        items, listLoading, listError, reloadList,
        detail, detailLoading, detailError, openDetail, backToList,
        correlation, correlationLoading, correlationError, correlate,
        deletingId, removeAssessment,
    }
}
