/**
 * Client wrappers para a Avaliação Física por Foto.
 * CRUD de escrita fica em src/actions/bodyPhotoAssessment-actions.ts;
 * aqui ficam as chamadas às API routes (leitura com signed URLs + análise IA).
 */
import type { BodyPhotoAssessment, BodyPhotoAssessmentPhoto, BodyPhotoLaudo, BodyPhotoCorrelation, TrainingWindowSummary } from '@/types/bodyPhotoAssessment'

export interface BodyPhotoListItem extends BodyPhotoAssessment {
    thumbnailUrl: string | null
}

export interface BodyPhotoDetail {
    assessment: BodyPhotoAssessment
    photos: Array<BodyPhotoAssessmentPhoto & { signedUrl: string | null }>
}

export async function fetchBodyPhotoList(): Promise<{ ok: boolean; assessments?: BodyPhotoListItem[]; error?: string }> {
    try {
        const res = await fetch('/api/body-photo/assessments', { method: 'GET' })
        const json = await res.json().catch(() => ({ ok: false, error: 'invalid_response' }))
        if (!res.ok || !json.ok) return { ok: false, error: json.error || 'Falha ao listar.' }
        return { ok: true, assessments: json.assessments as BodyPhotoListItem[] }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede.' }
    }
}

export async function fetchBodyPhotoDetail(id: string): Promise<{ ok: boolean; detail?: BodyPhotoDetail; error?: string }> {
    try {
        const res = await fetch(`/api/body-photo/assessments?id=${encodeURIComponent(id)}`, { method: 'GET' })
        const json = await res.json().catch(() => ({ ok: false, error: 'invalid_response' }))
        if (!res.ok || !json.ok) return { ok: false, error: json.error || 'Falha ao carregar.' }
        return { ok: true, detail: { assessment: json.assessment, photos: json.photos } }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede.' }
    }
}

export async function analyzeBodyPhoto(
    assessmentId: string,
): Promise<{ ok: boolean; analysis?: BodyPhotoLaudo; error?: string; message?: string }> {
    try {
        const res = await fetch('/api/ai/body-composition-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assessmentId }),
        })
        const json = await res.json().catch(() => ({ ok: false, error: 'invalid_response' }))
        if (!res.ok || !json.ok) return { ok: false, error: json.error || 'Falha na análise.', message: json.message }
        return { ok: true, analysis: json.analysis as BodyPhotoLaudo }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede.' }
    }
}

export async function fetchBodyPhotoCorrelation(
    assessmentId: string,
): Promise<{ ok: boolean; correlation?: BodyPhotoCorrelation; window?: TrainingWindowSummary; error?: string; message?: string }> {
    try {
        const res = await fetch('/api/ai/body-composition-correlation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assessmentId }),
        })
        const json = await res.json().catch(() => ({ ok: false, error: 'invalid_response' }))
        if (!res.ok || !json.ok) return { ok: false, error: json.error || 'Falha na correlação.', message: json.message }
        return { ok: true, correlation: json.correlation as BodyPhotoCorrelation, window: json.window as TrainingWindowSummary }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede.' }
    }
}
