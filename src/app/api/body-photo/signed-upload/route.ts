/**
 * API: POST /api/body-photo/signed-upload
 *
 * Minta um signed upload URL pro bucket PRIVADO body-photos e registra (upsert)
 * a linha da foto em body_photo_assessment_photos. O cliente faz o PUT do
 * arquivo com uploadToSignedUrl(path, token, file).
 *
 * Acesso: dono (user_id) OU personal (trainer_id) da avaliação. Checagem
 * explícita porque usamos admin client (service role bypassa RLS).
 *
 * Path: {assessed_user_id}/{assessmentId}/{pose}.jpg — sempre sob o prefixo do
 * AVALIADO (não de quem sobe), pra casar com o RLS de prefixo do storage e com
 * o signing de leitura.
 *
 * Rate limit: 30 req/min por usuário (3 fotos × algumas tentativas).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { BODY_PHOTO_POSES } from '@/types/bodyPhotoAssessment'

export const dynamic = 'force-dynamic'

const BUCKET = 'body-photos'

const BodySchema = z
    .object({
        assessmentId: z.string().uuid(),
        pose: z.enum(BODY_PHOTO_POSES),
        width: z.number().int().positive().max(20000).nullable().optional(),
        height: z.number().int().positive().max(20000).nullable().optional(),
        fileSize: z.number().int().positive().max(25 * 1024 * 1024).nullable().optional(),
        mimeType: z.string().max(80).nullable().optional(),
    })
    .strip()

export async function POST(request: Request) {
    try {
        const auth = await requireUser()
        if (!auth.ok) return auth.response
        const userId = String(auth.user.id || '').trim()

        const ip = getRequestIp(request)
        const rl = await checkRateLimitAsync(`body-photo:upload:${userId}:${ip}`, 30, 60_000)
        if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

        const parsed = await parseJsonBody(request, BodySchema)
        if (parsed.response) return parsed.response
        const { assessmentId, pose, width, height, fileSize, mimeType } = parsed.data!

        const admin = createAdminClient()

        // Access check: dono ou personal da avaliação
        const { data: assessment, error: aErr } = await admin
            .from('body_photo_assessments')
            .select('id, user_id, trainer_id')
            .eq('id', assessmentId)
            .maybeSingle()
        if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 400 })
        if (!assessment) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

        const assessedUserId = String((assessment as { user_id?: string }).user_id || '')
        const trainerId = (assessment as { trainer_id?: string | null }).trainer_id || null
        if (userId !== assessedUserId && userId !== trainerId) {
            return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
        }

        const path = `${assessedUserId}/${assessmentId}/${pose}.jpg`

        const { data: signed, error: signErr } = await admin.storage
            .from(BUCKET)
            .createSignedUploadUrl(path, { upsert: true })
        if (signErr || !signed) {
            return NextResponse.json({ ok: false, error: signErr?.message || 'failed_to_sign' }, { status: 400 })
        }

        // Upsert da linha da foto (uma por pose por avaliação — UNIQUE constraint)
        const { error: upErr } = await admin
            .from('body_photo_assessment_photos')
            .upsert(
                {
                    assessment_id: assessmentId,
                    user_id: assessedUserId,
                    pose,
                    storage_path: path,
                    width: width ?? null,
                    height: height ?? null,
                    file_size: fileSize ?? null,
                    mime_type: mimeType ?? null,
                },
                { onConflict: 'assessment_id,pose' },
            )
        if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 })

        return NextResponse.json({ ok: true, path: signed.path, token: signed.token })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
    }
}
