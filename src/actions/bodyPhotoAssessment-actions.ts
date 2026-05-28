import { createClient } from '@/utils/supabase/client'
import { trackUserEvent } from '@/lib/telemetry/userActivity'
import { logError } from '@/lib/logger'
import type { ActionResult } from '@/types/actions'
import type { BodyPhotoAssessment } from '@/types/bodyPhotoAssessment'

/**
 * Server-side data functions (browser client, RLS-enforced) para a Avaliação
 * Física por Foto. Apenas ESCRITAS simples ficam aqui — leituras com fotos,
 * upload e análise IA exigem service role e ficam em API routes
 * (/api/body-photo/* e /api/ai/body-composition-photo).
 *
 * RLS (tabela body_photo_assessments):
 *   - dono:    auth.uid() = user_id   (autoavaliação)
 *   - personal: auth.uid() = trainer_id (avalia aluno)
 */

interface CreateOptions {
    /** user_id do aluno avaliado (fluxo personal). Omitido = autoavaliação. */
    studentUserId?: string | null
    /** Data da avaliação (YYYY-MM-DD). Default = hoje. */
    assessmentDate?: string | null
}

export async function createBodyPhotoAssessment(
    opts: CreateOptions = {},
): Promise<ActionResult<{ id: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return { ok: false, error: 'unauthorized' }

        const isTrainerFlow = !!opts.studentUserId && opts.studentUserId !== user.id
        const targetUserId = isTrainerFlow ? String(opts.studentUserId) : user.id

        const row = {
            user_id: targetUserId,
            trainer_id: isTrainerFlow ? user.id : null,
            created_by: user.id,
            assessment_date: opts.assessmentDate || new Date().toISOString().slice(0, 10),
            status: 'pending' as const,
        }

        const { data, error } = await supabase
            .from('body_photo_assessments')
            .insert(row)
            .select('id')
            .single()

        if (error) return { ok: false, error: error.message }
        const id = String((data as { id?: string } | null)?.id || '')
        if (!id) return { ok: false, error: 'create_failed' }

        try { trackUserEvent('body_photo_assessment_create', { type: 'assessment', metadata: { id, trainer: isTrainerFlow } }) } catch (e) { logError('createBodyPhotoAssessment.track', e) }
        return { ok: true, data: { id } }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

export async function listBodyPhotoAssessmentsMeta(): Promise<ActionResult<BodyPhotoAssessment[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return { ok: false, error: 'unauthorized' }

        const { data, error } = await supabase
            .from('body_photo_assessments')
            .select('*')
            .order('assessment_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(100)

        if (error) return { ok: false, error: error.message }
        return { ok: true, data: (data || []) as unknown as BodyPhotoAssessment[] }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

export async function deleteBodyPhotoAssessment(id: string): Promise<ActionResult> {
    try {
        const assessmentId = String(id || '').trim()
        if (!assessmentId) return { ok: false, error: 'missing id' }
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return { ok: false, error: 'unauthorized' }

        // Fotos somem por ON DELETE CASCADE; objetos do storage são limpos
        // pelo cron de órfãos (mesma estratégia dos outros buckets privados).
        const { error } = await supabase
            .from('body_photo_assessments')
            .delete()
            .eq('id', assessmentId)

        if (error) return { ok: false, error: error.message }
        try { trackUserEvent('body_photo_assessment_delete', { type: 'assessment', metadata: { id: assessmentId } }) } catch (e) { logError('deleteBodyPhotoAssessment.track', e) }
        return { ok: true, data: undefined }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}
