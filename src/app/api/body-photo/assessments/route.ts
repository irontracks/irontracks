/**
 * API: GET /api/body-photo/assessments
 *   - sem ?id      → lista as avaliações acessíveis (dono OU personal),
 *                    com signed URL da foto de frente como thumbnail.
 *   - com ?id=UUID → detalhe de uma avaliação + todas as fotos com signed URLs.
 *
 * Bucket body-photos é PRIVADO: toda leitura de imagem passa por signed URL
 * mintada aqui (admin) após checagem de acesso. Foto de corpo nunca é pública.
 */
import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { canCoachStudent, listCoachedStudentIds } from '@/utils/auth/studentAccess'
import { createAdminClient } from '@/utils/supabase/admin'
import { filterVisibleAssessments } from '@/utils/bodyPhoto/listAccess'
import { getErrorMessage } from '@/utils/errorMessage'
import { respondDbError } from '@/utils/api/dbError'
import type { BodyPhotoAssessment, BodyPhotoAssessmentPhoto } from '@/types/bodyPhotoAssessment'

export const dynamic = 'force-dynamic'

const BUCKET = 'body-photos'
const SIGNED_TTL = 60 * 60 // 1h

export async function GET(request: Request) {
    try {
        const auth = await requireUser()
        if (!auth.ok) return auth.response
        const userId = String(auth.user.id || '').trim()

        const url = new URL(request.url)
        const id = (url.searchParams.get('id') || '').trim()
        const admin = createAdminClient()

        // ── Detalhe ──────────────────────────────────────────────────────────
        if (id) {
            const { data: assessment, error } = await admin
                .from('body_photo_assessments')
                .select('*')
                .eq('id', id)
                .maybeSingle()
            if (error) return respondDbError('body-photo:assessments:detail', error)
            if (!assessment) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

            const a = assessment as unknown as BodyPhotoAssessment
            // Gate por VÍNCULO REAL (canCoachStudent), não por a.trainer_id — que é
            // auto-declarável por quem cria a linha. Mesmo gate das rotas de IA desta
            // feature (correção da brecha de dados de saúde, 2026-07-11).
            if (userId !== a.user_id && !(await canCoachStudent({ id: userId, email: auth.user.email }, a.user_id))) {
                return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
            }

            const { data: photos } = await admin
                .from('body_photo_assessment_photos')
                .select('*')
                .eq('assessment_id', id)

            const photoRows = (photos || []) as unknown as BodyPhotoAssessmentPhoto[]
            const withUrls = await Promise.all(
                photoRows.map(async (p) => {
                    const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(p.storage_path, SIGNED_TTL)
                    return { ...p, signedUrl: s?.signedUrl ?? null }
                }),
            )

            return NextResponse.json({ ok: true, assessment: a, photos: withUrls })
        }

        // ── Lista ────────────────────────────────────────────────────────────
        // A pré-filtragem no banco recorta pelos DONOS possíveis (self + alunos com
        // vínculo vivo); `filterVisibleAssessments` aplica a regra completa da RLS
        // — ver utils/bodyPhoto/listAccess.ts pro porquê de cada metade.
        const coachedUserIds = await listCoachedStudentIds(userId)
        const { data: rows, error } = await admin
            .from('body_photo_assessments')
            .select('*')
            .in('user_id', [userId, ...coachedUserIds])
            .order('assessment_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(100)
        if (error) return respondDbError('body-photo:assessments:list', error)

        const list = filterVisibleAssessments(
            (rows || []) as unknown as BodyPhotoAssessment[],
            userId,
            coachedUserIds,
        )
        if (list.length === 0) return NextResponse.json({ ok: true, assessments: [] })

        // Thumbnail = foto de frente de cada avaliação
        const ids = list.map((a) => a.id)
        const { data: fronts } = await admin
            .from('body_photo_assessment_photos')
            .select('assessment_id, storage_path')
            .in('assessment_id', ids)
            .eq('pose', 'front')

        const thumbByAssessment = new Map<string, string>()
        const frontRows = (fronts || []) as Array<{ assessment_id: string; storage_path: string }>
        await Promise.all(
            frontRows.map(async (f) => {
                const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(f.storage_path, SIGNED_TTL)
                if (s?.signedUrl) thumbByAssessment.set(f.assessment_id, s.signedUrl)
            }),
        )

        const withThumbs = list.map((a) => ({ ...a, thumbnailUrl: thumbByAssessment.get(a.id) ?? null }))
        return NextResponse.json({ ok: true, assessments: withThumbs })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
    }
}
