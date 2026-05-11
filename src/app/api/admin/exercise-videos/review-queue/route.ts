/**
 * GET  /api/admin/exercise-videos/review-queue
 *      → retorna vídeos pendentes de revisão humana (status='pending')
 *        agrupados por exercício, com top 3 candidatos cada
 *
 * POST /api/admin/exercise-videos/review-queue
 *      → aprovar/rejeitar candidato
 *      Body: { video_id, action: 'approve' | 'reject' }
 *
 * Quando aprova:
 *   - Aquele video vira status='approved', is_primary=true
 *   - Os outros candidatos do mesmo exercício são marcados 'rejected'
 *   - exercise_library.video_url é atualizado
 *
 * Quando rejeita:
 *   - Aquele video específico vira 'rejected', is_primary=false
 *   - Os irmãos continuam pending (não cascateia)
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

interface QueueCandidate {
  id: string
  url: string
  title: string
  channel_title: string
  provider_video_id: string
  quality_score: number | null
  score_breakdown: { reason?: string } | null
}

interface QueueExercise {
  exercise_library_id: string
  exercise_name: string
  candidates: QueueCandidate[]
}

export async function GET(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin'])
    if (!auth.ok) return auth.response

    const admin = createAdminClient()

    const { data: videos, error } = await admin
      .from('exercise_videos')
      .select('id, exercise_library_id, url, title, channel_title, provider_video_id, quality_score, score_breakdown')
      .eq('status', 'pending')
      .order('quality_score', { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    // Buscar nomes dos exercícios
    const exerciseIds = Array.from(new Set((videos || []).map(v => String((v as { exercise_library_id?: string }).exercise_library_id || '')).filter(Boolean)))
    const { data: libRows } = await admin
      .from('exercise_library')
      .select('id, display_name_pt')
      .in('id', exerciseIds)
    const nameById = new Map<string, string>()
    for (const r of libRows || []) {
      const id = String((r as { id?: string }).id || '')
      const name = String((r as { display_name_pt?: string }).display_name_pt || '')
      if (id) nameById.set(id, name)
    }

    // Agrupa por exercício
    const grouped = new Map<string, QueueExercise>()
    for (const v of videos || []) {
      const exId = String((v as { exercise_library_id?: string }).exercise_library_id || '')
      if (!exId) continue
      if (!grouped.has(exId)) {
        grouped.set(exId, {
          exercise_library_id: exId,
          exercise_name: nameById.get(exId) || 'Exercício',
          candidates: [],
        })
      }
      const item = v as Record<string, unknown>
      grouped.get(exId)!.candidates.push({
        id: String(item.id || ''),
        url: String(item.url || ''),
        title: String(item.title || ''),
        channel_title: String(item.channel_title || ''),
        provider_video_id: String(item.provider_video_id || ''),
        quality_score: typeof item.quality_score === 'number' ? item.quality_score : (item.quality_score ? Number(item.quality_score) : null),
        score_breakdown: (item.score_breakdown && typeof item.score_breakdown === 'object') ? item.score_breakdown as { reason?: string } : null,
      })
    }

    return NextResponse.json({
      ok: true,
      groups: Array.from(grouped.values()),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

const ActionSchema = z.object({
  video_id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
}).strip()

export async function POST(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin'])
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, ActionSchema)
    if (parsedBody.response) return parsedBody.response
    const { video_id, action } = parsedBody.data!

    const admin = createAdminClient()

    // Pega o vídeo + exercise_library_id pra propagar
    const { data: video, error: getErr } = await admin
      .from('exercise_videos')
      .select('id, exercise_library_id, url')
      .eq('id', video_id)
      .maybeSingle()
    if (getErr || !video) {
      return NextResponse.json({ ok: false, error: 'video_not_found' }, { status: 404 })
    }
    const exId = String((video as { exercise_library_id?: string }).exercise_library_id || '')
    const url = String((video as { url?: string }).url || '')

    if (action === 'approve') {
      // 1. Marca esse como approved+primary
      const nowIso = new Date().toISOString()
      await admin
        .from('exercise_videos')
        .update({ status: 'approved', is_primary: true, approved_at: nowIso })
        .eq('id', video_id)
      // 2. Marca irmãos como rejected (não primary)
      if (exId) {
        await admin
          .from('exercise_videos')
          .update({ status: 'rejected', is_primary: false })
          .eq('exercise_library_id', exId)
          .eq('status', 'pending')
          .neq('id', video_id)
        // 3. Atualiza exercise_library.video_url
        if (url) {
          await admin.from('exercise_library').update({ video_url: url }).eq('id', exId)
        }
      }
      return NextResponse.json({ ok: true, action: 'approved' })
    }

    // reject: só esse
    await admin
      .from('exercise_videos')
      .update({ status: 'rejected', is_primary: false })
      .eq('id', video_id)
    return NextResponse.json({ ok: true, action: 'rejected' })
  } catch (e) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
